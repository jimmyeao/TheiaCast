using System.Security.Claims;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TheiaCast.Api;
using TheiaCast.Api.Contracts;
using Microsoft.Extensions.Configuration;
using System.IdentityModel.Tokens.Jwt;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.Http.Features;
using Serilog;
using OtpNet;

var builder = WebApplication.CreateBuilder(args);

// Configure Kestrel for large uploads (2.5GB) and robust streaming
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 2560L * 1024 * 1024; // 2.5 GB
    // Prevent timeouts during long video streams
    options.Limits.KeepAliveTimeout = TimeSpan.FromMinutes(10);
    options.Limits.RequestHeadersTimeout = TimeSpan.FromMinutes(5);
    // Allow unlimited response rate (don't throttle downloads)
    options.Limits.MinResponseDataRate = null;
});

// Configure FormOptions for large multipart uploads
builder.Services.Configure<FormOptions>(options =>
{
    options.ValueLengthLimit = int.MaxValue;
    options.MultipartBodyLengthLimit = 2560L * 1024 * 1024; // 2.5 GB
    options.MemoryBufferThreshold = 10 * 1024 * 1024; // 10 MB buffer before writing to disk
});

// Bind to all interfaces on port 5001 by default
// builder.WebHost.UseUrls("http://0.0.0.0:5001");

builder.Host.UseSerilog((ctx, lc) => lc.ReadFrom.Configuration(ctx.Configuration)
    .WriteTo.Console());

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
  .AddJwtBearer(o =>
  {
      var secret = builder.Configuration["Jwt:Secret"] ?? "dev-secret-key";
      o.TokenValidationParameters = new TokenValidationParameters
      {
          ValidateIssuer = true,
          ValidateAudience = true,
          ValidateLifetime = true,
          ValidateIssuerSigningKey = true,
          ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "pds",
          ValidAudience = builder.Configuration["Jwt:Audience"] ?? "pds-clients",
          IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret))
      };
  });

builder.Services.AddAuthorization();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHealthChecks();

// CORS for frontend dev server
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendDev", policy =>
    {
        policy.WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
    
    // Broad dev policy: allow any origin for rapid iteration
    options.AddPolicy("DevAll", policy =>
    {
          policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.AddDbContext<PdsDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default") ??
        "Host=localhost;Port=5432;Database=pds;Username=postgres;Password=postgres"));

builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IDeviceService, DeviceService>();
builder.Services.AddScoped<IPlaylistService, PlaylistService>();
builder.Services.AddScoped<IScreenshotService, ScreenshotService>();
builder.Services.AddScoped<ISlideshowService, SlideshowService>();
builder.Services.AddScoped<IVideoService, VideoService>();
builder.Services.AddScoped<ILogService, LogService>();
builder.Services.AddScoped<ISettingsService, SettingsService>();
builder.Services.AddScoped<IBroadcastService, BroadcastService>();
builder.Services.AddScoped<ILicenseService, LicenseService>();
builder.Services.AddHostedService<LogCleanupService>();
builder.Services.AddHostedService<LicenseValidationBackgroundService>();

var app = builder.Build();
var cfg = builder.Configuration;

app.UseSerilogRequestLogging();

// Ensure wwwroot exists and serve static files
var webRoot = app.Environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
if (!Directory.Exists(webRoot))
{
    Directory.CreateDirectory(webRoot);
}

// Configure static files with proper MIME types and caching
var provider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
provider.Mappings[".mp4"] = "video/mp4";
provider.Mappings[".m4v"] = "video/mp4";

app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = provider,
    OnPrepareResponse = ctx =>
    {
        // Cache static assets for 1 year (since we use unique GUIDs for folders)
        // This helps video playback significantly by allowing the browser to cache the file
        ctx.Context.Response.Headers.Append("Cache-Control", "public,max-age=31536000,immutable");
    }
});

app.UseSwagger();
app.UseSwaggerUI();
// Apply CORS before auth/authorization so preflights and failures still include CORS headers
 // Prefer permissive CORS in dev; fallback to Frontend policy
 app.UseCors("DevAll");
app.UseAuthentication();
app.UseAuthorization();

// Ensure Devices.Token column exists for persistent tokens
using (var scope = app.Services.CreateScope())
{
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<PdsDbContext>();
        
        // Ensure the database and tables exist
        db.Database.EnsureCreated();

        db.Database.ExecuteSqlRaw("ALTER TABLE \"Devices\" ADD COLUMN IF NOT EXISTS \"Token\" text;");
        db.Database.ExecuteSqlRaw("CREATE UNIQUE INDEX IF NOT EXISTS \"IX_Devices_DeviceId_unique\" ON \"Devices\"(\"DeviceId\");");
        // Ensure new PlaylistItem columns exist
        db.Database.ExecuteSqlRaw("ALTER TABLE \"PlaylistItems\" ADD COLUMN IF NOT EXISTS \"ContentId\" int;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"PlaylistItems\" ADD COLUMN IF NOT EXISTS \"OrderIndex\" int;");
        // Ensure Content.DefaultDuration column exists
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Content\" ADD COLUMN IF NOT EXISTS \"DefaultDuration\" int;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"PlaylistItems\" ADD COLUMN IF NOT EXISTS \"TimeWindowStart\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"PlaylistItems\" ADD COLUMN IF NOT EXISTS \"TimeWindowEnd\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"PlaylistItems\" ADD COLUMN IF NOT EXISTS \"DaysOfWeek\" text;");

        // Backfill missing ContentId by matching URL to Content table
        db.Database.ExecuteSqlRaw("UPDATE \"PlaylistItems\" pi\n" +
            "    SET \"ContentId\" = c.\"Id\"\n" +
            "    FROM \"Content\" c\n" +
            "    WHERE pi.\"ContentId\" IS NULL AND pi.\"Url\" IS NOT NULL AND c.\"Url\" = pi.\"Url\";");

        // Backfill missing OrderIndex with row_number per playlist
                db.Database.ExecuteSqlRaw("WITH ranked AS (\n" +
                        "      SELECT \"Id\", \"PlaylistId\",\n" +
                        "             ROW_NUMBER() OVER (PARTITION BY \"PlaylistId\" ORDER BY \"Id\") - 1 AS rn\n" +
                        "      FROM \"PlaylistItems\"\n" +
                        "      WHERE \"OrderIndex\" IS NULL\n" +
                        ")\n" +
                        "UPDATE \"PlaylistItems\" pi\n" +
                        "SET \"OrderIndex\" = r.rn\n" +
                        "FROM ranked r\n" +
                        "WHERE pi.\"Id\" = r.\"Id\" AND pi.\"PlaylistId\" = r.\"PlaylistId\";");

        // Add auto-authentication columns to Content table
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Content\" ADD COLUMN IF NOT EXISTS \"UsernameSelector\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Content\" ADD COLUMN IF NOT EXISTS \"PasswordSelector\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Content\" ADD COLUMN IF NOT EXISTS \"SubmitSelector\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Content\" ADD COLUMN IF NOT EXISTS \"Username\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Content\" ADD COLUMN IF NOT EXISTS \"Password\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Content\" ADD COLUMN IF NOT EXISTS \"AutoLogin\" boolean DEFAULT false;");

        // Add display configuration columns to Devices table
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Devices\" ADD COLUMN IF NOT EXISTS \"DisplayWidth\" int;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Devices\" ADD COLUMN IF NOT EXISTS \"DisplayHeight\" int;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Devices\" ADD COLUMN IF NOT EXISTS \"KioskMode\" boolean;");

        // Create Users table
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""Users"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""Username"" text NOT NULL UNIQUE,
                ""PasswordHash"" text NOT NULL
            );");

        // Add MFA columns to Users table
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Users\" ADD COLUMN IF NOT EXISTS \"MfaSecret\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Users\" ADD COLUMN IF NOT EXISTS \"IsMfaEnabled\" boolean DEFAULT false;");

        // Add user management columns to Users table
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Users\" ADD COLUMN IF NOT EXISTS \"Email\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Users\" ADD COLUMN IF NOT EXISTS \"DisplayName\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Users\" ADD COLUMN IF NOT EXISTS \"LastLoginAt\" timestamp;");
        db.Database.ExecuteSqlRaw("CREATE UNIQUE INDEX IF NOT EXISTS \"IX_Users_Email_unique\" ON \"Users\"(\"Email\") WHERE \"Email\" IS NOT NULL;");

        // Seed default admin user if not exists (password: admin)
        // SHA256 hash of 'admin' is 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918
        var userCount = db.Database.SqlQueryRaw<int>("SELECT COUNT(*) as \"Value\" FROM \"Users\"").AsEnumerable().FirstOrDefault();
        if (userCount == 0)
        {
            db.Database.ExecuteSqlRaw(@"
                INSERT INTO ""Users"" (""Username"", ""PasswordHash"") 
                VALUES ('admin', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918');");
        }

        // Add MFA columns to Users table
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Users\" ADD COLUMN IF NOT EXISTS \"MfaSecret\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Users\" ADD COLUMN IF NOT EXISTS \"IsMfaEnabled\" boolean DEFAULT false;");

        // Create DeviceBroadcastStates table for broadcast tracking
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""DeviceBroadcastStates"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""DeviceId"" int NOT NULL,
                ""OriginalPlaylistId"" int,
                ""BroadcastUrl"" text NOT NULL,
                ""StartedAt"" timestamp NOT NULL
            );
        ");

        // Create Logs table for server-side logging
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""Logs"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""Timestamp"" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ""Level"" text NOT NULL DEFAULT 'Info',
                ""Message"" text NOT NULL,
                ""DeviceId"" text,
                ""Source"" text,
                ""StackTrace"" text,
                ""AdditionalData"" text
            );
            CREATE INDEX IF NOT EXISTS ""IX_Logs_Timestamp"" ON ""Logs""(""Timestamp"" DESC);
            CREATE INDEX IF NOT EXISTS ""IX_Logs_DeviceId"" ON ""Logs""(""DeviceId"");
            CREATE INDEX IF NOT EXISTS ""IX_Logs_Level"" ON ""Logs""(""Level"");
        ");

        // Create AppSettings table for application configuration
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""AppSettings"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""Key"" text NOT NULL UNIQUE,
                ""Value"" text NOT NULL,
                ""UpdatedAt"" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        ");

        // Initialize default settings if not exists
        db.Database.ExecuteSqlRaw(@"
            INSERT INTO ""AppSettings"" (""Key"", ""Value"", ""UpdatedAt"")
            VALUES ('LogRetentionDays', '7', CURRENT_TIMESTAMP)
            ON CONFLICT (""Key"") DO NOTHING;
        ");

        // Create Broadcasts table for system-wide broadcasts
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""Broadcasts"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""Type"" text NOT NULL,
                ""Url"" text,
                ""Message"" text,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAt"" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ""EndedAt"" timestamp
            );
            CREATE INDEX IF NOT EXISTS ""IX_Broadcasts_IsActive"" ON ""Broadcasts""(""IsActive"");
            CREATE INDEX IF NOT EXISTS ""IX_Broadcasts_CreatedAt"" ON ""Broadcasts""(""CreatedAt"" DESC);
        ");

        // Create Licenses table for licensing system
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""Licenses"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""Key"" text NOT NULL UNIQUE,
                ""KeyHash"" text NOT NULL UNIQUE,
                ""Tier"" text NOT NULL DEFAULT 'free',
                ""MaxDevices"" int NOT NULL DEFAULT 3,
                ""CurrentDeviceCount"" int DEFAULT 0,
                ""CompanyName"" text,
                ""ContactEmail"" text,
                ""IsActive"" boolean DEFAULT true,
                ""ExpiresAt"" timestamp,
                ""ActivatedAt"" timestamp,
                ""CreatedAt"" timestamp DEFAULT CURRENT_TIMESTAMP,
                ""LastValidatedAt"" timestamp,
                ""Notes"" text
            );
        ");

        // Create LicenseViolations table for grace period tracking
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""LicenseViolations"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""LicenseId"" int,
                ""ViolationType"" text NOT NULL,
                ""DeviceCount"" int NOT NULL,
                ""MaxAllowed"" int NOT NULL,
                ""DetectedAt"" timestamp DEFAULT CURRENT_TIMESTAMP,
                ""GracePeriodEndsAt"" timestamp NOT NULL,
                ""Resolved"" boolean DEFAULT false
            );
        ");

        // Add license columns to Devices
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Devices\" ADD COLUMN IF NOT EXISTS \"LicenseId\" int;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Devices\" ADD COLUMN IF NOT EXISTS \"LicenseActivatedAt\" timestamp;");

        // Create default free license (auto-assigned to first 3 devices)
        var freeLicenseExists = db.Database.SqlQueryRaw<int>(
            "SELECT COUNT(*) as \"Value\" FROM \"Licenses\" WHERE \"Tier\" = 'free'"
        ).AsEnumerable().FirstOrDefault();

        if (freeLicenseExists == 0)
        {
            db.Database.ExecuteSqlRaw(@"
                INSERT INTO ""Licenses"" (""Key"", ""KeyHash"", ""Tier"", ""MaxDevices"", ""IsActive"", ""CompanyName"")
                VALUES ('FREE-TIER', 'free-tier-hash', 'free', 3, true, 'Default Free License');
            ");
        }

        // Generate and store installation key (HMAC secret) if not exists
        var installationKey = await db.AppSettings
            .FirstOrDefaultAsync(s => s.Key == "InstallationKey");

        if (installationKey == null)
        {
            // Generate a cryptographically secure 64-character random string
            var randomBytes = new byte[48]; // 48 bytes = 64 base64 characters
            using (var rng = System.Security.Cryptography.RandomNumberGenerator.Create())
            {
                rng.GetBytes(randomBytes);
            }
            var generatedKey = Convert.ToBase64String(randomBytes);

            db.AppSettings.Add(new AppSettings
            {
                Key = "InstallationKey",
                Value = generatedKey,
                UpdatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();

            Serilog.Log.Information("Generated new installation key for this TheiaCast instance");
        }

        // Assign all unassigned devices to free license
        var freeLicense = await db.Licenses.FirstOrDefaultAsync(l => l.Tier == "free");
        if (freeLicense != null)
        {
            var unassignedDevices = await db.Devices.Where(d => d.LicenseId == null).ToListAsync();
            if (unassignedDevices.Any())
            {
                foreach (var device in unassignedDevices)
                {
                    device.LicenseId = freeLicense.Id;
                    device.LicenseActivatedAt = DateTime.UtcNow;
                }

                freeLicense.CurrentDeviceCount = await db.Devices.CountAsync(d => d.LicenseId == freeLicense.Id);
                await db.SaveChangesAsync();

                Serilog.Log.Information($"Assigned {unassignedDevices.Count} unassigned devices to free license");
            }
        }
    }
    catch (Exception ex)
    {
        Serilog.Log.Warning(ex, "Startup schema ensure failed");
    }
}

app.MapHealthChecks("/health");
app.MapHealthChecks("/healthz");

// Auth endpoints
app.MapPost("/auth/register", async ([FromBody] RegisterDto dto, IAuthService auth, ILogger<Program> log) =>
{
    try
    {
        var res = await auth.RegisterAsync(dto);
        return Results.Ok(res);
    }
    catch (Exception ex)
    {
        log.LogError(ex, "Register failed");
        return Results.Problem(title: "Register failed", detail: ex.Message, statusCode: 500);
    }
}).AllowAnonymous();

app.MapPost("/auth/login", async ([FromBody] LoginDto dto, IAuthService auth, ILogger<Program> log) =>
{
    try
    {
        var res = await auth.LoginAsync(dto);
        return Results.Ok(res);
    }
    catch (Exception ex)
    {
        log.LogError(ex, "Login failed");
        return Results.Problem(title: "Login failed", detail: ex.Message, statusCode: 500);
    }
}).AllowAnonymous();

app.MapPost("/auth/refresh", async ([FromBody] RefreshDto dto, IAuthService auth, ILogger<Program> log) =>
{
    try
    {
        var res = await auth.RefreshAsync(dto);
        return Results.Ok(res);
    }
    catch (Exception ex)
    {
        log.LogError(ex, "Refresh failed");
        return Results.Problem(title: "Refresh failed", detail: ex.Message, statusCode: 500);
    }
}).AllowAnonymous();

app.MapPost("/auth/change-password", async ([FromBody] ChangePasswordDto dto, IAuthService auth, ClaimsPrincipal user, ILogger<Program> log) =>
{
    try
    {
        var username = user.Identity?.Name;
        if (string.IsNullOrEmpty(username)) return Results.Unauthorized();

        await auth.ChangePasswordAsync(username, dto.CurrentPassword, dto.NewPassword);
        return Results.Ok();
    }
    catch (Exception ex)
    {
        log.LogError(ex, "Change password failed");
        return Results.Problem(title: "Change password failed", detail: ex.Message, statusCode: 500);
    }
}).RequireAuthorization();

app.MapPost("/auth/mfa/setup", async (IAuthService auth, ClaimsPrincipal user, ILogger<Program> log) =>
{
    try
    {
        var username = user.Identity?.Name;
        if (string.IsNullOrEmpty(username)) return Results.Unauthorized();

        var res = await auth.SetupMfaAsync(username);
        return Results.Ok(res);
    }
    catch (Exception ex)
    {
        log.LogError(ex, "MFA setup failed");
        return Results.Problem(title: "MFA setup failed", detail: ex.Message, statusCode: 500);
    }
}).RequireAuthorization();

app.MapPost("/auth/mfa/enable", async ([FromBody] string code, IAuthService auth, ClaimsPrincipal user, ILogger<Program> log) =>
{
    try
    {
        var username = user.Identity?.Name;
        if (string.IsNullOrEmpty(username)) return Results.Unauthorized();

        await auth.EnableMfaAsync(username, code);
        return Results.Ok();
    }
    catch (Exception ex)
    {
        log.LogError(ex, "MFA enable failed");
        return Results.Problem(title: "MFA enable failed", detail: ex.Message, statusCode: 500);
    }
}).RequireAuthorization();

app.MapPost("/auth/mfa/disable", async (IAuthService auth, ClaimsPrincipal user, ILogger<Program> log) =>
{
    try
    {
        var username = user.Identity?.Name;
        if (string.IsNullOrEmpty(username)) return Results.Unauthorized();

        await auth.DisableMfaAsync(username);
        return Results.Ok();
    }
    catch (Exception ex)
    {
        log.LogError(ex, "MFA disable failed");
        return Results.Problem(title: "MFA disable failed", detail: ex.Message, statusCode: 500);
    }
}).RequireAuthorization();

app.MapGet("/auth/me", async (ClaimsPrincipal user, IAuthService auth) => await auth.MeAsync(user))
    .RequireAuthorization();

// User management endpoints
app.MapGet("/users", async (IUserService svc) =>
{
    try
    {
        var users = await svc.GetAllAsync();
        return Results.Ok(users);
    }
    catch (Exception ex)
    {
        return Results.Problem(title: "Failed to get users", detail: ex.Message, statusCode: 500);
    }
}).RequireAuthorization();

app.MapGet("/users/{id:int}", async (int id, IUserService svc) =>
{
    try
    {
        var user = await svc.GetByIdAsync(id);
        if (user == null) return Results.NotFound();
        return Results.Ok(user);
    }
    catch (Exception ex)
    {
        return Results.Problem(title: "Failed to get user", detail: ex.Message, statusCode: 500);
    }
}).RequireAuthorization();

app.MapPost("/users", async ([FromBody] CreateUserDto dto, IUserService svc) =>
{
    try
    {
        var user = await svc.CreateAsync(dto);
        return Results.Created($"/users/{user.Id}", user);
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
    catch (Exception ex)
    {
        return Results.Problem(title: "Failed to create user", detail: ex.Message, statusCode: 500);
    }
}).RequireAuthorization();

app.MapPatch("/users/{id:int}", async (int id, [FromBody] UpdateUserDto dto, IUserService svc) =>
{
    try
    {
        var user = await svc.UpdateAsync(id, dto);
        return Results.Ok(user);
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
    catch (Exception ex)
    {
        return Results.Problem(title: "Failed to update user", detail: ex.Message, statusCode: 500);
    }
}).RequireAuthorization();

app.MapDelete("/users/{id:int}", async (int id, ClaimsPrincipal principal, IUserService svc) =>
{
    try
    {
        // Get current user ID from claims
        var currentUsername = principal.Identity?.Name;
        if (currentUsername == null) return Results.Unauthorized();

        var currentUserIdClaim = principal.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        // If no NameIdentifier claim, we need to look up the user by username
        // This is a workaround since we don't have userId in the JWT claims
        // For now, we'll pass 0 and rely on username-based validation if needed
        // TODO: Add userId to JWT claims for better validation

        await svc.DeleteAsync(id, 0); // Note: Self-deletion check needs improvement
        return Results.NoContent();
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
    catch (Exception ex)
    {
        return Results.Problem(title: "Failed to delete user", detail: ex.Message, statusCode: 500);
    }
}).RequireAuthorization();

// License endpoints
// NOTE: License generation has been REMOVED from the API for security.
// Use the standalone LicenseGenerator tool (tools/LicenseGenerator) to generate licenses.
// Only the vendor should be able to generate licenses, not customers.

// Admin - List all licenses
app.MapGet("/licenses", async (ILicenseService svc) =>
{
    var licenses = await svc.GetAllLicensesAsync();
    return Results.Ok(licenses);
}).RequireAuthorization();

// Admin - Get license by ID
app.MapGet("/licenses/{id:int}", async (int id, ILicenseService svc) =>
{
    var license = await svc.GetLicenseByIdAsync(id);
    return license == null ? Results.NotFound() : Results.Ok(license);
}).RequireAuthorization();

// Admin - Update license
app.MapPatch("/licenses/{id:int}", async (int id, [FromBody] UpdateLicenseDto dto, ILicenseService svc) =>
{
    try
    {
        await svc.UpdateLicenseAsync(id, dto);
        return Results.Ok(new { message = "License updated successfully" });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
}).RequireAuthorization();

// Admin - Revoke license
app.MapDelete("/licenses/{id:int}", async (int id, ILicenseService svc) =>
{
    try
    {
        await svc.RevokeLicenseAsync(id);
        return Results.NoContent();
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
}).RequireAuthorization();

// Device - Activate license key
app.MapPost("/devices/{deviceId:int}/activate-license", async (int deviceId, [FromBody] ActivateLicenseDto dto, ILicenseService svc) =>
{
    try
    {
        var license = await svc.ActivateLicenseAsync(dto.LicenseKey, deviceId);
        return Results.Ok(new { message = "License activated successfully", license });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
}).RequireAuthorization();

// Get current license status (supports additive licensing - multiple active licenses)
app.MapGet("/license/status", async (ILicenseService svc, PdsDbContext db) =>
{
    var totalStatus = await svc.GetLicenseTotalStatusAsync();

    if (totalStatus.ActiveLicenses.Count == 0)
    {
        return Results.NotFound(new { error = "No active licenses found" });
    }

    // Get tier info - show all tiers if multiple licenses
    var tiers = totalStatus.ActiveLicenses.Select(l => l.Tier).Distinct().ToList();
    var tierDisplay = tiers.Count == 1 ? tiers[0] : string.Join(" + ", tiers);

    return Results.Ok(new
    {
        tier = tierDisplay,
        maxDevices = totalStatus.TotalMaxDevices,
        currentDevices = totalStatus.CurrentDevices,
        isValid = totalStatus.IsValid,
        isInGracePeriod = totalStatus.HasAnyGracePeriod,
        gracePeriodEndsAt = totalStatus.EarliestGracePeriodEnd,
        reason = totalStatus.Reason,
        activeLicenseCount = totalStatus.ActiveLicenses.Count
    });
}).RequireAuthorization();

// Get installation key (HMAC secret) for customer to provide when purchasing licenses
app.MapGet("/license/installation-key", async (PdsDbContext db) =>
{
    var installationKey = await db.AppSettings
        .FirstOrDefaultAsync(s => s.Key == "InstallationKey");

    if (installationKey == null)
        return Results.NotFound(new { error = "Installation key not found. Please restart the backend." });

    return Results.Ok(new
    {
        installationKey = installationKey.Value,
        generatedAt = installationKey.UpdatedAt
    });
}).RequireAuthorization();

// Get decoded license information (supports multiple licenses with additive licensing)
app.MapGet("/license/decoded", async (ILicenseService svc, PdsDbContext db) =>
{
    var totalStatus = await svc.GetLicenseTotalStatusAsync();

    if (totalStatus.ActiveLicenses.Count == 0)
    {
        return Results.Ok(new
        {
            hasLicense = false,
            message = "No active licenses found"
        });
    }

    // Build list of decoded license details
    var licenseDetails = new List<object>();

    foreach (var licenseInfo in totalStatus.ActiveLicenses)
    {
        var license = await db.Licenses.FindAsync(licenseInfo.Id);
        if (license == null) continue;

        var payload = await svc.DecodeLicenseKeyAsync(license.Key);

        if (payload == null)
        {
            // V1 license - no embedded metadata
            licenseDetails.Add(new
            {
                id = license.Id,
                version = 1,
                tier = license.Tier,
                maxDevices = license.MaxDevices,
                currentDevices = licenseInfo.CurrentDevices,
                expiresAt = license.ExpiresAt,
                companyName = license.CompanyName,
                isPerpetual = !license.ExpiresAt.HasValue,
                isExpired = license.ExpiresAt.HasValue && license.ExpiresAt.Value < DateTime.UtcNow,
                message = "V1 license - no embedded metadata"
            });
        }
        else
        {
            // V2 license - return decoded payload
            licenseDetails.Add(new
            {
                id = license.Id,
                version = 2,
                tier = payload.t,
                maxDevices = payload.d,
                currentDevices = licenseInfo.CurrentDevices,
                companyName = payload.c,
                expiresAt = payload.e,
                issuedAt = payload.i,
                isPerpetual = payload.IsPerpetual(),
                isExpired = payload.IsExpired()
            });
        }
    }

    return Results.Ok(new
    {
        hasLicense = true,
        totalMaxDevices = totalStatus.TotalMaxDevices,
        currentDevices = totalStatus.CurrentDevices,
        activeLicenseCount = totalStatus.ActiveLicenses.Count,
        licenses = licenseDetails
    });
}).RequireAuthorization();

// Debug endpoint: Check license key before activation
app.MapPost("/license/debug/check-key", async ([FromBody] DebugLicenseKeyDto dto, ILicenseService svc, PdsDbContext db) =>
{
    try
    {
        var installationKey = await db.AppSettings.FirstOrDefaultAsync(s => s.Key == "InstallationKey");

        // Compute what the hash would be
        var computedHash = await ComputeLicenseKeyHashAsync(dto.LicenseKey, db);

        // Get all licenses to compare
        var allLicenses = await db.Licenses.ToListAsync();

        // Try to find the license by hash
        var licenseByHash = await svc.GetLicenseByKeyAsync(dto.LicenseKey);

        // Try to find by exact key match
        var licenseByKey = await db.Licenses.FirstOrDefaultAsync(l => l.Key == dto.LicenseKey);

        // Try to decode
        var payload = await svc.DecodeLicenseKeyAsync(dto.LicenseKey);

        return Results.Ok(new
        {
            inputKey = dto.LicenseKey,
            computedHash = computedHash,
            foundByHash = licenseByHash != null,
            foundByKey = licenseByKey != null,
            installationKeyInDatabase = installationKey?.Value,
            decoded = payload != null ? new {
                tier = payload.t,
                maxDevices = payload.d,
                company = payload.c,
                expires = payload.e,
                isExpired = payload.IsExpired(),
                isPerpetual = payload.IsPerpetual()
            } : null,
            totalLicensesInDatabase = allLicenses.Count,
            allLicenses = allLicenses.Select(l => new {
                id = l.Id,
                key = l.Key.Substring(0, Math.Min(20, l.Key.Length)) + "...",
                keyHash = l.KeyHash.Substring(0, 16) + "...",
                tier = l.Tier,
                isActive = l.IsActive,
                matchesInputHash = l.KeyHash == computedHash,
                matchesInputKey = l.Key == dto.LicenseKey
            }).ToList()
        });
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, stackTrace = ex.ToString() });
    }
}).RequireAuthorization();

// Activate license globally (for customer use)
app.MapPost("/license/activate", async ([FromBody] ActivateLicenseGlobalDto dto, ILicenseService svc, PdsDbContext db, ILogService logService, ILogger<Program> logger) =>
{
    try
    {
        if (string.IsNullOrWhiteSpace(dto.LicenseKey))
        {
            return Results.BadRequest(new { error = "License key is required" });
        }

        logger.LogInformation($"License activation attempt with key: {dto.LicenseKey.Substring(0, Math.Min(10, dto.LicenseKey.Length))}...");

        // Parse license key format: LK-{version}-{encoded}-{signature}
        // Note: encoded payload may contain hyphens (URL-safe base64)
        if (!dto.LicenseKey.StartsWith("LK-"))
        {
            return Results.BadRequest(new { error = "Invalid license key format - must start with LK-" });
        }

        var firstHyphen = dto.LicenseKey.IndexOf('-', 3); // After "LK-"
        if (firstHyphen == -1)
        {
            return Results.BadRequest(new { error = "Invalid license key format - no version" });
        }

        var versionStr = dto.LicenseKey.Substring(3, firstHyphen - 3);
        if (!int.TryParse(versionStr, out var version))
        {
            return Results.BadRequest(new { error = $"Invalid license version: {versionStr}" });
        }

        // Try to decode V2 license (with embedded metadata)
        var payload = await svc.DecodeLicenseKeyAsync(dto.LicenseKey);

        string tier;
        int maxDevices;
        string? companyName = null;
        DateTime? expiresAt = null;

        if (payload != null && version == 2)
        {
            // V2 license - extract metadata from embedded payload
            logger.LogInformation("V2 license detected - using embedded metadata");
            tier = payload.t;
            maxDevices = payload.d;
            companyName = payload.c;
            expiresAt = payload.GetExpiryDate();

            // Validate expiration
            if (payload.IsExpired())
            {
                return Results.BadRequest(new { error = $"License expired on {payload.e}" });
            }

            logger.LogInformation($"Decoded V2 license: Tier={tier}, MaxDevices={maxDevices}, Company={companyName ?? "N/A"}, Expires={expiresAt?.ToString("yyyy-MM-dd") ?? "Perpetual"}");
        }
        else if (version == 1)
        {
            // V1 license - parse from key format: LK-1-{tier}-{random}-{checksum}
            // or LK-1-{tier1}-{tier2}-{random}-{checksum} (e.g., PRO-10)
            logger.LogInformation("V1 license detected - parsing from key format");

            // Extract the part after "LK-1-"
            var v1Data = dto.LicenseKey.Substring(firstHyphen + 1);
            var v1Parts = v1Data.Split('-');

            if (v1Parts.Length < 3)
            {
                return Results.BadRequest(new { error = "Invalid V1 license format" });
            }

            // Check if it's a two-part tier (e.g., PRO-10)
            tier = v1Parts[0];
            if (v1Parts.Length >= 4 && int.TryParse(v1Parts[1], out _))
            {
                tier = $"{v1Parts[0]}-{v1Parts[1]}";
            }

            maxDevices = tier.ToUpper() switch
            {
                "PRO-10" => 10,
                "PRO-20" => 20,
                "PRO-50" => 50,
                "PRO-100" => 100,
                "ENTERPRISE" => 999,
                _ => throw new InvalidOperationException($"Unknown license tier: {tier}")
            };
        }
        else
        {
            return Results.BadRequest(new { error = $"Unsupported license version: {version}" });
        }

        // Check if license already exists in database (check by hash AND by key string)
        var existingLicense = await svc.GetLicenseByKeyAsync(dto.LicenseKey);

        // Also check by exact key match (in case hash mismatch due to different installation keys)
        var existingByKey = await db.Licenses.FirstOrDefaultAsync(l => l.Key == dto.LicenseKey);

        if (existingByKey != null && existingLicense == null)
        {
            logger.LogWarning("License key exists in database but hash doesn't match - possible installation key mismatch");
            return Results.BadRequest(new {
                error = "License key already exists but cannot be verified. This may indicate an installation key mismatch.",
                hint = "If you regenerated the installation key, you may need to delete the old license record first."
            });
        }

        License license;

        if (existingLicense == null && existingByKey == null)
        {
            // License doesn't exist in database yet - create it
            logger.LogInformation($"License not found in database, creating new license record");

            // Compute the hash to validate the license key
            var keyHash = await ComputeLicenseKeyHashAsync(dto.LicenseKey, db);

            // Create new license
            license = new License
            {
                Key = dto.LicenseKey,
                KeyHash = keyHash,
                Tier = tier.ToLower(),
                MaxDevices = maxDevices,
                CompanyName = companyName,
                ExpiresAt = expiresAt,
                IsActive = true,
                ActivatedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow
            };

            try
            {
                db.Licenses.Add(license);
                await db.SaveChangesAsync();
                logger.LogInformation($"Created new license: Tier={license.Tier}, MaxDevices={license.MaxDevices}, Expires={license.ExpiresAt?.ToString("yyyy-MM-dd") ?? "Perpetual"}");
            }
            catch (Exception ex)
            {
                logger.LogError(ex, $"Failed to save new license: {ex.Message}");

                // Get the deepest inner exception for better diagnostics
                var innerMost = ex;
                while (innerMost.InnerException != null)
                    innerMost = innerMost.InnerException;

                return Results.BadRequest(new {
                    error = "Failed to save license to database",
                    message = ex.Message,
                    innerError = innerMost.Message,
                    expiresAt = license.ExpiresAt?.ToString("o"), // ISO 8601 format
                    expiresAtKind = license.ExpiresAt?.Kind.ToString()
                });
            }
        }
        else
        {
            // License already exists in database
            license = existingLicense ?? existingByKey!;
            logger.LogInformation($"License already exists in database (ID: {license.Id}, Tier: {license.Tier}, Active: {license.IsActive})");

            if (!license.IsActive)
            {
                // Reactivate the license instead of returning error
                logger.LogInformation($"Reactivating inactive license {license.Id}");
                license.IsActive = true;
                license.ActivatedAt = DateTime.UtcNow;
            }

            if (license.ExpiresAt.HasValue && license.ExpiresAt.Value < DateTime.UtcNow)
            {
                return Results.BadRequest(new { error = "License has expired" });
            }
        }

        // Note: Additive licensing - multiple paid licenses can be active simultaneously
        // Total device allowance is the sum of all active licenses
        // We DON'T reassign existing devices - they stay on their current license
        // The new license just adds capacity to the total pool

        // Update device counts for all licenses
        var allLicenses = await db.Licenses.ToListAsync();
        foreach (var lic in allLicenses)
        {
            lic.CurrentDeviceCount = await db.Devices.CountAsync(d => d.LicenseId == lic.Id);
        }

        await db.SaveChangesAsync();

        // Calculate total allowance across all active licenses
        var totalStatus = await svc.GetLicenseTotalStatusAsync();

        await logService.AddLogAsync("Info",
            $"License activated: {license.Tier} (+{license.MaxDevices} devices). Total allowance: {totalStatus.TotalMaxDevices} devices",
            null, "LicenseService");

        return Results.Ok(new
        {
            message = $"License activated successfully! Added {license.MaxDevices} devices to your account.",
            addedLicense = new
            {
                tier = license.Tier,
                maxDevices = license.MaxDevices,
                expiresAt = license.ExpiresAt,
                companyName = license.CompanyName
            },
            totalStatus = new
            {
                totalMaxDevices = totalStatus.TotalMaxDevices,
                currentDevices = totalStatus.CurrentDevices,
                activeLicenseCount = totalStatus.ActiveLicenses.Count,
                availableDevices = totalStatus.TotalMaxDevices - totalStatus.CurrentDevices
            }
        });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, $"License activation exception: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message, details = ex.ToString() });
    }
}).RequireAuthorization();

// Helper function to compute license key hash
async Task<string> ComputeLicenseKeyHashAsync(string key, PdsDbContext db)
{
    var installationKey = await db.AppSettings.FirstOrDefaultAsync(s => s.Key == "InstallationKey");
    if (installationKey == null)
    {
        throw new InvalidOperationException("Installation key not found");
    }

    using var hmac = new System.Security.Cryptography.HMACSHA256(System.Text.Encoding.UTF8.GetBytes(installationKey.Value));
    var hash = hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes(key));
    return Convert.ToHexString(hash).ToLower();
}

// Devices endpoints
app.MapPost("/devices", async ([FromBody] CreateDeviceDto dto, IDeviceService svc) => await svc.CreateAsync(dto))
    .RequireAuthorization();
app.MapGet("/devices", async (IDeviceService svc) => await svc.FindAllAsync())
    .RequireAuthorization();
app.MapGet("/devices/{id:int}", async (int id, IDeviceService svc) => await svc.FindOneAsync(id))
    .RequireAuthorization();
app.MapGet("/devices/{id:int}/token", async (int id, IDeviceService svc) => await svc.GetTokenAsync(id))
    .RequireAuthorization();
app.MapPost("/devices/{id:int}/token/rotate", async (int id, IDeviceService svc) => await svc.RotateTokenAsync(id))
    .RequireAuthorization();
app.MapGet("/devices/{id:int}/logs", async (int id, int? limit, IDeviceService svc) => await svc.GetLogsAsync(id, limit ?? 100))
    .RequireAuthorization();
app.MapPatch("/devices/{id:int}", async (int id, [FromBody] UpdateDeviceDto dto, IDeviceService svc) => await svc.UpdateAsync(id, dto))
    .RequireAuthorization();
app.MapDelete("/devices/{id:int}", async (int id, IDeviceService svc) =>
{
    await svc.RemoveAsync(id);
    return Results.Ok(new { message = "Device deleted successfully" });
}).RequireAuthorization();

// Remote control endpoints
app.MapPost("/devices/{deviceId}/remote/click", async (string deviceId, [FromBody] RemoteClickRequest req) =>
{
    await RealtimeHub.SendToDevice(deviceId, "remote:click", new { x = req.X, y = req.Y, button = req.Button ?? "left" });
    return Results.Ok(new { message = "Click command sent", deviceId, x = req.X, y = req.Y });
}).RequireAuthorization();

app.MapPost("/devices/{deviceId}/remote/type", async (string deviceId, [FromBody] RemoteTypeRequest req) =>
{
    await RealtimeHub.SendToDevice(deviceId, "remote:type", new { text = req.Text, selector = req.Selector });
    return Results.Ok(new { message = "Type command sent", deviceId, textLength = req.Text.Length });
}).RequireAuthorization();

app.MapPost("/devices/{deviceId}/remote/key", async (string deviceId, [FromBody] RemoteKeyRequest req) =>
{
    await RealtimeHub.SendToDevice(deviceId, "remote:key", new { key = req.Key, modifiers = req.Modifiers });
    return Results.Ok(new { message = "Key command sent", deviceId, key = req.Key });
}).RequireAuthorization();

app.MapPost("/devices/{deviceId}/remote/scroll", async (string deviceId, [FromBody] RemoteScrollRequest req) =>
{
    await RealtimeHub.SendToDevice(deviceId, "remote:scroll", new { x = req.X, y = req.Y, deltaX = req.DeltaX, deltaY = req.DeltaY });
    return Results.Ok(new { message = "Scroll command sent", deviceId });
}).RequireAuthorization();

// Screencast control endpoints
app.MapPost("/devices/{deviceId}/screencast/start", async (string deviceId) =>
{
    await RealtimeHub.SendToDevice(deviceId, "screencast:start", new { });
    return Results.Ok(new { message = "Screencast start command sent", deviceId });
}).RequireAuthorization();

app.MapPost("/devices/{deviceId}/screencast/stop", async (string deviceId) =>
{
    await RealtimeHub.SendToDevice(deviceId, "screencast:stop", new { });
    return Results.Ok(new { message = "Screencast stop command sent", deviceId });
}).RequireAuthorization();

// Device control endpoints
app.MapPost("/devices/{deviceId}/restart", async (string deviceId) =>
{
    await RealtimeHub.SendToDevice(deviceId, "device:restart", new { });
    return Results.Ok(new { message = "Restart command sent", deviceId });
}).RequireAuthorization();

// Playlist control endpoints
app.MapPost("/devices/{deviceId}/playlist/pause", async (string deviceId) =>
{
    await RealtimeHub.SendToDevice(deviceId, "playlist:pause", new { });
    return Results.Ok(new { message = "Playlist pause command sent", deviceId });
}).RequireAuthorization();

app.MapPost("/devices/{deviceId}/playlist/resume", async (string deviceId) =>
{
    await RealtimeHub.SendToDevice(deviceId, "playlist:resume", new { });
    return Results.Ok(new { message = "Playlist resume command sent", deviceId });
}).RequireAuthorization();

app.MapPost("/devices/{deviceId}/playlist/next", async (string deviceId, bool? respectConstraints) =>
{
    await RealtimeHub.SendToDevice(deviceId, "playlist:next", new { respectConstraints = respectConstraints ?? true });
    return Results.Ok(new { message = "Playlist next command sent", deviceId });
}).RequireAuthorization();

app.MapPost("/devices/{deviceId}/playlist/previous", async (string deviceId, bool? respectConstraints) =>
{
    await RealtimeHub.SendToDevice(deviceId, "playlist:previous", new { respectConstraints = respectConstraints ?? true });
    return Results.Ok(new { message = "Playlist previous command sent", deviceId });
}).RequireAuthorization();

// Content endpoints
app.MapPost("/content", async ([FromBody] CreateContentDto dto, IPlaylistService svc) => await svc.CreateContentAsync(dto))
    .RequireAuthorization();
app.MapGet("/content", async (IPlaylistService svc) => await svc.GetAllContentAsync())
    .RequireAuthorization();
app.MapGet("/content/{id:int}", async (int id, IPlaylistService svc) => await svc.GetContentAsync(id))
    .RequireAuthorization();
app.MapPatch("/content/{id:int}", async (int id, [FromBody] UpdateContentDto dto, IPlaylistService svc) => await svc.UpdateContentAsync(id, dto))
    .RequireAuthorization();
app.MapDelete("/content/{id:int}", async (int id, IPlaylistService svc) =>
{
    await svc.RemoveContentAsync(id);
    return Results.Ok(new { message = "Content deleted successfully" });
}).RequireAuthorization();

// Slideshow endpoints
app.MapPost("/content/upload/pptx", async (HttpRequest request, ISlideshowService svc) =>
{
    if (!request.HasFormContentType)
        return Results.BadRequest("Invalid content type");

    var form = await request.ReadFormAsync();
    var file = form.Files["file"];
    var name = form["name"].ToString();
    var durationStr = form["durationPerSlide"].ToString();
    int.TryParse(durationStr, out int duration);
    if (duration <= 0) duration = 10000; // Default 10s

    if (file == null || file.Length == 0)
        return Results.BadRequest("No file uploaded");

    try
    {
        var content = await svc.ConvertAndCreateAsync(file, name, duration);
        return Results.Ok(content);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
}).RequireAuthorization().WithMetadata(new DisableRequestSizeLimitAttribute());

app.MapPost("/content/upload/video", async (HttpRequest request, IVideoService svc) =>
{
    if (!request.HasFormContentType)
        return Results.BadRequest("Invalid content type");

    var form = await request.ReadFormAsync();
    var file = form.Files["file"];
    var name = form["name"].ToString();

    if (file == null || file.Length == 0)
        return Results.BadRequest("No file uploaded");

    try
    {
        var content = await svc.ProcessAndCreateAsync(file, name);
        return Results.Ok(content);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
}).RequireAuthorization().WithMetadata(new DisableRequestSizeLimitAttribute());

app.MapGet("/api/render/slideshow/{storageId}", async (string storageId, [FromQuery] int duration, ISlideshowService svc) =>
{
    var html = await svc.GenerateViewerHtmlAsync(storageId, duration > 0 ? duration : 10000);
    return Results.Content(html, "text/html");
}).AllowAnonymous(); // Allow anonymous so devices can load it without auth headers (unless we add token to URL)

// Playlists endpoints
app.MapPost("/playlists", async ([FromBody] CreatePlaylistDto dto, IPlaylistService svc) => await svc.CreatePlaylistAsync(dto))
    .RequireAuthorization();
app.MapGet("/playlists", async (IPlaylistService svc) => await svc.GetPlaylistsAsync())
    .AllowAnonymous();
app.MapGet("/playlists/{id:int}", async (int id, IPlaylistService svc) => await svc.GetPlaylistAsync(id))
    .AllowAnonymous();
app.MapPatch("/playlists/{id:int}", async (int id, [FromBody] UpdatePlaylistDto dto, IPlaylistService svc) => await svc.UpdatePlaylistAsync(id, dto))
    .RequireAuthorization();
app.MapDelete("/playlists/{id:int}", async (int id, IPlaylistService svc) =>
{
    await svc.RemovePlaylistAsync(id);
    return Results.Ok(new { message = "Playlist deleted successfully" });
}).RequireAuthorization();

app.MapPost("/playlists/items", async ([FromBody] CreatePlaylistItemDto dto, IPlaylistService svc) => await svc.CreateItemAsync(dto))
    .RequireAuthorization();
app.MapGet("/playlists/{playlistId:int}/items", async (int playlistId, IPlaylistService svc) => await svc.GetItemsAsync(playlistId))
    .AllowAnonymous();
app.MapPatch("/playlists/items/{id:int}", async (int id, [FromBody] UpdatePlaylistItemDto dto, IPlaylistService svc) => await svc.UpdateItemAsync(id, dto))
    .RequireAuthorization();
app.MapDelete("/playlists/items/{id:int}", async (int id, IPlaylistService svc) =>
{
    var playlistId = await svc.RemoveItemAsync(id);
    return Results.Ok(new { message = "Playlist item deleted successfully" });
}).RequireAuthorization();

app.MapPost("/playlists/assign", async ([FromBody] AssignPlaylistDto dto, IPlaylistService svc) => await svc.AssignAsync(dto))
    .RequireAuthorization();
app.MapGet("/playlists/device/{deviceId:int}", async (int deviceId, IPlaylistService svc) => await svc.GetDevicePlaylistsAsync(deviceId))
    .RequireAuthorization();
app.MapGet("/playlists/{playlistId:int}/devices", async (int playlistId, IPlaylistService svc) => await svc.GetPlaylistDevicesAsync(playlistId))
    .RequireAuthorization();
app.MapDelete("/playlists/assign/device/{deviceId:int}/playlist/{playlistId:int}", async (int deviceId, int playlistId, IPlaylistService svc) =>
{
    await svc.UnassignAsync(deviceId, playlistId);
    return Results.Ok(new { message = "Playlist unassigned successfully" });
}).RequireAuthorization();

// Screenshots endpoints
app.MapGet("/screenshots/device/{deviceId}/latest", async (string deviceId, IScreenshotService svc) => await svc.GetLatestAsync(deviceId))
    .RequireAuthorization();
app.MapGet("/screenshots/device/{deviceId}", async (string deviceId, IScreenshotService svc) => await svc.GetByDeviceAsync(deviceId))
    .RequireAuthorization();
app.MapGet("/screenshots/{id}", async (int id, IScreenshotService svc) => await svc.GetByIdAsync(id))
    .RequireAuthorization();

// Logs endpoints
app.MapGet("/logs", async (ILogService svc, string? deviceId, string? level, DateTime? startDate, DateTime? endDate, int limit = 100, int offset = 0) =>
{
    var logs = await svc.GetLogsAsync(deviceId, level, startDate, endDate, limit, offset);
    return Results.Ok(logs);
}).RequireAuthorization();

app.MapPost("/logs", async ([FromBody] CreateLogRequest req, ILogService svc) =>
{
    await svc.AddLogAsync(req.Level, req.Message, req.DeviceId, req.Source, req.StackTrace, req.AdditionalData);
    return Results.Ok();
}).RequireAuthorization();

// Settings endpoints
app.MapGet("/settings", async (ISettingsService svc) =>
{
    var settings = await svc.GetAllSettingsAsync();
    return Results.Ok(settings);
}).RequireAuthorization();

app.MapGet("/settings/{key}", async (string key, ISettingsService svc) =>
{
    var value = await svc.GetSettingAsync(key);
    return value != null ? Results.Ok(new { key, value }) : Results.NotFound();
}).RequireAuthorization();

app.MapPut("/settings/{key}", async (string key, [FromBody] SetSettingRequest req, ISettingsService svc) =>
{
    await svc.SetSettingAsync(key, req.Value);
    return Results.Ok(new { key, value = req.Value });
}).RequireAuthorization();

// Broadcast endpoints
app.MapPost("/broadcast/start", async ([FromBody] StartBroadcastRequest req, IBroadcastService svc) =>
{
    var broadcast = await svc.StartBroadcastAsync(req.Type, req.Url, req.Message, req.Duration);
    return Results.Ok(broadcast);
}).RequireAuthorization();

app.MapPost("/broadcast/end", async (IBroadcastService svc) =>
{
    await svc.EndBroadcastAsync();
    return Results.Ok();
}).RequireAuthorization();

app.MapGet("/broadcast/active", async (IBroadcastService svc) =>
{
    var broadcast = await svc.GetActiveBroadcastAsync();
    return broadcast != null ? Results.Ok(broadcast) : Results.NotFound();
}).RequireAuthorization();

// WebSocket endpoint with event envelope
app.UseWebSockets();
app.Map("/ws", async context =>
{
    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }

    var token = context.Request.Query["token"].ToString();
    var deviceId = context.Request.Query["deviceId"].ToString();

    // Resolve deviceId from token if provided
    if (!string.IsNullOrEmpty(token) && string.IsNullOrEmpty(deviceId))
    {
        try
        {
            using var scope = context.RequestServices.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<PdsDbContext>();
            var device = await db.Devices.FirstOrDefaultAsync(d => d.Token == token);
            if (device != null)
            {
                deviceId = device.DeviceId;
            }
            else
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsync("unauthorized");
                return;
            }
        }
        catch
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsync("error");
            return;
        }
    }

    // Attach resolved deviceId for downstream handling
    if (!string.IsNullOrEmpty(deviceId))
    {
        context.Items["__resolvedDeviceId"] = deviceId;
    }

    var socket = await context.WebSockets.AcceptWebSocketAsync();
    await RealtimeHub.HandleAsync(context, socket);
});

app.Run();

// --- Minimal stub types & services ---
public record AuthResponse(string AccessToken, string RefreshToken);
public record RegisterDto(string Username, string Password);
public record LoginDto(string Username, string Password, string? MfaCode);
public record RefreshDto(string RefreshToken);
public record ChangePasswordDto(string CurrentPassword, string NewPassword);
public record MfaSetupResponse(string Secret, string QrCodeUri);
public record UserDto(
    int Id,
    string Username,
    [property: JsonPropertyName("isMfaEnabled")] bool IsMfaEnabled,
    string? Email,
    string? DisplayName,
    DateTime? LastLoginAt
);

// User management DTOs
public record CreateUserDto(string Username, string Password, string? Email, string? DisplayName);
public record UpdateUserDto(string? Email, string? DisplayName, string? Password);
public record UserListDto(int Id, string Username, string? Email, string? DisplayName, bool IsMfaEnabled, DateTime? LastLoginAt);

public record CreateDeviceDto(string DeviceId, string Name, string? Description, string? Location);
public record UpdateDeviceDto(string? Name, string? Description, string? Location, int? DisplayWidth, int? DisplayHeight, bool? KioskMode);
public record DeviceLogDto(int Id, string Message, DateTime Timestamp);

public record CreateContentDto(
    string Name,
    string Url,
    string? Description,
    bool? RequiresInteraction,
    string? ThumbnailUrl,
    string? UsernameSelector,
    string? PasswordSelector,
    string? SubmitSelector,
    string? Username,
    string? Password,
    bool? AutoLogin
);
public record UpdateContentDto(
    string? Name,
    string? Url,
    string? Description,
    bool? RequiresInteraction,
    string? ThumbnailUrl,
    string? UsernameSelector,
    string? PasswordSelector,
    string? SubmitSelector,
    string? Username,
    string? Password,
    bool? AutoLogin
);

public record CreatePlaylistDto(string Name, string? Description, bool? IsActive);
public record UpdatePlaylistDto(string? Name, string? Description, bool? IsActive);
public record CreatePlaylistItemDto(int PlaylistId, int ContentId, int DisplayDuration, int OrderIndex, string? TimeWindowStart, string? TimeWindowEnd, int[]? DaysOfWeek);
public record UpdatePlaylistItemDto(int? DisplayDuration, int? OrderIndex, string? TimeWindowStart, string? TimeWindowEnd, int[]? DaysOfWeek);
public record AssignPlaylistDto(int DeviceId, int PlaylistId);

public record RemoteClickRequest(int X, int Y, string? Button);
public record RemoteTypeRequest(string Text, string? Selector);
public record RemoteKeyRequest(string Key, string[]? Modifiers);
public record RemoteScrollRequest(int? X, int? Y, int? DeltaX, int? DeltaY);

public record BroadcastStartRequest(string[] DeviceIds, string Url, int? Duration);


// Removed duplicate DbContext; using TheiaCast.Api.PdsDbContext from Entities.cs

public static class RealtimeHub
{
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, System.Net.WebSockets.WebSocket> Devices = new();
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, System.Net.WebSockets.WebSocket> Admins = new();

    public static async Task HandleAsync(HttpContext ctx, System.Net.WebSockets.WebSocket ws)
    {
        var role = (ctx.Request.Query["role"].ToString() ?? "admin").ToLowerInvariant();
        var deviceId = ctx.Items.ContainsKey("__resolvedDeviceId")
            ? ctx.Items["__resolvedDeviceId"]?.ToString()
            : ctx.Request.Query["deviceId"].ToString();

        if (role == "device" && !string.IsNullOrEmpty(deviceId))
        {
            Devices[deviceId] = ws;
            Console.WriteLine($">>> RealtimeHub: Device '{deviceId}' connected. Total devices: {Devices.Count}");

            // Log device connection
            try
            {
                var logService = ctx.RequestServices.GetRequiredService<ILogService>();
                await logService.AddLogAsync("Info",
                    $"Device connected: {deviceId}",
                    deviceId,
                    "RealtimeHub");
            }
            catch { /* ignore logging errors */ }

            // Notify admins that device is online
            BroadcastAdmins("admin:device:connected", new { deviceId, timestamp = DateTime.UtcNow });
            BroadcastAdmins("admin:device:status", new { deviceId, status = "online", timestamp = DateTime.UtcNow });

            // On connect, push current assigned playlist content to the device
            try
            {
                var db = ctx.RequestServices.GetRequiredService<PdsDbContext>();
                var assigned = await db.DevicePlaylists.Where(x => x.DeviceId == db.Devices.Where(d => d.DeviceId == deviceId).Select(d => d.Id).FirstOrDefault())
                    .Select(x => x.PlaylistId)
                    .FirstOrDefaultAsync();
                if (assigned != 0)
                {
                    var items = await db.PlaylistItems.Where(i => i.PlaylistId == assigned)
                        .OrderBy(i => i.OrderIndex ?? i.Id)
                        .Select(i => new {
                            id = i.Id,
                            playlistId = i.PlaylistId,
                            contentId = i.ContentId,
                            displayDuration = (i.DurationSeconds ?? 0) * 1000,
                            orderIndex = i.OrderIndex ?? 0,
                            content = new { id = i.ContentId, name = i.Url, url = i.Url, requiresInteraction = false }
                        })
                        .ToListAsync();
                    await Send(ws, ServerToClientEvent.CONTENT_UPDATE, new { playlistId = assigned, items });
                }
            }
            catch (Exception ex)
            {
                // Log error
                try
                {
                    var logService = ctx.RequestServices.GetRequiredService<ILogService>();
                    await logService.AddLogAsync("Error",
                        $"Failed to push content on device connect: {ex.Message}",
                        deviceId,
                        "RealtimeHub");
                }
                catch { /* ignore logging errors */ }

                // swallow errors to avoid disconnect on startup
                BroadcastAdmins("admin:error", new { deviceId, error = "content_push_failed", detail = ex.Message, timestamp = DateTime.UtcNow });
            }
        }
        else
        {
            Admins[Guid.NewGuid().ToString()] = ws;
        }

        if (role == "admin")
        {
            await Send(ws, "admin:devices:sync", new { deviceIds = Devices.Keys.ToArray(), timestamp = DateTime.UtcNow });
        }

        var buffer = new byte[64 * 1024];
        try
        {
            while (ws.State == System.Net.WebSockets.WebSocketState.Open)
        {
            using var ms = new System.IO.MemoryStream();
            System.Net.WebSockets.WebSocketReceiveResult result;

            // Read all frames of the message
            do
            {
                result = await ws.ReceiveAsync(buffer: new ArraySegment<byte>(buffer), cancellationToken: CancellationToken.None);
                if (result.MessageType == System.Net.WebSockets.WebSocketMessageType.Close)
                {
                    await ws.CloseAsync(System.Net.WebSockets.WebSocketCloseStatus.NormalClosure, "closed", CancellationToken.None);
                    // Notify admins that device is offline
                    if (role == "device" && !string.IsNullOrEmpty(deviceId))
                    {
                        // Log device disconnection
                        try
                        {
                            var logService = ctx.RequestServices.GetRequiredService<ILogService>();
                            await logService.AddLogAsync("Info",
                                $"Device disconnected: {deviceId}",
                                deviceId,
                                "RealtimeHub");
                        }
                        catch { /* ignore logging errors */ }

                        BroadcastAdmins("admin:device:disconnected", new { deviceId, timestamp = DateTime.UtcNow });
                        BroadcastAdmins("admin:device:status", new { deviceId, status = "offline", timestamp = DateTime.UtcNow });
                        Devices.TryRemove(deviceId, out _);
                    }
                    return;
                }
                ms.Write(buffer, 0, result.Count);
            } while (!result.EndOfMessage);

            ms.Seek(0, System.IO.SeekOrigin.Begin);
            var json = Encoding.UTF8.GetString(ms.ToArray());
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var evt = doc.RootElement.GetProperty("event").GetString();
            var payload = doc.RootElement.GetProperty("payload");

            switch (evt)
            {
                case "device:register":
                    // Log device registration
                    try
                    {
                        var logService = ctx.RequestServices.GetRequiredService<ILogService>();
                        await logService.AddLogAsync("Info",
                            $"Device registered via WebSocket: {deviceId}",
                            deviceId,
                            "RealtimeHub");
                    }
                    catch { /* ignore logging errors */ }

                    // When a device registers, confirm online status to admins
                    BroadcastAdmins("admin:device:connected", new { deviceId, timestamp = DateTime.UtcNow });
                    BroadcastAdmins("admin:device:status", new { deviceId, status = "online", timestamp = DateTime.UtcNow });

                    try
                    {
                        var db = ctx.RequestServices.GetRequiredService<PdsDbContext>();

                        // FIRST: Send device's display configuration if set
                        // This ensures display is configured before content starts playing
                        var device = await db.Devices.FirstOrDefaultAsync(d => d.DeviceId == deviceId);
                        if (device != null)
                        {
                            Serilog.Log.Information($"Device config from DB: Width={device.DisplayWidth}, Height={device.DisplayHeight}, Kiosk={device.KioskMode}");
                            if (device.DisplayWidth.HasValue || device.DisplayHeight.HasValue || device.KioskMode.HasValue)
                            {
                                Serilog.Log.Information($"Sending config update to device {deviceId}");
                                await Send(ws, "config:update", new
                                {
                                    displayWidth = device.DisplayWidth,
                                    displayHeight = device.DisplayHeight,
                                    kioskMode = device.KioskMode
                                });
                                // Wait for display to restart with new config (restart takes ~4s)
                                await Task.Delay(6000);
                            }
                            else
                            {
                                Serilog.Log.Information($"Device {deviceId} has no custom display config set");
                            }
                        }

                        // SECOND: Push playlist content after display is configured
                        var assigned = await db.DevicePlaylists.Where(x => x.DeviceId == db.Devices.Where(d => d.DeviceId == deviceId).Select(d => d.Id).FirstOrDefault())
                            .Select(x => x.PlaylistId)
                            .FirstOrDefaultAsync();
                        if (assigned != 0)
                        {
                            var items = await db.PlaylistItems.Where(i => i.PlaylistId == assigned)
                                .OrderBy(i => i.OrderIndex ?? i.Id)
                                .Select(i => new {
                                    id = i.Id,
                                    playlistId = i.PlaylistId,
                                    contentId = i.ContentId,
                                    displayDuration = (i.DurationSeconds ?? 0) * 1000,
                                    orderIndex = i.OrderIndex ?? 0,
                                    content = new { id = i.ContentId, name = i.Url, url = i.Url, requiresInteraction = false }
                                })
                                .ToListAsync();
                            await Send(ws, ServerToClientEvent.CONTENT_UPDATE, new { playlistId = assigned, items });
                        }
                    }
                    catch (Exception ex)
                    {
                        // Log error
                        try
                        {
                            var logService = ctx.RequestServices.GetRequiredService<ILogService>();
                            await logService.AddLogAsync("Error",
                                $"Failed to push content on device register: {ex.Message}",
                                deviceId,
                                "RealtimeHub");
                        }
                        catch { /* ignore logging errors */ }

                        BroadcastAdmins("admin:error", new { deviceId, error = "content_push_failed", detail = ex.Message, timestamp = DateTime.UtcNow });
                    }
                    break;
                case "health:report":
                    BroadcastAdmins("admin:device:health", new { deviceId, health = payload, timestamp = DateTime.UtcNow });
                    break;
                case "device:status":
                    BroadcastAdmins("admin:device:status", new { deviceId, status = payload.GetProperty("status").GetString(), timestamp = DateTime.UtcNow });
                    break;
                case "error:report":
                    BroadcastAdmins("admin:error", new { deviceId, error = payload.GetProperty("error").GetString(), timestamp = DateTime.UtcNow });
                    break;
                case "screenshot:upload":
                    {
                        try
                        {
                            var imageData = payload.GetProperty("image").GetString() ?? "";
                            var currentUrl = payload.TryGetProperty("currentUrl", out var urlProp) ? urlProp.GetString() : null;

                            var db = ctx.RequestServices.GetRequiredService<PdsDbContext>();

                            var screenshot = new Screenshot
                            {
                                DeviceStringId = deviceId,
                                ImageBase64 = imageData,
                                CurrentUrl = currentUrl,
                                CreatedAt = DateTime.UtcNow
                            };

                            db.Screenshots.Add(screenshot);
                            await db.SaveChangesAsync();

                            BroadcastAdmins("admin:screenshot:received", new { deviceId, screenshotId = screenshot.Id, timestamp = DateTime.UtcNow });
                        }
                        catch (Exception ex)
                        {
                            // Log error
                            try
                            {
                                var logService = ctx.RequestServices.GetRequiredService<ILogService>();
                                await logService.AddLogAsync("Error",
                                    $"Failed to save screenshot: {ex.Message}",
                                    deviceId,
                                    "RealtimeHub");
                            }
                            catch { /* ignore logging errors */ }

                            BroadcastAdmins("admin:error", new { deviceId, error = "screenshot_save_failed", detail = ex.Message, timestamp = DateTime.UtcNow });
                        }
                    }
                    break;
                case "playback:state:update":
                    BroadcastAdmins("admin:playback:state", new { deviceId, state = payload, timestamp = DateTime.UtcNow });
                    break;
                case "screencast:frame":
                    // Forward live screencast frames to admin clients in real-time
                    BroadcastAdmins("admin:screencast:frame", new
                    {
                        deviceId,
                        data = payload.GetProperty("data").GetString(),
                        metadata = payload.GetProperty("metadata")
                    });
                    break;
            }
        }
        }
        catch (Exception ex)
        {
            // Log error
            try
            {
                var logService = ctx.RequestServices.GetRequiredService<ILogService>();
                await logService.AddLogAsync("Error",
                    $"WebSocket error for {role} {deviceId ?? "unknown"}: {ex.Message}",
                    deviceId,
                    "RealtimeHub");
            }
            catch { /* ignore logging errors */ }

            // Log the disconnection
            Serilog.Log.Information(ex, "WebSocket connection closed for {Role} {DeviceId}", role, deviceId ?? "unknown");
        }
        finally
        {
            // Clean up on disconnect (whether graceful or abrupt)
            if (role == "device" && !string.IsNullOrEmpty(deviceId))
            {
                Devices.TryRemove(deviceId, out _);
                BroadcastAdmins("admin:device:disconnected", new { deviceId, timestamp = DateTime.UtcNow });
                BroadcastAdmins("admin:device:status", new { deviceId, status = "offline", timestamp = DateTime.UtcNow });
                Serilog.Log.Information("Device {DeviceId} disconnected and marked offline", deviceId);
            }

            // Close the WebSocket if still open
            if (ws.State == System.Net.WebSockets.WebSocketState.Open)
            {
                try
                {
                    await ws.CloseAsync(System.Net.WebSockets.WebSocketCloseStatus.NormalClosure, "Connection closed", CancellationToken.None);
                }
                catch
                {
                    // Ignore errors during close
                }
            }
        }
    }

    public static Task SendToDevice(string deviceId, string evt, object payload)
    {
        if (Devices.TryGetValue(deviceId, out var ws)) return Send(ws, evt, payload);
        return Task.CompletedTask;
    }

    public static async Task BroadcastToDevicesAsync(string evt, object payload)
    {
        Console.WriteLine($">>> RealtimeHub: Broadcasting event '{evt}' to {Devices.Count} connected device(s)");
        var tasks = Devices.Values.Select(ws => Send(ws, evt, payload)).ToArray();
        await Task.WhenAll(tasks);
        Console.WriteLine($">>> RealtimeHub: Broadcast complete");
    }

    private static Task Send(System.Net.WebSockets.WebSocket ws, string evt, object payload)
    {
        var json = System.Text.Json.JsonSerializer.Serialize(new { @event = evt, payload });
        var bytes = Encoding.UTF8.GetBytes(json);
        return ws.SendAsync(new ArraySegment<byte>(bytes), System.Net.WebSockets.WebSocketMessageType.Text, true, CancellationToken.None);
    }

    private static void BroadcastAdmins(string evt, object payload)
    {
        foreach (var ws in Admins.Values)
        {
            _ = Send(ws, evt, payload);
        }
    }
}

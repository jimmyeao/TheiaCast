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

// Semaphore to limit concurrent thumbnail generation (prevents CPU overload)
var thumbnailSemaphore = new SemaphoreSlim(2, 2); // Max 2 concurrent thumbnail generations

// Broadcast file size limits
const int MAX_BROADCAST_FILE_SIZE_MB = 50;
const long MAX_BROADCAST_FILE_SIZE_BYTES = MAX_BROADCAST_FILE_SIZE_MB * 1024L * 1024L;

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

// Configure FFMpegCore to use system FFmpeg binary
FFMpegCore.GlobalFFOptions.Configure(options =>
{
    options.BinaryFolder = "/usr/bin";
    options.TemporaryFilesFolder = "/tmp";
});

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
builder.Services.AddScoped<IImageService, ImageService>();
builder.Services.AddScoped<IStorageService, StorageService>();
builder.Services.AddScoped<ILogService, LogService>();
builder.Services.AddScoped<ISettingsService, SettingsService>();
builder.Services.AddScoped<IBroadcastService, BroadcastService>();
builder.Services.AddScoped<ILicenseService, LicenseService>();
builder.Services.AddScoped<ITagService, TagService>();
builder.Services.AddScoped<AuditLogService>();
builder.Services.AddHostedService<LogCleanupService>();
builder.Services.AddHostedService<LicenseValidationBackgroundService>();
builder.Services.AddHostedService<BroadcastMediaCleanupService>();

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
provider.Mappings[".webp"] = "image/webp";
provider.Mappings[".svg"] = "image/svg+xml";

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

        // Log the actual database connection
        var connectionString = db.Database.GetConnectionString();
        Serilog.Log.Information($"Database connection string: {connectionString}");

        // Verify which database we're actually connected to
        var currentDatabase = db.Database.SqlQueryRaw<string>("SELECT current_database() as \"Value\"").AsEnumerable().FirstOrDefault();
        Serilog.Log.Information($"Connected to database: {currentDatabase}");

        // Ensure the database and tables exist
        // Check if any tables exist, if not, ensure created
        var tablesExist = db.Database.SqlQueryRaw<int>(
            "SELECT COUNT(*) as \"Value\" FROM information_schema.tables WHERE table_schema = 'public'"
        ).AsEnumerable().FirstOrDefault();

        Serilog.Log.Information($"Found {tablesExist} tables in public schema");

        // List all tables for debugging
        var tableNames = db.Database.SqlQueryRaw<string>("SELECT tablename as \"Value\" FROM pg_tables WHERE schemaname = 'public'").AsEnumerable();
        Serilog.Log.Information($"Tables: {string.Join(", ", tableNames)}");

        if (tablesExist == 0)
        {
            Serilog.Log.Information("No tables found, calling EnsureCreatedAsync()");
            // Database exists but tables don't - EnsureCreated() won't help
            // Manually create core tables then let EnsureCreated() fill in the rest
            await db.Database.EnsureCreatedAsync();
            Serilog.Log.Information("EnsureCreatedAsync() completed");
        }

        // Ensure Users table exists (critical for authentication)
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""Users"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""Username"" text NOT NULL UNIQUE,
                ""PasswordHash"" text NOT NULL,
                ""PasswordVersion"" text NOT NULL DEFAULT 'sha256',
                ""MfaSecret"" text,
                ""IsMfaEnabled"" boolean NOT NULL DEFAULT false,
                ""Email"" text,
                ""DisplayName"" text,
                ""LastLoginAt"" timestamp
            );
        ");

        // Ensure RefreshTokens table exists (for secure token refresh)
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""RefreshTokens"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""UserId"" int NOT NULL,
                ""Token"" text NOT NULL,
                ""ExpiresAt"" timestamp NOT NULL,
                ""CreatedAt"" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ""IsRevoked"" boolean NOT NULL DEFAULT false,
                FOREIGN KEY (""UserId"") REFERENCES ""Users""(""Id"") ON DELETE CASCADE
            );
        ");
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS \"IX_RefreshTokens_Token\" ON \"RefreshTokens\"(\"Token\");");
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS \"IX_RefreshTokens_UserId\" ON \"RefreshTokens\"(\"UserId\");");

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
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Content\" ADD COLUMN IF NOT EXISTS \"ThumbnailBase64\" text;");

        // Add display configuration columns to Devices table
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Devices\" ADD COLUMN IF NOT EXISTS \"DisplayWidth\" int;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Devices\" ADD COLUMN IF NOT EXISTS \"DisplayHeight\" int;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Devices\" ADD COLUMN IF NOT EXISTS \"KioskMode\" boolean;");

        // Add metadata columns to Devices table
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Devices\" ADD COLUMN IF NOT EXISTS \"Description\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Devices\" ADD COLUMN IF NOT EXISTS \"Location\" text;");

        // Add description column to Content table
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Content\" ADD COLUMN IF NOT EXISTS \"Description\" text;");

        // Users table created above with all columns, add PasswordVersion for existing installations
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Users\" ADD COLUMN IF NOT EXISTS \"PasswordVersion\" text NOT NULL DEFAULT 'sha256';");
        db.Database.ExecuteSqlRaw("CREATE UNIQUE INDEX IF NOT EXISTS \"IX_Users_Email_unique\" ON \"Users\"(\"Email\") WHERE \"Email\" IS NOT NULL;");

        // Seed default admin user if not exists (password: admin123)
        // BCrypt hash of 'admin123' with 12 rounds
        var userCount = db.Database.SqlQueryRaw<int>("SELECT COUNT(*) as \"Value\" FROM \"Users\"").AsEnumerable().FirstOrDefault();
        Serilog.Log.Information($"Found {userCount} users in Users table");
        if (userCount == 0)
        {
            Serilog.Log.Information("Creating default admin user with BCrypt password");
            var adminPasswordHash = BCrypt.Net.BCrypt.HashPassword("admin123", BCrypt.Net.BCrypt.GenerateSalt(12));
            db.Database.ExecuteSqlRaw($@"
                INSERT INTO ""Users"" (""Username"", ""PasswordHash"", ""PasswordVersion"", ""IsMfaEnabled"")
                VALUES ('admin', '{adminPasswordHash}', 'bcrypt', false);");
            Serilog.Log.Information("Admin user created successfully");
        }
        else
        {
            Serilog.Log.Information("Admin user already exists, skipping creation");
        }

        // DeviceBroadcastStates, Logs, AppSettings, Broadcasts, Licenses tables are created by EnsureCreated()
        // Just create any missing indexes
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS \"IX_Logs_Timestamp\" ON \"Logs\"(\"Timestamp\" DESC);");
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS \"IX_Logs_DeviceId\" ON \"Logs\"(\"DeviceId\");");
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS \"IX_Logs_Level\" ON \"Logs\"(\"Level\");");

        // Add audit logging columns to Logs table
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Logs\" ADD COLUMN IF NOT EXISTS \"UserId\" int;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Logs\" ADD COLUMN IF NOT EXISTS \"Username\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Logs\" ADD COLUMN IF NOT EXISTS \"Action\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Logs\" ADD COLUMN IF NOT EXISTS \"EntityType\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Logs\" ADD COLUMN IF NOT EXISTS \"EntityId\" int;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Logs\" ADD COLUMN IF NOT EXISTS \"OldValue\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Logs\" ADD COLUMN IF NOT EXISTS \"NewValue\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Logs\" ADD COLUMN IF NOT EXISTS \"IpAddress\" text;");
        db.Database.ExecuteSqlRaw("ALTER TABLE \"Logs\" ADD COLUMN IF NOT EXISTS \"UserAgent\" text;");

        // Create indexes for audit log queries
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS \"IX_Logs_UserId\" ON \"Logs\"(\"UserId\");");
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS \"IX_Logs_Action\" ON \"Logs\"(\"Action\");");
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS \"IX_Logs_EntityType\" ON \"Logs\"(\"EntityType\");");

        // Create Tags and DeviceTags tables
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""Tags"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""Name"" text NOT NULL,
                ""Color"" text NOT NULL DEFAULT '#3B82F6',
                ""CreatedAt"" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        ");

        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""DeviceTags"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""DeviceId"" int NOT NULL,
                ""TagId"" int NOT NULL,
                ""AssignedAt"" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (""DeviceId"") REFERENCES ""Devices""(""Id"") ON DELETE CASCADE,
                FOREIGN KEY (""TagId"") REFERENCES ""Tags""(""Id"") ON DELETE CASCADE
            );
        ");

        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""PlaylistTags"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""PlaylistId"" int NOT NULL,
                ""TagId"" int NOT NULL,
                ""AssignedAt"" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (""PlaylistId"") REFERENCES ""Playlists""(""Id"") ON DELETE CASCADE,
                FOREIGN KEY (""TagId"") REFERENCES ""Tags""(""Id"") ON DELETE CASCADE
            );
        ");

        // Tag indexes for performance
        db.Database.ExecuteSqlRaw("CREATE UNIQUE INDEX IF NOT EXISTS \"IX_Tags_Name\" ON \"Tags\"(\"Name\");");
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS \"IX_DeviceTags_DeviceId\" ON \"DeviceTags\"(\"DeviceId\");");
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS \"IX_DeviceTags_TagId\" ON \"DeviceTags\"(\"TagId\");");
        db.Database.ExecuteSqlRaw("CREATE UNIQUE INDEX IF NOT EXISTS \"IX_DeviceTags_DeviceId_TagId\" ON \"DeviceTags\"(\"DeviceId\", \"TagId\");");
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS \"IX_PlaylistTags_PlaylistId\" ON \"PlaylistTags\"(\"PlaylistId\");");
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS \"IX_PlaylistTags_TagId\" ON \"PlaylistTags\"(\"TagId\");");
        db.Database.ExecuteSqlRaw("CREATE UNIQUE INDEX IF NOT EXISTS \"IX_PlaylistTags_PlaylistId_TagId\" ON \"PlaylistTags\"(\"PlaylistId\", \"TagId\");");

        // AppSettings table is created by EnsureCreated(), just initialize default settings
        // Initialize default settings if not exists
        var settingsCount = db.Database.SqlQueryRaw<int>("SELECT COUNT(*) as \"Value\" FROM \"AppSettings\" WHERE \"Key\" = 'LogRetentionDays'").AsEnumerable().FirstOrDefault();
        if (settingsCount == 0)
        {
            db.Database.ExecuteSqlRaw(@"
                INSERT INTO ""AppSettings"" (""Key"", ""Value"", ""UpdatedAt"")
                VALUES ('LogRetentionDays', '7', CURRENT_TIMESTAMP);
            ");
        }

        // Broadcasts, Licenses, and LicenseViolations tables are created by EnsureCreated()
        // Just create any missing indexes
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS \"IX_Broadcasts_IsActive\" ON \"Broadcasts\"(\"IsActive\");");
        db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS \"IX_Broadcasts_CreatedAt\" ON \"Broadcasts\"(\"CreatedAt\" DESC);");

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
                INSERT INTO ""Licenses"" (""Key"", ""KeyHash"", ""Tier"", ""MaxDevices"", ""CurrentDeviceCount"", ""IsActive"", ""CompanyName"", ""CreatedAt"")
                VALUES ('FREE-TIER', 'free-tier-hash', 'free', 3, 0, true, 'Default Free License', CURRENT_TIMESTAMP);
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

app.MapPost("/auth/login", async ([FromBody] LoginDto dto, IAuthService auth, AuditLogService audit, HttpContext context, PdsDbContext db, ILogger<Program> log) =>
{
    try
    {
        var res = await auth.LoginAsync(dto);

        // Look up user to get ID for audit log
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == dto.Username);

        // Log successful login
        var ipAddress = context.Connection.RemoteIpAddress?.ToString();
        var userAgent = context.Request.Headers.UserAgent.ToString();
        await audit.LogAuthEventAsync(
            userId: user?.Id,
            username: dto.Username,
            eventType: "login",
            ipAddress: ipAddress,
            userAgent: userAgent,
            details: "successful"
        );

        return Results.Ok(res);
    }
    catch (Exception ex)
    {
        // Log failed login attempt
        var ipAddress = context.Connection.RemoteIpAddress?.ToString();
        var userAgent = context.Request.Headers.UserAgent.ToString();
        await audit.LogAuthEventAsync(
            userId: null,
            username: dto.Username,
            eventType: "login.failed",
            ipAddress: ipAddress,
            userAgent: userAgent,
            details: ex.Message
        );

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

app.MapPost("/auth/change-password", async ([FromBody] ChangePasswordDto dto, IAuthService auth, AuditLogService audit, ClaimsPrincipal user, HttpContext context, PdsDbContext db, ILogger<Program> log) =>
{
    try
    {
        var username = user.Identity?.Name;
        if (string.IsNullOrEmpty(username)) return Results.Unauthorized();

        var currentUser = await db.Users.FirstOrDefaultAsync(u => u.Username == username);
        await auth.ChangePasswordAsync(username, dto.CurrentPassword, dto.NewPassword);

        // Log password change
        var ipAddress = context.Connection.RemoteIpAddress?.ToString();
        var userAgent = context.Request.Headers.UserAgent.ToString();
        await audit.LogUserActionAsync(
            actorUserId: currentUser?.Id,
            actorUsername: username,
            actionType: "password.change",
            targetUserId: currentUser?.Id ?? 0,
            ipAddress: ipAddress,
            userAgent: userAgent
        );

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

app.MapPost("/auth/mfa/enable", async ([FromBody] string code, IAuthService auth, AuditLogService audit, ClaimsPrincipal user, HttpContext context, PdsDbContext db, ILogger<Program> log) =>
{
    try
    {
        var username = user.Identity?.Name;
        if (string.IsNullOrEmpty(username)) return Results.Unauthorized();

        var currentUser = await db.Users.FirstOrDefaultAsync(u => u.Username == username);
        await auth.EnableMfaAsync(username, code);

        // Log MFA enabled
        var ipAddress = context.Connection.RemoteIpAddress?.ToString();
        var userAgent = context.Request.Headers.UserAgent.ToString();
        await audit.LogAuthEventAsync(
            userId: currentUser?.Id,
            username: username,
            eventType: "mfa.enabled",
            ipAddress: ipAddress,
            userAgent: userAgent,
            details: "MFA successfully enabled"
        );

        return Results.Ok();
    }
    catch (Exception ex)
    {
        log.LogError(ex, "MFA enable failed");
        return Results.Problem(title: "MFA enable failed", detail: ex.Message, statusCode: 500);
    }
}).RequireAuthorization();

app.MapPost("/auth/mfa/disable", async (IAuthService auth, AuditLogService audit, ClaimsPrincipal user, HttpContext context, PdsDbContext db, ILogger<Program> log) =>
{
    try
    {
        var username = user.Identity?.Name;
        if (string.IsNullOrEmpty(username)) return Results.Unauthorized();

        var currentUser = await db.Users.FirstOrDefaultAsync(u => u.Username == username);
        await auth.DisableMfaAsync(username);

        // Log MFA disabled
        var ipAddress = context.Connection.RemoteIpAddress?.ToString();
        var userAgent = context.Request.Headers.UserAgent.ToString();
        await audit.LogAuthEventAsync(
            userId: currentUser?.Id,
            username: username,
            eventType: "mfa.disabled",
            ipAddress: ipAddress,
            userAgent: userAgent,
            details: "MFA successfully disabled"
        );

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
app.MapGet("/devices/by-device-id/{deviceId}", async (string deviceId, IDeviceService svc) =>
{
    var device = await svc.FindOneByDeviceIdAsync(deviceId);
    return device == null ? Results.NotFound() : Results.Ok(device);
}); // NO RequireAuthorization - devices need to fetch their own config on startup
app.MapGet("/devices/config", async (string token, IDeviceService svc) =>
{
    var device = await svc.FindOneByTokenAsync(token);
    return device == null ? Results.NotFound() : Results.Ok(device);
}); // NO RequireAuthorization - devices authenticate with their token to fetch config
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

// Screencast control endpoints (with reference counting for multiple admins)
app.MapPost("/devices/{deviceId}/screencast/start", async (string deviceId) =>
{
    await RealtimeHub.StartScreencast(deviceId);
    return Results.Ok(new { message = "Screencast start requested", deviceId });
}).RequireAuthorization();

app.MapPost("/devices/{deviceId}/screencast/stop", async (string deviceId) =>
{
    await RealtimeHub.StopScreencast(deviceId);
    return Results.Ok(new { message = "Screencast stop requested", deviceId });
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

// Tag endpoints
app.MapGet("/tags", async (ITagService svc) => await svc.GetAllAsync()).RequireAuthorization();
app.MapGet("/tags/{id:int}", async (int id, ITagService svc) => await svc.GetByIdAsync(id)).RequireAuthorization();
app.MapPost("/tags", async ([FromBody] CreateTagDto dto, ITagService svc) => await svc.CreateAsync(dto)).RequireAuthorization();
app.MapPatch("/tags/{id:int}", async (int id, [FromBody] UpdateTagDto dto, ITagService svc) => await svc.UpdateAsync(id, dto)).RequireAuthorization();
app.MapDelete("/tags/{id:int}", async (int id, ITagService svc) => await svc.DeleteAsync(id)).RequireAuthorization();

// Device-Tag association endpoints
app.MapPost("/devices/{deviceId:int}/tags/{tagId:int}", async (int deviceId, int tagId, ITagService svc) => await svc.AssignToDeviceAsync(deviceId, tagId)).RequireAuthorization();
app.MapDelete("/devices/{deviceId:int}/tags/{tagId:int}", async (int deviceId, int tagId, ITagService svc) => await svc.RemoveFromDeviceAsync(deviceId, tagId)).RequireAuthorization();
app.MapGet("/devices/{deviceId:int}/tags", async (int deviceId, ITagService svc) => await svc.GetDeviceTagsAsync(deviceId)).RequireAuthorization();

// Playlist-Tag association endpoints
app.MapPost("/playlists/{playlistId:int}/tags/{tagId:int}", async (int playlistId, int tagId, PdsDbContext db) =>
{
    var exists = await db.PlaylistTags.AnyAsync(pt => pt.PlaylistId == playlistId && pt.TagId == tagId);
    if (exists) return Results.Conflict(new { message = "Tag already assigned to this playlist" });

    // Enforce one tag = one playlist restriction
    var tagUsedElsewhere = await db.PlaylistTags
        .Where(pt => pt.TagId == tagId && pt.PlaylistId != playlistId)
        .Include(pt => pt.Playlist)
        .FirstOrDefaultAsync();

    if (tagUsedElsewhere != null)
    {
        return Results.Conflict(new {
            message = $"This tag is already assigned to playlist '{tagUsedElsewhere.Playlist!.Name}'. Each tag can only be assigned to one playlist.",
            existingPlaylistId = tagUsedElsewhere.PlaylistId,
            existingPlaylistName = tagUsedElsewhere.Playlist.Name
        });
    }

    var playlistTag = new PlaylistTag { PlaylistId = playlistId, TagId = tagId };
    db.PlaylistTags.Add(playlistTag);
    await db.SaveChangesAsync();

    // Auto-assign this playlist to all devices that have this tag
    var devicesWithTag = await db.DeviceTags
        .Where(dt => dt.TagId == tagId)
        .Select(dt => dt.DeviceId)
        .ToListAsync();

    foreach (var deviceId in devicesWithTag)
    {
        // Check if playlist is already assigned to this device
        var alreadyAssigned = await db.DevicePlaylists
            .AnyAsync(dp => dp.DeviceId == deviceId && dp.PlaylistId == playlistId);

        if (!alreadyAssigned)
        {
            db.DevicePlaylists.Add(new DevicePlaylist { DeviceId = deviceId, PlaylistId = playlistId });
            Serilog.Log.Information($"Auto-assigned playlist {playlistId} to device {deviceId} based on tag {tagId}");
        }
    }
    await db.SaveChangesAsync();

    // Push content update to all affected devices
    var deviceStringIds = await db.Devices
        .Where(d => devicesWithTag.Contains(d.Id))
        .Select(d => d.DeviceId)
        .ToListAsync();

    var items = await db.PlaylistItems
        .Where(i => i.PlaylistId == playlistId)
        .OrderBy(i => i.OrderIndex ?? i.Id)
        .Select(i => new {
            id = i.Id,
            playlistId = i.PlaylistId,
            contentId = i.ContentId,
            displayDuration = (i.DurationSeconds ?? 0) * 1000,
            orderIndex = i.OrderIndex ?? 0,
            timeWindowStart = i.TimeWindowStart,
            timeWindowEnd = i.TimeWindowEnd,
            daysOfWeek = i.DaysOfWeek,
            content = new { id = i.ContentId, name = i.Url, url = i.Url, requiresInteraction = false }
        })
        .ToListAsync();

    foreach (var deviceStringId in deviceStringIds)
    {
        await RealtimeHub.SendToDevice(deviceStringId, ServerToClientEvent.CONTENT_UPDATE, new { playlistId, items });
    }

    return Results.Ok(new { message = "Tag assigned to playlist", playlistId, tagId, devicesAutoAssigned = devicesWithTag.Count });
}).RequireAuthorization();

app.MapDelete("/playlists/{playlistId:int}/tags/{tagId:int}", async (int playlistId, int tagId, PdsDbContext db) =>
{
    var playlistTag = await db.PlaylistTags.FirstOrDefaultAsync(pt => pt.PlaylistId == playlistId && pt.TagId == tagId);
    if (playlistTag == null) return Results.NotFound();

    db.PlaylistTags.Remove(playlistTag);
    await db.SaveChangesAsync();

    // Find devices that had this tag
    var devicesWithTag = await db.DeviceTags
        .Where(dt => dt.TagId == tagId)
        .Select(dt => dt.DeviceId)
        .ToListAsync();

    int devicesUnassigned = 0;
    foreach (var deviceId in devicesWithTag)
    {
        // Check if this device has any OTHER tags that this playlist is still assigned to
        var deviceTagIds = await db.DeviceTags
            .Where(dt => dt.DeviceId == deviceId)
            .Select(dt => dt.TagId)
            .ToListAsync();

        var remainingMatchingTags = await db.PlaylistTags
            .Where(pt => pt.PlaylistId == playlistId && deviceTagIds.Contains(pt.TagId))
            .AnyAsync();

        // If no other matching tags, unassign the playlist from this device
        if (!remainingMatchingTags)
        {
            var devicePlaylist = await db.DevicePlaylists
                .FirstOrDefaultAsync(dp => dp.DeviceId == deviceId && dp.PlaylistId == playlistId);

            if (devicePlaylist != null)
            {
                db.DevicePlaylists.Remove(devicePlaylist);
                devicesUnassigned++;
                Serilog.Log.Information($"Auto-unassigned playlist {playlistId} from device {deviceId} (tag {tagId} removed, no other matching tags)");
            }
        }
    }
    await db.SaveChangesAsync();

    // Push empty content update to unassigned devices
    if (devicesUnassigned > 0)
    {
        var deviceStringIds = await db.Devices
            .Where(d => devicesWithTag.Contains(d.Id))
            .Select(d => d.DeviceId)
            .ToListAsync();

        foreach (var deviceStringId in deviceStringIds)
        {
            // Check if device still has this playlist assigned via other tags
            var deviceNumericId = await db.Devices.Where(d => d.DeviceId == deviceStringId).Select(d => d.Id).FirstOrDefaultAsync();
            var stillAssigned = await db.DevicePlaylists.AnyAsync(dp => dp.DeviceId == deviceNumericId && dp.PlaylistId == playlistId);

            if (!stillAssigned)
            {
                // Push empty playlist or next available playlist
                var nextPlaylistId = await db.DevicePlaylists
                    .Where(dp => dp.DeviceId == deviceNumericId)
                    .Select(dp => dp.PlaylistId)
                    .FirstOrDefaultAsync();

                if (nextPlaylistId > 0)
                {
                    var items = await db.PlaylistItems
                        .Where(i => i.PlaylistId == nextPlaylistId)
                        .OrderBy(i => i.OrderIndex ?? i.Id)
                        .Select(i => new {
                            id = i.Id,
                            playlistId = i.PlaylistId,
                            contentId = i.ContentId,
                            displayDuration = (i.DurationSeconds ?? 0) * 1000,
                            orderIndex = i.OrderIndex ?? 0,
                            timeWindowStart = i.TimeWindowStart,
                            timeWindowEnd = i.TimeWindowEnd,
                            daysOfWeek = i.DaysOfWeek,
                            content = new { id = i.ContentId, name = i.Url, url = i.Url, requiresInteraction = false }
                        })
                        .ToListAsync();

                    await RealtimeHub.SendToDevice(deviceStringId, ServerToClientEvent.CONTENT_UPDATE, new { playlistId = nextPlaylistId, items });
                }
                else
                {
                    // No playlists left, send empty
                    await RealtimeHub.SendToDevice(deviceStringId, ServerToClientEvent.CONTENT_UPDATE, new { playlistId = 0, items = Array.Empty<object>() });
                }
            }
        }
    }

    return Results.Ok(new { message = "Tag removed from playlist", playlistId, tagId, devicesUnassigned });
}).RequireAuthorization();

app.MapGet("/playlists/{playlistId:int}/tags", async (int playlistId, PdsDbContext db) =>
{
    var tags = await db.PlaylistTags
        .Where(pt => pt.PlaylistId == playlistId)
        .Include(pt => pt.Tag)
        .Select(pt => new { pt.Tag!.Id, pt.Tag.Name, pt.Tag.Color })
        .ToListAsync();
    return Results.Ok(tags);
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

// Video Thumbnail endpoint - Extract frame from video at 3 seconds
app.MapGet("/content/thumbnail", async (HttpContext context, string url) =>
{
    try
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return Results.BadRequest(new { error = "URL parameter is required" });
        }

        // Use FFMpegCore to extract frame at 3 seconds
        var tempImagePath = Path.Combine(Path.GetTempPath(), $"thumb_{Guid.NewGuid()}.jpg");

        await FFMpegCore.FFMpeg.SnapshotAsync(url, tempImagePath, null, TimeSpan.FromSeconds(3));

        // Read the image and return as base64
        var imageBytes = await System.IO.File.ReadAllBytesAsync(tempImagePath);
        var base64 = Convert.ToBase64String(imageBytes);

        // Clean up temp file
        System.IO.File.Delete(tempImagePath);

        return Results.Ok(new { thumbnail = $"data:image/jpeg;base64,{base64}" });
    }
    catch (Exception ex)
    {
        Serilog.Log.Error(ex, "Failed to generate video thumbnail for URL: {Url}", url);
        return Results.Problem($"Failed to generate thumbnail: {ex.Message}");
    }
}).RequireAuthorization();

// Web Screenshot endpoint - Capture screenshot of any URL using headless browser
app.MapGet("/content/screenshot", async (HttpContext context, PdsDbContext db, string url, bool refresh = false) =>
{
    try
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return Results.BadRequest(new { error = "URL parameter is required" });
        }

        // Save original URL for navigation (before stripping /api prefix)
        var originalUrl = url;

        // Extract relative path for database lookup (handles both relative and absolute URLs)
        var urlPath = url;
        if (url.StartsWith("http://") || url.StartsWith("https://"))
        {
            var uri = new Uri(url);
            urlPath = uri.PathAndQuery;
        }

        // Strip /api prefix if present (frontend may add this depending on proxy configuration)
        // This is ONLY for database lookup - navigationUrl will use originalUrl
        if (urlPath.StartsWith("/api/"))
        {
            urlPath = urlPath.Substring(4); // Remove "/api" prefix
            Serilog.Log.Information("Stripped /api prefix from urlPath, now: {UrlPath}", urlPath);
        }
        if (url.StartsWith("/api/"))
        {
            url = url.Substring(4); // Remove "/api" prefix from url as well
            Serilog.Log.Information("Stripped /api prefix from url, now: {Url}", url);
        }

        // Check for cached thumbnail in database (unless refresh is requested)
        // Do this BEFORE semaphore to avoid waiting for cached results
        if (!refresh)
        {
            // Try matching with multiple URL variations to handle /api prefix inconsistencies
            var urlWithApi = url.StartsWith("/api") ? url : $"/api{url}";
            var urlWithoutApi = url.StartsWith("/api") ? url.Substring(4) : url;
            var urlPathWithApi = urlPath.StartsWith("/api") ? urlPath : $"/api{urlPath}";
            var urlPathWithoutApi = urlPath.StartsWith("/api") ? urlPath.Substring(4) : urlPath;

            Serilog.Log.Information("Looking for cached thumbnail with url variations: {Url}, {UrlPath}", url, urlPath);
            var cachedContent = await db.Content.FirstOrDefaultAsync(c =>
                c.ThumbnailBase64 != null && (
                    c.Url == url ||
                    c.Url == urlPath ||
                    c.Url == urlWithApi ||
                    c.Url == urlWithoutApi ||
                    c.Url == urlPathWithApi ||
                    c.Url == urlPathWithoutApi
                ));
            if (cachedContent != null)
            {
                Serilog.Log.Information("Returning cached thumbnail for URL: {Url} (matched against stored URL: {StoredUrl})", url, cachedContent.Url);
                return Results.Ok(new { screenshot = $"data:image/jpeg;base64,{cachedContent.ThumbnailBase64}" });
            }
            else
            {
                Serilog.Log.Information("No cached thumbnail found for any URL variation, will generate new one");
            }
        }

        // Wait for semaphore slot (max 2 concurrent thumbnail generations)
        await thumbnailSemaphore.WaitAsync();
        try
        {

        // Convert relative URLs to absolute URLs for Puppeteer
        // Use originalUrl to preserve /api prefix for navigation
        var navigationUrl = originalUrl;
        if (originalUrl.StartsWith("/"))
        {
            // Relative URL - convert to absolute using the backend's own URL
            var baseUrl = Environment.GetEnvironmentVariable("BASE_URL") ?? "http://localhost:5001";
            navigationUrl = baseUrl + originalUrl;
            Serilog.Log.Information("Converted relative URL {RelativeUrl} to absolute {AbsoluteUrl}", originalUrl, navigationUrl);
        }

        // Note: Removed localhost -> host.docker.internal replacement
        // Puppeteer runs in the same container as the backend, so localhost works directly
        // host.docker.internal is only needed for cross-container access and doesn't work on Linux

        string? generatedThumbnail = null;

        // Check if this is a video HTML page URL (e.g., /videos/{guid}/index.html)
        // If so, extract thumbnail from the actual video file using FFmpeg instead of Puppeteer
        var videoHtmlMatch = System.Text.RegularExpressions.Regex.Match(url, @"/videos/([^/]+)/index\.html");
        if (videoHtmlMatch.Success)
        {
            try
            {
                var videoGuid = videoHtmlMatch.Groups[1].Value;
                var videoDir = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "videos", videoGuid);

                Serilog.Log.Information("Looking for video files in directory: {VideoDir}", videoDir);

                if (!Directory.Exists(videoDir))
                {
                    Serilog.Log.Warning("Video directory does not exist: {VideoDir}", videoDir);
                    // Fall through to Puppeteer
                }
                else
                {
                    var videoFile = Directory.GetFiles(videoDir, "*.mp4").FirstOrDefault()
                                 ?? Directory.GetFiles(videoDir, "*.webm").FirstOrDefault()
                                 ?? Directory.GetFiles(videoDir, "*.mkv").FirstOrDefault();

                    if (videoFile != null)
                    {
                        Serilog.Log.Information("Found video file: {VideoFile}", videoFile);

                        try
                        {
                            // Use FFmpeg to extract frame instead of Puppeteer
                            var tempImagePath = Path.Combine(Path.GetTempPath(), $"thumb_{Guid.NewGuid()}.jpg");
                            Serilog.Log.Information("Extracting thumbnail to: {TempImagePath}", tempImagePath);
                            Serilog.Log.Information("FFmpeg command: extract frame from {VideoFile} at 3 seconds", videoFile);

                            // Call FFmpeg directly using Process.Start for better control
                            var ffmpegArgs = $"-i \"{videoFile}\" -ss 00:00:03 -vframes 1 -q:v 2 \"{tempImagePath}\" -y";
                            var processStartInfo = new System.Diagnostics.ProcessStartInfo
                            {
                                FileName = "/usr/bin/ffmpeg",
                                Arguments = ffmpegArgs,
                                RedirectStandardOutput = true,
                                RedirectStandardError = true,
                                UseShellExecute = false,
                                CreateNoWindow = true
                            };

                            using (var process = System.Diagnostics.Process.Start(processStartInfo))
                            {
                                if (process == null)
                                {
                                    Serilog.Log.Error("Failed to start FFmpeg process");
                                }
                                else
                                {
                                    await process.WaitForExitAsync();
                                    var stderr = await process.StandardError.ReadToEndAsync();

                                    if (process.ExitCode != 0)
                                    {
                                        Serilog.Log.Error("FFmpeg exited with code {ExitCode}: {Error}", process.ExitCode, stderr);
                                    }
                                    else if (!File.Exists(tempImagePath))
                                    {
                                        Serilog.Log.Error("FFmpeg succeeded but did not create output file: {TempImagePath}", tempImagePath);
                                    }
                                    else
                                    {
                                        Serilog.Log.Information("FFmpeg thumbnail created successfully");
                                        var imageBytes = await System.IO.File.ReadAllBytesAsync(tempImagePath);
                                        var thumbnailBase64 = Convert.ToBase64String(imageBytes);
                                        System.IO.File.Delete(tempImagePath);

                                        generatedThumbnail = thumbnailBase64;
                                    }
                                }
                            }
                        }
                        catch (Exception ffmpegEx)
                        {
                            Serilog.Log.Error(ffmpegEx, "FFmpeg exception when extracting thumbnail from {VideoFile}", videoFile);
                            // Fall through to Puppeteer
                        }
                    }
                    else
                    {
                        Serilog.Log.Warning("No video file found in directory: {VideoDir}", videoDir);
                        // Fall through to Puppeteer
                    }
                }
            }
            catch (Exception ex)
            {
                Serilog.Log.Error(ex, "Error extracting video thumbnail with FFmpeg");
                // Fall through to Puppeteer
            }
        }

        // If FFmpeg generated a thumbnail, save it and return
        if (generatedThumbnail != null)
        {
            Serilog.Log.Information("FFmpeg generated thumbnail, looking up content with url={Url} or urlPath={UrlPath}", url, urlPath);
            // Try matching with multiple URL variations to handle /api prefix inconsistencies
            var urlWithApi = url.StartsWith("/api") ? url : $"/api{url}";
            var urlWithoutApi = url.StartsWith("/api") ? url.Substring(4) : url;
            var urlPathWithApi = urlPath.StartsWith("/api") ? urlPath : $"/api{urlPath}";
            var urlPathWithoutApi = urlPath.StartsWith("/api") ? urlPath.Substring(4) : urlPath;

            var contentToUpdate = await db.Content.FirstOrDefaultAsync(c =>
                c.Url == url ||
                c.Url == urlPath ||
                c.Url == urlWithApi ||
                c.Url == urlWithoutApi ||
                c.Url == urlPathWithApi ||
                c.Url == urlPathWithoutApi
            );
            if (contentToUpdate != null)
            {
                contentToUpdate.ThumbnailBase64 = generatedThumbnail;
                await db.SaveChangesAsync();
                Serilog.Log.Information("✅ Saved FFmpeg thumbnail to database for content ID: {ContentId}, URL: {Url}", contentToUpdate.Id, contentToUpdate.Url);
            }
            else
            {
                Serilog.Log.Warning("⚠️ FFmpeg generated thumbnail but could not find content item in database with url={Url} or urlPath={UrlPath}", url, urlPath);
            }
            return Results.Ok(new { screenshot = $"data:image/jpeg;base64,{generatedThumbnail}" });
        }

        // Puppeteer screenshot generation with error handling
        try
        {
            // Use system Chromium if available (for Docker), otherwise download
            var executablePath = Environment.GetEnvironmentVariable("PUPPETEER_EXECUTABLE_PATH");

            PuppeteerSharp.LaunchOptions launchOptions;
            if (!string.IsNullOrEmpty(executablePath) && File.Exists(executablePath))
            {
                // Use system Chromium
                launchOptions = new PuppeteerSharp.LaunchOptions
                {
                    Headless = true,
                    ExecutablePath = executablePath,
                    Args = new[] { "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage" }
                };
            }
            else
            {
                // Download and use bundled Chromium
                var browserFetcher = new PuppeteerSharp.BrowserFetcher();
                await browserFetcher.DownloadAsync();

                launchOptions = new PuppeteerSharp.LaunchOptions
                {
                    Headless = true,
                    Args = new[] { "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage" }
                };
            }

            // Launch headless browser with timeout protection
            var launchTask = PuppeteerSharp.Puppeteer.LaunchAsync(launchOptions);
            var browser = await Task.Run(async () => await launchTask.WaitAsync(TimeSpan.FromSeconds(15)));

            try
            {
                await using (browser)
                {
                    await using var page = await browser.NewPageAsync();
                    page.DefaultNavigationTimeout = 15000; // Reduced to 15 seconds
                    await page.SetViewportAsync(new PuppeteerSharp.ViewPortOptions
                    {
                        Width = 1920,
                        Height = 1080
                    });

                    // Navigate to URL (no options to avoid CDP protocol errors)
                    await page.GoToAsync(navigationUrl);

                    // Wait 3 seconds for page content to fully load
                    await Task.Delay(3000);

                    // Take screenshot with timeout protection
                    var screenshotTask = page.ScreenshotDataAsync(new PuppeteerSharp.ScreenshotOptions
                    {
                        Type = PuppeteerSharp.ScreenshotType.Jpeg,
                        Quality = 80
                    });
                    var screenshotBytes = await screenshotTask.WaitAsync(TimeSpan.FromSeconds(10));

                    generatedThumbnail = Convert.ToBase64String(screenshotBytes);

                    // Save thumbnail to database if we generated one
                    if (generatedThumbnail != null)
                    {
                        Serilog.Log.Information("Puppeteer generated thumbnail, looking up content with url={Url} or urlPath={UrlPath}", url, urlPath);
                        // Try matching with multiple URL variations to handle /api prefix inconsistencies
                        var urlWithApi = url.StartsWith("/api") ? url : $"/api{url}";
                        var urlWithoutApi = url.StartsWith("/api") ? url.Substring(4) : url;
                        var urlPathWithApi = urlPath.StartsWith("/api") ? urlPath : $"/api{urlPath}";
                        var urlPathWithoutApi = urlPath.StartsWith("/api") ? urlPath.Substring(4) : urlPath;

                        var contentToUpdate = await db.Content.FirstOrDefaultAsync(c =>
                            c.Url == url ||
                            c.Url == urlPath ||
                            c.Url == urlWithApi ||
                            c.Url == urlWithoutApi ||
                            c.Url == urlPathWithApi ||
                            c.Url == urlPathWithoutApi
                        );
                        if (contentToUpdate != null)
                        {
                            contentToUpdate.ThumbnailBase64 = generatedThumbnail;
                            await db.SaveChangesAsync();
                            Serilog.Log.Information("✅ Saved Puppeteer thumbnail to database for content ID: {ContentId}, URL: {Url}", contentToUpdate.Id, contentToUpdate.Url);
                        }
                        else
                        {
                            Serilog.Log.Warning("⚠️ Puppeteer generated thumbnail but could not find content item in database with url={Url} or urlPath={UrlPath}", url, urlPath);
                        }
                    }
                }
            }
            catch (Exception)
            {
                // Ensure browser is disposed even if an error occurs
                try { await browser.DisposeAsync(); } catch { /* ignore disposal errors */ }
                throw;
            }

            return Results.Ok(new { screenshot = $"data:image/jpeg;base64,{generatedThumbnail}" });
        }
        catch (TimeoutException timeoutEx)
        {
            Serilog.Log.Error(timeoutEx, "Puppeteer timeout while generating screenshot for URL: {Url}", url);
            return Results.Problem($"Screenshot generation timed out for {url}");
        }
        catch (Exception puppeteerEx)
        {
            Serilog.Log.Error(puppeteerEx, "Puppeteer error while generating screenshot for URL: {Url}", url);
            return Results.Problem($"Failed to generate screenshot: {puppeteerEx.Message}");
        }
        }
        finally
        {
            // Always release semaphore slot
            thumbnailSemaphore.Release();
        }
    }
    catch (Exception ex)
    {
        Serilog.Log.Error(ex, "Failed to generate web screenshot for URL: {Url}", url);
        return Results.Problem($"Failed to generate screenshot: {ex.Message}");
    }
}).RequireAuthorization();

// Clear all cached thumbnails
app.MapPost("/content/thumbnails/clear", async (PdsDbContext db) =>
{
    try
    {
        var contentWithThumbnails = await db.Content.Where(c => c.ThumbnailBase64 != null).ToListAsync();
        foreach (var content in contentWithThumbnails)
        {
            content.ThumbnailBase64 = null;
        }
        await db.SaveChangesAsync();

        Serilog.Log.Information("Cleared {Count} cached thumbnails", contentWithThumbnails.Count);
        return Results.Ok(new { cleared = contentWithThumbnails.Count });
    }
    catch (Exception ex)
    {
        Serilog.Log.Error(ex, "Failed to clear cached thumbnails");
        return Results.Problem($"Failed to clear thumbnails: {ex.Message}");
    }
}).RequireAuthorization();

// Rebuild all thumbnails
app.MapPost("/content/thumbnails/rebuild", async (PdsDbContext db, HttpContext context) =>
{
    try
    {
        var allContent = await db.Content.Where(c => !string.IsNullOrEmpty(c.Url)).ToListAsync();
        var rebuilt = 0;
        var failed = 0;

        Serilog.Log.Information("Starting thumbnail rebuild for {Count} content items", allContent.Count);

        foreach (var content in allContent)
        {
            try
            {
                // Clear existing thumbnail
                content.ThumbnailBase64 = null;
                await db.SaveChangesAsync();

                // Trigger thumbnail generation by making internal request
                var baseUrl = Environment.GetEnvironmentVariable("BASE_URL") ?? "http://localhost:8080";
                var screenshotUrl = $"{baseUrl}/content/screenshot?url={Uri.EscapeDataString(content.Url)}&refresh=true";

                using var httpClient = new HttpClient();
                httpClient.DefaultRequestHeaders.Authorization = context.Request.Headers.Authorization.FirstOrDefault() != null
                    ? new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", context.Request.Headers.Authorization.ToString().Replace("Bearer ", ""))
                    : null;

                var response = await httpClient.GetAsync(screenshotUrl);
                if (response.IsSuccessStatusCode)
                {
                    rebuilt++;
                    Serilog.Log.Information("Rebuilt thumbnail for content {Id}: {Name}", content.Id, content.Name);
                }
                else
                {
                    failed++;
                    Serilog.Log.Warning("Failed to rebuild thumbnail for content {Id}: {Name} - Status: {Status}",
                        content.Id, content.Name, response.StatusCode);
                }
            }
            catch (Exception ex)
            {
                failed++;
                Serilog.Log.Error(ex, "Error rebuilding thumbnail for content {Id}: {Name}", content.Id, content.Name);
            }
        }

        Serilog.Log.Information("Thumbnail rebuild complete: {Rebuilt} succeeded, {Failed} failed", rebuilt, failed);
        return Results.Ok(new { total = allContent.Count, rebuilt, failed });
    }
    catch (Exception ex)
    {
        Serilog.Log.Error(ex, "Failed to rebuild thumbnails");
        return Results.Problem($"Failed to rebuild thumbnails: {ex.Message}");
    }
}).RequireAuthorization();

// Storage statistics endpoint
app.MapGet("/storage/stats", async (IStorageService svc) =>
{
    try
    {
        var stats = await svc.GetStorageStatsAsync();
        return Results.Ok(stats);
    }
    catch (Exception ex)
    {
        Serilog.Log.Error(ex, "Failed to get storage statistics");
        return Results.Problem($"Failed to get storage statistics: {ex.Message}");
    }
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

app.MapPost("/content/upload/image", async (HttpRequest request, IImageService svc) =>
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
app.MapGet("/logs", async (
    ILogService svc,
    AuditLogService auditSvc,
    PdsDbContext db,
    string? deviceId,
    string? level,
    string? username,
    string? action,
    string? entityType,
    bool? auditOnly,
    DateTime? startDate,
    DateTime? endDate,
    int limit = 100,
    int offset = 0) =>
{
    // If auditOnly or any audit filter is specified, use audit query
    if (auditOnly == true || !string.IsNullOrEmpty(username) || !string.IsNullOrEmpty(action) || !string.IsNullOrEmpty(entityType))
    {
        // Get userId from username if provided
        int? userId = null;
        if (!string.IsNullOrEmpty(username))
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);
            userId = user?.Id;
        }

        var auditLogs = await auditSvc.GetAuditLogsAsync(
            userId: userId,
            action: action,
            entityType: entityType,
            startDate: startDate,
            endDate: endDate,
            pageSize: limit,
            skip: offset
        );
        return Results.Ok(auditLogs);
    }
    else
    {
        // Use regular system logs query
        var logs = await svc.GetLogsAsync(deviceId, level, startDate, endDate, limit, offset);
        return Results.Ok(logs);
    }
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

// SSL Certificate Management endpoints
app.MapGet("/ssl/status", () =>
{
    var sslPath = "/app/ssl-certs";
    var certPath = Path.Combine(sslPath, "cert.pem");
    var keyPath = Path.Combine(sslPath, "key.pem");

    var certExists = File.Exists(certPath);
    var keyExists = File.Exists(keyPath);
    var isConfigured = certExists && keyExists;

    if (!isConfigured)
    {
        return Results.Ok(new
        {
            configured = false,
            message = "SSL certificates not configured"
        });
    }

    try
    {
        // Read certificate to get expiry and subject info
        var certContent = File.ReadAllText(certPath);
        var cert = new System.Security.Cryptography.X509Certificates.X509Certificate2(
            System.Text.Encoding.UTF8.GetBytes(certContent));

        return Results.Ok(new
        {
            configured = true,
            subject = cert.Subject,
            issuer = cert.Issuer,
            notBefore = cert.NotBefore,
            notAfter = cert.NotAfter,
            isExpired = cert.NotAfter < DateTime.UtcNow,
            daysUntilExpiry = (cert.NotAfter - DateTime.UtcNow).Days
        });
    }
    catch
    {
        return Results.Ok(new
        {
            configured = true,
            message = "SSL certificates present but unable to read details"
        });
    }
}).RequireAuthorization();

app.MapPost("/ssl/upload", async (HttpRequest request) =>
{
    if (!request.HasFormContentType)
    {
        return Results.BadRequest(new { error = "Multipart form data required" });
    }

    var form = await request.ReadFormAsync();
    var certFile = form.Files["certificate"];
    var keyFile = form.Files["privateKey"];

    if (certFile == null || keyFile == null)
    {
        return Results.BadRequest(new { error = "Both certificate and private key files are required" });
    }

    // Validate file sizes (max 1MB each)
    if (certFile.Length > 1_048_576 || keyFile.Length > 1_048_576)
    {
        return Results.BadRequest(new { error = "Certificate files too large (max 1MB each)" });
    }

    try
    {
        // Read certificate content
        using var certStream = new MemoryStream();
        await certFile.CopyToAsync(certStream);
        var certContent = System.Text.Encoding.UTF8.GetString(certStream.ToArray());

        // Basic validation - check if it looks like a PEM certificate
        if (!certContent.Contains("BEGIN CERTIFICATE") || !certContent.Contains("END CERTIFICATE"))
        {
            return Results.BadRequest(new { error = "Invalid certificate format. Must be PEM format." });
        }

        // Read private key content
        using var keyStream = new MemoryStream();
        await keyFile.CopyToAsync(keyStream);
        var keyContent = System.Text.Encoding.UTF8.GetString(keyStream.ToArray());

        // Basic validation - check if it looks like a PEM private key
        if (!keyContent.Contains("BEGIN") || !keyContent.Contains("PRIVATE KEY"))
        {
            return Results.BadRequest(new { error = "Invalid private key format. Must be PEM format." });
        }

        // Save files to ssl-certs directory
        var sslPath = "/app/ssl-certs";
        Directory.CreateDirectory(sslPath);

        var certPath = Path.Combine(sslPath, "cert.pem");
        var keyPath = Path.Combine(sslPath, "key.pem");

        await File.WriteAllTextAsync(certPath, certContent);
        await File.WriteAllTextAsync(keyPath, keyContent);

        // Set appropriate permissions (600 for private key)
        if (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS())
        {
            File.SetUnixFileMode(keyPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }

        return Results.Ok(new
        {
            success = true,
            message = "SSL certificates uploaded successfully. Please restart the frontend container for changes to take effect."
        });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = $"Failed to upload certificates: {ex.Message}" });
    }
}).RequireAuthorization();

// Broadcast endpoints
app.MapPost("/broadcast/start", async ([FromBody] StartBroadcastRequest req, IBroadcastService svc) =>
{
    var broadcast = await svc.StartBroadcastAsync(req.Type, req.Url, req.Message, req.Duration, req.TagIds);
    return Results.Ok(broadcast);
}).RequireAuthorization();

app.MapPost("/broadcast/end", async (IBroadcastService svc) =>
{
    await svc.EndBroadcastAsync();
    return Results.Ok();
}).RequireAuthorization();

app.MapPost("/broadcast/start-media", async (HttpRequest request, IBroadcastService svc) =>
{
    if (!request.HasFormContentType)
    {
        return Results.BadRequest(new { error = "Multipart form data required" });
    }

    var form = await request.ReadFormAsync();

    var type = form["type"].ToString();
    var file = form.Files["file"];
    var tagIdsStr = form["tagIds"].ToString();

    if (string.IsNullOrEmpty(type) || file == null)
    {
        return Results.BadRequest(new { error = "Missing required fields: type and file" });
    }

    // Validate file size
    if (file.Length > MAX_BROADCAST_FILE_SIZE_BYTES)
    {
        return Results.BadRequest(new { error = $"File too large. Maximum size is {MAX_BROADCAST_FILE_SIZE_MB}MB" });
    }

    // Security: Validate file type against allowlists
    var allowedImageTypes = new[] { "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/bmp" };
    var allowedVideoTypes = new[] { "video/mp4", "video/webm", "video/ogg", "video/quicktime" };
    var allowedImageExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp" };
    var allowedVideoExtensions = new[] { ".mp4", ".webm", ".ogg", ".mov" };

    var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
    var contentType = file.ContentType.ToLowerInvariant();

    if (type == "image")
    {
        if (!allowedImageTypes.Contains(contentType) || !allowedImageExtensions.Contains(fileExtension))
        {
            return Results.BadRequest(new { error = $"Invalid image file. Allowed types: {string.Join(", ", allowedImageExtensions)}" });
        }
    }
    else if (type == "video")
    {
        if (!allowedVideoTypes.Contains(contentType) || !allowedVideoExtensions.Contains(fileExtension))
        {
            return Results.BadRequest(new { error = $"Invalid video file. Allowed types: {string.Join(", ", allowedVideoExtensions)}" });
        }
    }
    else
    {
        return Results.BadRequest(new { error = "Invalid type. Must be 'image' or 'video'" });
    }

    // Save file to wwwroot/broadcast-media directory
    var webRootPath = builder.Environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
    var broadcastMediaDir = Path.Combine(webRootPath, "broadcast-media");
    Directory.CreateDirectory(broadcastMediaDir);

    // Generate unique filename with original extension (fileExtension already declared above)
    var uniqueFileName = $"{Guid.NewGuid()}{fileExtension}";
    var filePath = Path.Combine(broadcastMediaDir, uniqueFileName);

    // Save file to disk
    using (var stream = new FileStream(filePath, FileMode.Create))
    {
        await file.CopyToAsync(stream);
    }

    // Generate URL for the media file
    var mediaUrl = $"/broadcast-media/{uniqueFileName}";

    // Parse tag IDs
    int[]? tagIds = null;
    if (!string.IsNullOrEmpty(tagIdsStr))
    {
        try
        {
            tagIds = System.Text.Json.JsonSerializer.Deserialize<int[]>(tagIdsStr);
        }
        catch
        {
            return Results.BadRequest(new { error = "Invalid tagIds format" });
        }
    }

    var broadcast = await svc.StartMediaBroadcastAsync(type, mediaUrl, null, tagIds);
    return Results.Ok(broadcast);
}).RequireAuthorization();

app.MapGet("/broadcast/active", async (IBroadcastService svc) =>
{
    var broadcast = await svc.GetActiveBroadcastAsync();
    // Return 200 OK with null instead of 404 to avoid console noise when polling
    return Results.Ok(broadcast);
}).RequireAuthorization();

app.MapGet("/broadcast/config", () =>
{
    return Results.Ok(new
    {
        maxFileSizeMB = MAX_BROADCAST_FILE_SIZE_MB,
        maxFileSizeBytes = MAX_BROADCAST_FILE_SIZE_BYTES
    });
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

    var role = context.Request.Query["role"].ToString() ?? "admin";
    var token = context.Request.Query["token"].ToString();
    var deviceId = context.Request.Query["deviceId"].ToString();

    // Resolve deviceId from token if provided (only for device connections, not admin)
    if (!string.IsNullOrEmpty(token) && string.IsNullOrEmpty(deviceId) && role.ToLowerInvariant() == "device")
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
    // Track how many admins are streaming from each device (reference counting)
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, int> ScreencastRefCount = new();
    // Track which device each admin connection is streaming from (for cleanup)
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, string> AdminStreamingDevice = new();

    public static async Task HandleAsync(HttpContext ctx, System.Net.WebSockets.WebSocket ws)
    {
        var role = (ctx.Request.Query["role"].ToString() ?? "admin").ToLowerInvariant();
        var deviceId = ctx.Items.ContainsKey("__resolvedDeviceId")
            ? ctx.Items["__resolvedDeviceId"]?.ToString()
            : ctx.Request.Query["deviceId"].ToString();
        string? adminConnectionId = null; // Track admin connection ID for cleanup
        int frameCounter = 0; // Track screencast frames for diagnostics

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
                            timeWindowStart = i.TimeWindowStart,
                            timeWindowEnd = i.TimeWindowEnd,
                            daysOfWeek = i.DaysOfWeek,
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
        else if (role == "admin")
        {
            // Validate JWT token for admin connections
            var token = ctx.Request.Query["token"].ToString();

            if (string.IsNullOrEmpty(token))
            {
                await ws.CloseAsync(System.Net.WebSockets.WebSocketCloseStatus.PolicyViolation, "Missing authentication token", CancellationToken.None);
                return;
            }

            try
            {
                var handler = new JwtSecurityTokenHandler();
                var secret = ctx.RequestServices.GetRequiredService<IConfiguration>()["Jwt:Secret"] ?? "dev-secret-key";
                var key = Encoding.UTF8.GetBytes(secret);

                var validationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = ctx.RequestServices.GetRequiredService<IConfiguration>()["Jwt:Issuer"] ?? "pds",
                    ValidAudience = ctx.RequestServices.GetRequiredService<IConfiguration>()["Jwt:Audience"] ?? "pds-clients",
                    IssuerSigningKey = new SymmetricSecurityKey(key)
                };

                handler.ValidateToken(token, validationParameters, out SecurityToken validatedToken);

                var jwtToken = (JwtSecurityToken)validatedToken;
                var username = jwtToken.Claims.FirstOrDefault(x => x.Type == ClaimTypes.Name)?.Value
                             ?? jwtToken.Claims.FirstOrDefault(x => x.Type == "sub")?.Value
                             ?? "unknown";

                // Use unique connection ID to allow same user from multiple locations
                var connectionId = $"{username}#{Guid.NewGuid().ToString("N")[..8]}";
                adminConnectionId = connectionId; // Store for cleanup in finally block
                Admins[connectionId] = ws;

                // Log successful admin connection
                Console.WriteLine($">>> RealtimeHub: Admin '{connectionId}' connected. Total admins: {Admins.Count}");
                try
                {
                    var logService = ctx.RequestServices.GetRequiredService<ILogService>();
                    await logService.AddLogAsync("Info",
                        $"Admin WebSocket connected: {connectionId} (user: {username})",
                        null,
                        "RealtimeHub");
                }
                catch { /* ignore logging errors */ }

                // Send device sync to admin
                await Send(ws, "admin:devices:sync", new { deviceIds = Devices.Keys.ToArray(), timestamp = DateTime.UtcNow });
            }
            catch (Exception ex)
            {
                await ws.CloseAsync(System.Net.WebSockets.WebSocketCloseStatus.PolicyViolation, "Invalid authentication token", CancellationToken.None);

                // Log failed admin connection attempt
                try
                {
                    var logService = ctx.RequestServices.GetRequiredService<ILogService>();
                    await logService.AddLogAsync("Warning",
                        $"Failed admin WebSocket connection: {ex.Message}",
                        null,
                        "RealtimeHub");
                }
                catch { /* ignore logging errors */ }

                return;
            }
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

                        // SECOND: Auto-assign playlists based on device tags
                        var deviceNumericId = await db.Devices.Where(d => d.DeviceId == deviceId).Select(d => d.Id).FirstOrDefaultAsync();
                        if (deviceNumericId != 0)
                        {
                            // Get device's tag IDs
                            var deviceTagIds = await db.DeviceTags
                                .Where(dt => dt.DeviceId == deviceNumericId)
                                .Select(dt => dt.TagId)
                                .ToListAsync();

                            if (deviceTagIds.Any())
                            {
                                // Find playlists assigned to these tags
                                var playlistsToAssign = await db.PlaylistTags
                                    .Where(pt => deviceTagIds.Contains(pt.TagId))
                                    .Select(pt => pt.PlaylistId)
                                    .Distinct()
                                    .ToListAsync();

                                // Auto-assign these playlists to the device if not already assigned
                                foreach (var playlistId in playlistsToAssign)
                                {
                                    var alreadyAssigned = await db.DevicePlaylists
                                        .AnyAsync(dp => dp.DeviceId == deviceNumericId && dp.PlaylistId == playlistId);

                                    if (!alreadyAssigned)
                                    {
                                        db.DevicePlaylists.Add(new DevicePlaylist { DeviceId = deviceNumericId, PlaylistId = playlistId });
                                        Serilog.Log.Information($"Auto-assigned playlist {playlistId} to device {deviceId} based on tags");
                                    }
                                }
                                await db.SaveChangesAsync();
                            }
                        }

                        // THIRD: Push playlist content after display is configured
                        var assigned = await db.DevicePlaylists.Where(x => x.DeviceId == deviceNumericId)
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
                                    timeWindowStart = i.TimeWindowStart,
                                    timeWindowEnd = i.TimeWindowEnd,
                                    daysOfWeek = i.DaysOfWeek,
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
                    // Materialize payload to avoid JsonDocument disposal issues
                    var stateJson = payload.ToString();
                    var stateObj = System.Text.Json.JsonSerializer.Deserialize<object>(stateJson);
                    BroadcastAdmins("admin:playback:state", new { deviceId, state = stateObj, timestamp = DateTime.UtcNow });
                    break;
                case "screencast:frame":
                    // Forward live screencast frames to admin clients in real-time
                    frameCounter++;
                    if (frameCounter % 30 == 0) // Log every 30 frames
                    {
                        Console.WriteLine($">>> RealtimeHub: Received frame #{frameCounter} from device '{deviceId}', broadcasting to {Admins.Count} admins");
                    }

                    // Materialize metadata to avoid JsonDocument disposal issues
                    var metadataElement = payload.GetProperty("metadata");
                    var metadataObj = new
                    {
                        sessionId = metadataElement.TryGetProperty("sessionId", out var sid) ? sid.GetInt32() : 0,
                        timestamp = metadataElement.TryGetProperty("timestamp", out var ts) ? ts.GetInt64() : 0,
                        width = metadataElement.TryGetProperty("width", out var w) ? w.GetInt32() : 1280,
                        height = metadataElement.TryGetProperty("height", out var h) ? h.GetInt32() : 720
                    };

                    BroadcastAdmins("admin:screencast:frame", new
                    {
                        deviceId,
                        data = payload.GetProperty("data").GetString(),
                        metadata = metadataObj
                    });
                    break;
                case "admin:screencast:start":
                    // Admin requesting to start screencast for a device
                    Console.WriteLine($">>> RealtimeHub: Received screencast:start, role='{role}', adminConnectionId='{adminConnectionId ?? "NULL"}'");
                    if (role == "admin" && !string.IsNullOrEmpty(adminConnectionId))
                    {
                        try
                        {
                            var targetDeviceId = payload.GetProperty("deviceId").GetString();
                            Console.WriteLine($">>> RealtimeHub: Target deviceId='{targetDeviceId}'");
                            if (!string.IsNullOrEmpty(targetDeviceId))
                            {
                                // Track which device this admin is streaming from
                                AdminStreamingDevice[adminConnectionId] = targetDeviceId;
                                Console.WriteLine($">>> RealtimeHub: Admin '{adminConnectionId}' requesting screencast from device '{targetDeviceId}'");
                                await StartScreencast(targetDeviceId);
                            }
                            else
                            {
                                Console.WriteLine($">>> RealtimeHub: ERROR - targetDeviceId is null or empty");
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($">>> RealtimeHub: ERROR parsing screencast:start payload: {ex.Message}");
                        }
                    }
                    else
                    {
                        Console.WriteLine($">>> RealtimeHub: ERROR - Ignoring screencast:start (role={role}, adminConnectionId={adminConnectionId ?? "NULL"})");
                    }
                    break;
                case "admin:screencast:stop":
                    // Admin requesting to stop screencast for a device
                    if (role == "admin" && !string.IsNullOrEmpty(adminConnectionId))
                    {
                        var targetDeviceId = payload.GetProperty("deviceId").GetString();
                        if (!string.IsNullOrEmpty(targetDeviceId))
                        {
                            // Remove tracking
                            AdminStreamingDevice.TryRemove(adminConnectionId, out _);
                            Console.WriteLine($">>> RealtimeHub: Admin '{adminConnectionId}' stopping screencast from device '{targetDeviceId}'");
                            await StopScreencast(targetDeviceId);
                        }
                    }
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
            else if (role == "admin" && !string.IsNullOrEmpty(adminConnectionId))
            {
                Admins.TryRemove(adminConnectionId, out _);
                Console.WriteLine($">>> RealtimeHub: Admin '{adminConnectionId}' disconnected. Remaining admins: {Admins.Count}");
                Serilog.Log.Information("Admin {ConnectionId} disconnected", adminConnectionId);

                // If this admin was streaming from a device, stop the screencast
                if (AdminStreamingDevice.TryRemove(adminConnectionId, out var streamingDeviceId))
                {
                    Console.WriteLine($">>> RealtimeHub: Admin '{adminConnectionId}' was streaming from device '{streamingDeviceId}', stopping screencast");
                    _ = StopScreencast(streamingDeviceId); // Fire and forget cleanup
                }
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

    // Screencast reference counting helpers
    public static async Task StartScreencast(string deviceId)
    {
        var refCount = ScreencastRefCount.AddOrUpdate(deviceId, 1, (_, count) => count + 1);
        Console.WriteLine($">>> RealtimeHub: Screencast ref count for '{deviceId}': {refCount}");

        // Only send start command if this is the first admin streaming
        if (refCount == 1)
        {
            Console.WriteLine($">>> RealtimeHub: Starting screencast for '{deviceId}' (first admin)");
            await SendToDevice(deviceId, "screencast:start", new { });
        }
        else
        {
            Console.WriteLine($">>> RealtimeHub: Screencast already running for '{deviceId}' ({refCount} admin(s) streaming)");
        }
    }

    public static async Task StopScreencast(string deviceId)
    {
        if (ScreencastRefCount.TryGetValue(deviceId, out var currentCount))
        {
            var newCount = Math.Max(0, currentCount - 1);
            if (newCount == 0)
            {
                ScreencastRefCount.TryRemove(deviceId, out _);
                Console.WriteLine($">>> RealtimeHub: Stopping screencast for '{deviceId}' (last admin disconnected)");
                await SendToDevice(deviceId, "screencast:stop", new { });
            }
            else
            {
                ScreencastRefCount[deviceId] = newCount;
                Console.WriteLine($">>> RealtimeHub: Screencast ref count for '{deviceId}': {newCount} (keeping stream alive)");
            }
        }
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

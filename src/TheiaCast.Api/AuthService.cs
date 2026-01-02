using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using OtpNet;
using TheiaCast.Api.Contracts;

namespace TheiaCast.Api;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterDto dto);
    Task<AuthResponse> LoginAsync(LoginDto dto);
    Task<AuthResponse> RefreshAsync(RefreshDto dto);
    Task ChangePasswordAsync(string username, string currentPassword, string newPassword);
    Task<MfaSetupResponse> SetupMfaAsync(string username);
    Task EnableMfaAsync(string username, string code);
    Task DisableMfaAsync(string username);
    Task<UserDto> MeAsync(ClaimsPrincipal user);
}

public class AuthService : IAuthService
{
    private readonly IConfiguration _config;
    private readonly PdsDbContext _db;
    private readonly ILogService _logService;

    public AuthService(IConfiguration config, PdsDbContext db, ILogService logService)
    {
        _config = config;
        _db = db;
        _logService = logService;
    }

    public async Task<AuthResponse> RegisterAsync(RegisterDto dto)
    {
        // Check if user already exists
        var existingUser = await _db.Users.FirstOrDefaultAsync(u => u.Username == dto.Username);
        if (existingUser != null)
        {
            // Log failed registration attempt
            await _logService.AddLogAsync("Warning",
                $"Failed registration attempt: Username '{dto.Username}' already exists",
                null,
                "AuthService");
            throw new Exception("Username already exists");
        }

        // Hash the password with bcrypt
        var passwordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password, BCrypt.Net.BCrypt.GenerateSalt(12));

        // Create new user
        var user = new User
        {
            Username = dto.Username,
            PasswordHash = passwordHash,
            PasswordVersion = "bcrypt",
            IsMfaEnabled = false
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        // Log successful registration
        await _logService.AddLogAsync("Info",
            $"New user registered: '{user.Username}' (ID: {user.Id})",
            null,
            "AuthService");

        return GenerateTokens(user);
    }

    public async Task<AuthResponse> LoginAsync(LoginDto dto)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == dto.Username);
        if (user == null)
        {
            // Log failed login attempt
            await _logService.AddLogAsync("Warning",
                $"Failed login attempt: User '{dto.Username}' not found",
                null,
                "AuthService");
            throw new Exception("Invalid credentials");
        }

        // Verify password based on version (supports gradual migration from SHA256 to bcrypt)
        bool passwordValid = false;
        bool needsUpgrade = false;

        if (user.PasswordVersion == "bcrypt")
        {
            // Verify with bcrypt
            passwordValid = BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash);
        }
        else
        {
            // Verify with SHA256 (legacy)
            using var sha256 = System.Security.Cryptography.SHA256.Create();
            var bytes = System.Text.Encoding.UTF8.GetBytes(dto.Password);
            var hash = BitConverter.ToString(sha256.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
            passwordValid = user.PasswordHash == hash;
            needsUpgrade = passwordValid; // Upgrade to bcrypt on successful login
        }

        if (!passwordValid)
        {
            // Log failed login attempt
            await _logService.AddLogAsync("Warning",
                $"Failed login attempt: Invalid password for user '{dto.Username}'",
                null,
                "AuthService");
            throw new Exception("Invalid credentials");
        }

        // Upgrade password hash to bcrypt if needed
        if (needsUpgrade)
        {
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password, BCrypt.Net.BCrypt.GenerateSalt(12));
            user.PasswordVersion = "bcrypt";
            await _db.SaveChangesAsync();

            await _logService.AddLogAsync("Info",
                $"Password hash upgraded to bcrypt for user '{dto.Username}'",
                null,
                "AuthService");
        }

        if (user.IsMfaEnabled)
        {
            if (string.IsNullOrEmpty(dto.MfaCode))
            {
                throw new Exception("MFA_REQUIRED");
            }

            var totp = new Totp(Base32Encoding.ToBytes(user.MfaSecret));
            if (!totp.VerifyTotp(dto.MfaCode, out _, VerificationWindow.RfcSpecifiedNetworkDelay))
            {
                // Log failed MFA attempt
                await _logService.AddLogAsync("Warning",
                    $"Failed MFA verification for user '{dto.Username}'",
                    null,
                    "AuthService");
                throw new Exception("Invalid MFA code");
            }
        }

        // Update last login timestamp
        user.LastLoginAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        // Log successful login
        await _logService.AddLogAsync("Info",
            $"User logged in: '{user.Username}' (ID: {user.Id}){(user.IsMfaEnabled ? " with MFA" : "")}",
            null,
            "AuthService");

        return GenerateTokens(user);
    }

    public async Task<AuthResponse> RefreshAsync(RefreshDto dto)
    {
        // Validate refresh token from database
        var refreshToken = await _db.RefreshTokens
            .Include(rt => rt.User)
            .FirstOrDefaultAsync(rt => rt.Token == dto.RefreshToken);

        if (refreshToken == null)
        {
            await _logService.AddLogAsync("Warning",
                "Invalid refresh token attempted",
                null,
                "AuthService");
            throw new Exception("Invalid refresh token");
        }

        if (refreshToken.IsRevoked)
        {
            await _logService.AddLogAsync("Warning",
                $"Revoked refresh token attempted for user '{refreshToken.User?.Username}'",
                null,
                "AuthService");
            throw new Exception("Refresh token has been revoked");
        }

        if (refreshToken.ExpiresAt < DateTime.UtcNow)
        {
            await _logService.AddLogAsync("Warning",
                $"Expired refresh token attempted for user '{refreshToken.User?.Username}'",
                null,
                "AuthService");
            throw new Exception("Refresh token has expired");
        }

        if (refreshToken.User == null)
        {
            await _logService.AddLogAsync("Error",
                "Refresh token has no associated user",
                null,
                "AuthService");
            throw new Exception("Invalid refresh token");
        }

        // Revoke old refresh token
        refreshToken.IsRevoked = true;
        await _db.SaveChangesAsync();

        // Log successful token refresh
        await _logService.AddLogAsync("Info",
            $"Access token refreshed for user '{refreshToken.User.Username}' (ID: {refreshToken.User.Id})",
            null,
            "AuthService");

        // Generate new tokens
        return GenerateTokens(refreshToken.User);
    }

    public async Task ChangePasswordAsync(string username, string currentPassword, string newPassword)
    {
        if (string.IsNullOrEmpty(newPassword) || newPassword.Length < 6)
            throw new Exception("New password must be at least 6 characters long");

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user == null) throw new Exception("User not found");

        // Verify current password based on version (supports both bcrypt and SHA256)
        bool currentPasswordValid = false;

        if (user.PasswordVersion == "bcrypt")
        {
            // Verify with bcrypt
            currentPasswordValid = BCrypt.Net.BCrypt.Verify(currentPassword, user.PasswordHash);
        }
        else
        {
            // Verify with SHA256 (legacy)
            using var sha256 = System.Security.Cryptography.SHA256.Create();
            var currentBytes = System.Text.Encoding.UTF8.GetBytes(currentPassword);
            var currentHash = BitConverter.ToString(sha256.ComputeHash(currentBytes)).Replace("-", "").ToLowerInvariant();
            currentPasswordValid = user.PasswordHash == currentHash;
        }

        if (!currentPasswordValid)
        {
            // Log failed password change attempt
            await _logService.AddLogAsync("Warning",
                $"Failed password change attempt: Incorrect current password for user '{username}'",
                null,
                "AuthService");
            throw new Exception("Current password is incorrect");
        }

        // Always hash new password with bcrypt
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword, BCrypt.Net.BCrypt.GenerateSalt(12));
        user.PasswordVersion = "bcrypt";
        await _db.SaveChangesAsync();

        // Log successful password change
        await _logService.AddLogAsync("Info",
            $"Password changed for user '{username}' (ID: {user.Id}) - upgraded to bcrypt",
            null,
            "AuthService");
    }

    public async Task<MfaSetupResponse> SetupMfaAsync(string username)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user == null) throw new Exception("User not found");

        var key = KeyGeneration.GenerateRandomKey(20);
        var secret = Base32Encoding.ToString(key);

        user.MfaSecret = secret;
        await _db.SaveChangesAsync();

        var qrCodeUri = $"otpauth://totp/PDS:{username}?secret={secret}&issuer=PDS";
        return new MfaSetupResponse(secret, qrCodeUri);
    }

    public async Task EnableMfaAsync(string username, string code)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user == null) throw new Exception("User not found");
        if (string.IsNullOrEmpty(user.MfaSecret)) throw new Exception("MFA setup not initiated");

        var totp = new Totp(Base32Encoding.ToBytes(user.MfaSecret));
        if (!totp.VerifyTotp(code, out _, VerificationWindow.RfcSpecifiedNetworkDelay))
        {
            // Log failed MFA enablement attempt
            await _logService.AddLogAsync("Warning",
                $"Failed MFA enablement attempt: Invalid code for user '{username}'",
                null,
                "AuthService");
            throw new Exception("Invalid MFA code");
        }

        user.IsMfaEnabled = true;
        await _db.SaveChangesAsync();

        // Log successful MFA enablement
        await _logService.AddLogAsync("Info",
            $"MFA enabled for user '{username}' (ID: {user.Id})",
            null,
            "AuthService");
    }

    public async Task DisableMfaAsync(string username)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user == null) throw new Exception("User not found");

        user.IsMfaEnabled = false;
        user.MfaSecret = null;
        await _db.SaveChangesAsync();

        // Log MFA disablement
        await _logService.AddLogAsync("Info",
            $"MFA disabled for user '{username}' (ID: {user.Id})",
            null,
            "AuthService");
    }

    public async Task<UserDto> MeAsync(ClaimsPrincipal principal)
    {
        var username = principal.Identity?.Name;
        if (username == null) return new UserDto(0, "guest", false, null, null, null);
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user == null) return new UserDto(0, "guest", false, null, null, null);
        return new UserDto(user.Id, user.Username, user.IsMfaEnabled, user.Email, user.DisplayName, user.LastLoginAt);
    }

    private AuthResponse GenerateTokens(User user)
    {
        var issuer = _config["Jwt:Issuer"] ?? "pds";
        var audience = _config["Jwt:Audience"] ?? "pds-clients";
        var secret = _config["Jwt:Secret"] ?? "dev-secret-key";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Username),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim("userId", user.Id.ToString())
        };

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: creds
        );

        var accessToken = new JwtSecurityTokenHandler().WriteToken(token);
        var refreshTokenValue = Guid.NewGuid().ToString("n");

        // Store refresh token in database
        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = refreshTokenValue,
            ExpiresAt = DateTime.UtcNow.AddDays(7), // 7 day expiration
            CreatedAt = DateTime.UtcNow
        };
        _db.RefreshTokens.Add(refreshToken);
        _db.SaveChanges(); // Synchronous save for immediate availability

        return new AuthResponse(accessToken, refreshTokenValue);
    }
}

public static class AuthHelpers
{
    public static AuthResponse GenerateTokens(string username, IConfiguration config)
    {
        var issuer = config["Jwt:Issuer"] ?? "pds";
        var audience = config["Jwt:Audience"] ?? "pds-clients";
        var secret = config["Jwt:Secret"] ?? "dev-secret-key";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, username),
            new Claim(ClaimTypes.Name, username)
        };

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: creds
        );

        var accessToken = new JwtSecurityTokenHandler().WriteToken(token);
        var refreshToken = Guid.NewGuid().ToString("n");
        return new AuthResponse(accessToken, refreshToken);
    }
}

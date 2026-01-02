using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.IO.Compression;
using Microsoft.EntityFrameworkCore;
using TheiaCast.Api.Contracts;

namespace TheiaCast.Api;

public interface ILicenseService
{
    // Generation
    Task<License> GenerateLicenseAsync(string tier, int maxDevices, string? companyName, DateTime? expiresAt);

    // Activation
    Task<License> ActivateLicenseAsync(string licenseKey, int deviceId);

    // Validation
    Task<LicenseValidationResult> ValidateLicenseAsync(int licenseId);
    Task<bool> CanAddDeviceAsync(int? licenseId);

    // Management
    Task<IEnumerable<License>> GetAllLicensesAsync();
    Task<License?> GetLicenseByIdAsync(int id);
    Task<License?> GetLicenseByKeyAsync(string key);
    Task RevokeLicenseAsync(int id);
    Task UpdateLicenseAsync(int id, UpdateLicenseDto dto);

    // Grace Period
    Task CheckAndEnforceGracePeriodAsync();

    // License Key Decoding (V2 keys with embedded metadata)
    Task<LicensePayload?> DecodeLicenseKeyAsync(string licenseKey);

    // Additive Licensing - Total allowance across all active licenses
    Task<int> GetTotalDeviceAllowanceAsync();
    Task<List<License>> GetActiveLicensesAsync();
    Task<LicenseTotalStatus> GetLicenseTotalStatusAsync();
}

public record LicenseValidationResult(
    bool IsValid,
    string? Reason,
    bool IsInGracePeriod,
    DateTime? GracePeriodEndsAt
);

public record LicenseTotalStatus(
    int TotalMaxDevices,
    int CurrentDevices,
    List<LicenseInfo> ActiveLicenses,
    bool IsValid,
    bool HasAnyGracePeriod,
    DateTime? EarliestGracePeriodEnd,
    string? Reason
);

public record LicenseInfo(
    int Id,
    string Tier,
    int MaxDevices,
    int CurrentDevices,
    string? CompanyName,
    DateTime? ExpiresAt,
    bool IsExpired,
    bool IsPerpetual
);

public class LicenseService : ILicenseService
{
    private readonly PdsDbContext _db;
    private readonly ILogger<LicenseService> _logger;
    private readonly IConfiguration _config;
    private readonly ILogService _logService;

    public LicenseService(
        PdsDbContext db,
        ILogger<LicenseService> logger,
        IConfiguration config,
        ILogService logService)
    {
        _db = db;
        _logger = logger;
        _config = config;
        _logService = logService;
    }

    public async Task<License> GenerateLicenseAsync(string tier, int maxDevices, string? companyName, DateTime? expiresAt)
    {
        var key = await GenerateLicenseKeyAsync(tier);
        var keyHash = await ComputeLicenseKeyHashAsync(key);

        var license = new License
        {
            Key = key,
            KeyHash = keyHash,
            Tier = tier,
            MaxDevices = maxDevices,
            CompanyName = companyName,
            ExpiresAt = expiresAt,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.Licenses.Add(license);
        await _db.SaveChangesAsync();

        await _logService.AddLogAsync("Info", $"License generated: {tier} - {maxDevices} devices", null, "LicenseService");

        return license;
    }

    public async Task<License> ActivateLicenseAsync(string licenseKey, int deviceId)
    {
        var keyHash = await ComputeLicenseKeyHashAsync(licenseKey);
        var license = await _db.Licenses.FirstOrDefaultAsync(l => l.KeyHash == keyHash);

        if (license == null)
        {
            // Try to decode as V2 license (external purchase from webhook)
            var payload = await DecodeLicenseKeyAsync(licenseKey);
            if (payload != null)
            {
                // Valid V2 license - import it into database
                _logger.LogInformation($"Importing external V2 license: {payload.t}, {payload.d} devices");

                license = new License
                {
                    Key = licenseKey,
                    KeyHash = keyHash,
                    Tier = payload.t,
                    MaxDevices = payload.d,
                    CompanyName = payload.c,
                    ExpiresAt = payload.GetExpiryDate(),
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    ActivatedAt = DateTime.UtcNow
                };

                _db.Licenses.Add(license);
                await _db.SaveChangesAsync();

                await _logService.AddLogAsync("Info",
                    $"Imported external license: {payload.t} - {payload.d} devices",
                    null, "LicenseService");
            }
            else
            {
                throw new InvalidOperationException("Invalid license key");
            }
        }

        if (!license.IsActive)
        {
            throw new InvalidOperationException("License is not active");
        }

        if (license.ExpiresAt.HasValue && license.ExpiresAt.Value < DateTime.UtcNow)
        {
            throw new InvalidOperationException("License has expired");
        }

        var device = await _db.Devices.FindAsync(deviceId);
        if (device == null)
        {
            throw new InvalidOperationException("Device not found");
        }

        // Check if device already has a license
        if (device.LicenseId.HasValue)
        {
            throw new InvalidOperationException("Device already has a license assigned");
        }

        // Check if license has capacity
        var currentDeviceCount = await _db.Devices.CountAsync(d => d.LicenseId == license.Id);
        if (currentDeviceCount >= license.MaxDevices)
        {
            throw new InvalidOperationException("License has reached maximum device limit");
        }

        // Assign license to device
        device.LicenseId = license.Id;
        device.LicenseActivatedAt = DateTime.UtcNow;
        license.CurrentDeviceCount = currentDeviceCount + 1;

        if (!license.ActivatedAt.HasValue)
        {
            license.ActivatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();

        await _logService.AddLogAsync("Info", $"License activated on device {device.DeviceId}", device.DeviceId, "LicenseService");

        return license;
    }

    public async Task<LicenseValidationResult> ValidateLicenseAsync(int licenseId)
    {
        var license = await _db.Licenses.FindAsync(licenseId);
        if (license == null)
        {
            return new LicenseValidationResult(false, "License not found", false, null);
        }

        if (!license.IsActive)
        {
            return new LicenseValidationResult(false, "License is not active", false, null);
        }

        // Check expiration from database
        if (license.ExpiresAt.HasValue && license.ExpiresAt.Value < DateTime.UtcNow)
        {
            return new LicenseValidationResult(false, "License has expired", false, null);
        }

        // For V2 licenses, also check embedded expiration (self-enforcing)
        var payload = await DecodeLicenseKeyAsync(license.Key);
        if (payload != null && payload.IsExpired())
        {
            // Automatically deactivate expired V2 licenses
            license.IsActive = false;
            await _db.SaveChangesAsync();
            await _logService.AddLogAsync("Warning", $"License {license.Id} auto-deactivated: expired on {payload.e}", null, "LicenseService");
            return new LicenseValidationResult(false, $"License expired on {payload.e}", false, null);
        }

        var deviceCount = await _db.Devices.CountAsync(d => d.LicenseId == licenseId);

        if (deviceCount > license.MaxDevices)
        {
            // Check for grace period
            var violation = await _db.LicenseViolations
                .Where(v => v.LicenseId == licenseId && !v.Resolved)
                .OrderByDescending(v => v.DetectedAt)
                .FirstOrDefaultAsync();

            if (violation != null)
            {
                var isInGracePeriod = DateTime.UtcNow <= violation.GracePeriodEndsAt;
                return new LicenseValidationResult(
                    isInGracePeriod,
                    $"Device limit exceeded ({deviceCount}/{license.MaxDevices})",
                    isInGracePeriod,
                    violation.GracePeriodEndsAt
                );
            }

            return new LicenseValidationResult(false, $"Device limit exceeded ({deviceCount}/{license.MaxDevices})", false, null);
        }

        return new LicenseValidationResult(true, null, false, null);
    }

    public async Task<bool> CanAddDeviceAsync(int? licenseId)
    {
        if (!licenseId.HasValue)
        {
            return true; // No license restriction
        }

        var validation = await ValidateLicenseAsync(licenseId.Value);
        return validation.IsValid || validation.IsInGracePeriod;
    }

    public async Task<IEnumerable<License>> GetAllLicensesAsync()
    {
        return await _db.Licenses.OrderByDescending(l => l.CreatedAt).ToListAsync();
    }

    public async Task<License?> GetLicenseByIdAsync(int id)
    {
        return await _db.Licenses.FindAsync(id);
    }

    public async Task<License?> GetLicenseByKeyAsync(string key)
    {
        var keyHash = await ComputeLicenseKeyHashAsync(key);
        return await _db.Licenses.FirstOrDefaultAsync(l => l.KeyHash == keyHash);
    }

    public async Task RevokeLicenseAsync(int id)
    {
        var license = await _db.Licenses.FindAsync(id);
        if (license == null)
        {
            throw new InvalidOperationException("License not found");
        }

        // Prevent deletion of free license (it's permanent)
        if (license.Tier == "free")
        {
            throw new InvalidOperationException("Cannot revoke the free license");
        }

        // Find the free license to reassign devices
        var freeLicense = await _db.Licenses.FirstOrDefaultAsync(l => l.Tier == "free");
        if (freeLicense == null)
        {
            throw new InvalidOperationException("Free license not found - cannot reassign devices");
        }

        // Reassign all devices from this license to the free license
        var devicesUsingLicense = await _db.Devices.Where(d => d.LicenseId == id).ToListAsync();
        foreach (var device in devicesUsingLicense)
        {
            device.LicenseId = freeLicense.Id;
            device.LicenseActivatedAt = DateTime.UtcNow;
        }

        // Update device counts
        license.CurrentDeviceCount = 0;
        freeLicense.CurrentDeviceCount = await _db.Devices.CountAsync(d => d.LicenseId == freeLicense.Id);

        // Delete the license from the database
        _db.Licenses.Remove(license);
        await _db.SaveChangesAsync();

        await _logService.AddLogAsync("Warning",
            $"License deleted: {license.Tier} ({license.Key}). {devicesUsingLicense.Count} devices reassigned to free license.",
            null, "LicenseService");
    }

    public async Task UpdateLicenseAsync(int id, UpdateLicenseDto dto)
    {
        var license = await _db.Licenses.FindAsync(id);
        if (license == null)
        {
            throw new InvalidOperationException("License not found");
        }

        if (dto.IsActive.HasValue)
        {
            license.IsActive = dto.IsActive.Value;
        }

        if (dto.ExpiresAt.HasValue)
        {
            license.ExpiresAt = dto.ExpiresAt.Value;
        }

        if (dto.Notes != null)
        {
            license.Notes = dto.Notes;
        }

        await _db.SaveChangesAsync();

        await _logService.AddLogAsync("Info", $"License updated: {license.Tier}", null, "LicenseService");
    }

    public async Task CheckAndEnforceGracePeriodAsync()
    {
        var licenses = await _db.Licenses.Where(l => l.IsActive).ToListAsync();

        foreach (var license in licenses)
        {
            var deviceCount = await _db.Devices.CountAsync(d => d.LicenseId == license.Id);

            if (deviceCount > license.MaxDevices)
            {
                // Check if violation already exists
                var existingViolation = await _db.LicenseViolations
                    .Where(v => v.LicenseId == license.Id && !v.Resolved)
                    .OrderByDescending(v => v.DetectedAt)
                    .FirstOrDefaultAsync();

                if (existingViolation == null)
                {
                    // Create new violation with 7-day grace period
                    var gracePeriodDays = _config.GetValue<int>("License:GracePeriodDays", 7);
                    var violation = new LicenseViolation
                    {
                        LicenseId = license.Id,
                        ViolationType = "over_limit",
                        DeviceCount = deviceCount,
                        MaxAllowed = license.MaxDevices,
                        DetectedAt = DateTime.UtcNow,
                        GracePeriodEndsAt = DateTime.UtcNow.AddDays(gracePeriodDays)
                    };
                    _db.LicenseViolations.Add(violation);

                    await _logService.AddLogAsync("Warning",
                        $"License {license.Id} exceeded device limit: {deviceCount}/{license.MaxDevices}. Grace period: {gracePeriodDays} days",
                        null, "LicenseService");
                }
                else if (DateTime.UtcNow > existingViolation.GracePeriodEndsAt)
                {
                    // Grace period expired - enforce hard limit
                    license.IsActive = false;
                    existingViolation.Resolved = true;

                    await _logService.AddLogAsync("Warning",
                        $"License {license.Id} deactivated: grace period expired", null, "LicenseService");
                }
            }
            else
            {
                // Device count is within limit - resolve any existing violations
                var violations = await _db.LicenseViolations
                    .Where(v => v.LicenseId == license.Id && !v.Resolved)
                    .ToListAsync();

                foreach (var violation in violations)
                {
                    violation.Resolved = true;
                }

                if (violations.Any())
                {
                    await _logService.AddLogAsync("Info",
                        $"License {license.Id} violations resolved: device count within limit", null, "LicenseService");
                }
            }

            // Update current device count
            license.CurrentDeviceCount = deviceCount;
            license.LastValidatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
    }

    // Additive Licensing Methods
    public async Task<int> GetTotalDeviceAllowanceAsync()
    {
        var activeLicenses = await GetActiveLicensesAsync();
        return activeLicenses.Sum(l => l.MaxDevices);
    }

    public async Task<List<License>> GetActiveLicensesAsync()
    {
        var licenses = await _db.Licenses
            .Where(l => l.IsActive)
            .ToListAsync();

        var activeLicenses = new List<License>();

        foreach (var license in licenses)
        {
            // Skip expired licenses (both database and embedded expiration)
            if (license.ExpiresAt.HasValue && license.ExpiresAt.Value < DateTime.UtcNow)
            {
                continue;
            }

            // For V2 licenses, check embedded expiration
            var payload = await DecodeLicenseKeyAsync(license.Key);
            if (payload != null && payload.IsExpired())
            {
                continue;
            }

            activeLicenses.Add(license);
        }

        return activeLicenses;
    }

    public async Task<LicenseTotalStatus> GetLicenseTotalStatusAsync()
    {
        var activeLicenses = await GetActiveLicensesAsync();
        var totalDeviceCount = await _db.Devices.CountAsync();
        var totalMaxDevices = activeLicenses.Sum(l => l.MaxDevices);

        var licenseInfos = new List<LicenseInfo>();
        var hasAnyGracePeriod = false;
        DateTime? earliestGracePeriodEnd = null;
        var reasons = new List<string>();

        foreach (var license in activeLicenses)
        {
            var deviceCount = await _db.Devices.CountAsync(d => d.LicenseId == license.Id);
            var payload = await DecodeLicenseKeyAsync(license.Key);

            var licenseInfo = new LicenseInfo(
                Id: license.Id,
                Tier: license.Tier,
                MaxDevices: license.MaxDevices,
                CurrentDevices: deviceCount,
                CompanyName: payload?.c ?? license.CompanyName,
                ExpiresAt: license.ExpiresAt,
                IsExpired: payload?.IsExpired() ?? (license.ExpiresAt.HasValue && license.ExpiresAt.Value < DateTime.UtcNow),
                IsPerpetual: payload?.IsPerpetual() ?? !license.ExpiresAt.HasValue
            );

            licenseInfos.Add(licenseInfo);

            // Check for grace period on individual license
            var validation = await ValidateLicenseAsync(license.Id);
            if (validation.IsInGracePeriod)
            {
                hasAnyGracePeriod = true;
                if (!earliestGracePeriodEnd.HasValue || validation.GracePeriodEndsAt < earliestGracePeriodEnd)
                {
                    earliestGracePeriodEnd = validation.GracePeriodEndsAt;
                }
            }

            if (!validation.IsValid && !string.IsNullOrEmpty(validation.Reason))
            {
                reasons.Add($"{license.Tier}: {validation.Reason}");
            }
        }

        // Overall validity: within total allowance OR in grace period
        var isValid = totalDeviceCount <= totalMaxDevices || hasAnyGracePeriod;
        var reason = reasons.Any() ? string.Join("; ", reasons) : null;

        if (!isValid && totalDeviceCount > totalMaxDevices)
        {
            reason = $"Total device limit exceeded ({totalDeviceCount}/{totalMaxDevices})";
        }

        return new LicenseTotalStatus(
            TotalMaxDevices: totalMaxDevices,
            CurrentDevices: totalDeviceCount,
            ActiveLicenses: licenseInfos,
            IsValid: isValid,
            HasAnyGracePeriod: hasAnyGracePeriod,
            EarliestGracePeriodEnd: earliestGracePeriodEnd,
            Reason: reason
        );
    }

    private async Task<string> GenerateLicenseKeyAsync(string tier)
    {
        var random = Convert.ToBase64String(RandomNumberGenerator.GetBytes(12))
            .TrimEnd('=')
            .Replace("+", "-")
            .Replace("/", "_");

        var keyPreChecksum = $"LK-1-{tier.ToUpper()}-{random}";
        var checksum = (await ComputeChecksumAsync(keyPreChecksum)).Substring(0, 4).ToUpper();

        return $"{keyPreChecksum}-{checksum}";
    }

    private async Task<string> ComputeChecksumAsync(string input)
    {
        var secret = await GetInstallationKeyAsync();
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(hash);
    }

    private async Task<string> ComputeLicenseKeyHashAsync(string key)
    {
        var secret = await GetInstallationKeyAsync();
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(key));
        return Convert.ToHexString(hash).ToLower();
    }

    private async Task<string> GetInstallationKeyAsync()
    {
        var installationKey = await _db.AppSettings
            .FirstOrDefaultAsync(s => s.Key == "InstallationKey");

        if (installationKey == null)
        {
            throw new InvalidOperationException("Installation key not found. Please restart the backend to generate one.");
        }

        return installationKey.Value;
    }

    // Decode V2 license keys with embedded metadata
    public async Task<LicensePayload?> DecodeLicenseKeyAsync(string licenseKey)
    {
        try
        {
            // V2 format: LK-{version}-{encoded}-{signature}
            // Note: encoded payload may contain hyphens (URL-safe base64), so we can't just Split('-')

            if (!licenseKey.StartsWith("LK-"))
            {
                _logger.LogWarning("Invalid license key format - must start with LK-");
                return null;
            }

            // Extract version (second segment after first hyphen)
            var firstHyphen = licenseKey.IndexOf('-', 3); // After "LK-"
            if (firstHyphen == -1)
            {
                _logger.LogWarning("Invalid license key format - no version");
                return null;
            }

            var versionStr = licenseKey.Substring(3, firstHyphen - 3);
            if (!int.TryParse(versionStr, out var version))
            {
                _logger.LogWarning($"Invalid license version: {versionStr}");
                return null;
            }

            // V1 licenses don't have embedded metadata
            if (version == 1)
            {
                _logger.LogInformation("V1 license detected - no metadata to decode");
                return null;
            }

            // V2 licenses with embedded metadata
            if (version == 2)
            {
                // Find the last hyphen (signature separator)
                // Signature is always 8 characters at the end
                var lastHyphen = licenseKey.LastIndexOf('-');
                if (lastHyphen == -1 || lastHyphen == firstHyphen)
                {
                    _logger.LogWarning("Invalid V2 license format - no signature separator");
                    return null;
                }

                var encoded = licenseKey.Substring(firstHyphen + 1, lastHyphen - firstHyphen - 1);
                var signature = licenseKey.Substring(lastHyphen + 1);

                // Verify signature
                var hmacSecret = await GetInstallationKeyAsync();
                var expectedSignature = ComputeHmacSignature(encoded, hmacSecret);
                if (signature != expectedSignature)
                {
                    _logger.LogWarning("Invalid license signature - tampering detected");
                    return null;
                }

                // Decode and decompress
                var compressed = Convert.FromBase64String(
                    encoded.Replace("-", "+").Replace("_", "/") + new string('=', (4 - encoded.Length % 4) % 4)
                );
                var json = DecompressString(compressed);

                // Deserialize
                var payload = JsonSerializer.Deserialize<LicensePayload>(json);
                return payload;
            }

            _logger.LogWarning($"Unsupported license version: {version}");
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to decode license key");
            return null;
        }
    }

    private string ComputeHmacSignature(string data, string hmacSecret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(hmacSecret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(data));
        return Convert.ToBase64String(hash)
            .Substring(0, 8)
            .Replace("+", "-")
            .Replace("/", "_")
            .TrimEnd('=');
    }

    private string DecompressString(byte[] compressed)
    {
        using var inputStream = new MemoryStream(compressed);
        using var gzipStream = new GZipStream(inputStream, CompressionMode.Decompress);
        using var outputStream = new MemoryStream();
        gzipStream.CopyTo(outputStream);
        return Encoding.UTF8.GetString(outputStream.ToArray());
    }
}

// License payload structure for V2 keys
public class LicensePayload
{
    public int v { get; set; }        // Version
    public string t { get; set; } = string.Empty;   // Tier
    public int d { get; set; }        // Max devices
    public string? c { get; set; }    // Company name (optional)
    public string? e { get; set; }    // Expiry date (YYYY-MM-DD) or null for perpetual
    public string i { get; set; } = string.Empty;   // Issued date (YYYY-MM-DD)
    public string? u { get; set; }    // Unique ID (optional, for webhook-generated licenses)

    public DateTime? GetExpiryDate()
    {
        if (string.IsNullOrEmpty(e))
            return null;

        // Parse as UTC to avoid timezone issues with PostgreSQL
        var date = DateTime.Parse(e);
        return DateTime.SpecifyKind(date, DateTimeKind.Utc);
    }

    public DateTime GetIssuedDate()
    {
        var date = DateTime.Parse(i);
        return DateTime.SpecifyKind(date, DateTimeKind.Utc);
    }

    public bool IsExpired()
    {
        var expiry = GetExpiryDate();
        return expiry.HasValue && DateTime.UtcNow > expiry.Value;
    }

    public bool IsPerpetual()
    {
        return string.IsNullOrEmpty(e);
    }
}

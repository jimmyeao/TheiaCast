using Microsoft.EntityFrameworkCore;

namespace TheiaCast.Api;

public partial class PdsDbContext : DbContext
{
    public PdsDbContext(DbContextOptions<PdsDbContext> options) : base(options) {}
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<DeviceLog> DeviceLogs => Set<DeviceLog>();
    public DbSet<ContentItem> Content => Set<ContentItem>();
    public DbSet<Playlist> Playlists => Set<Playlist>();
    public DbSet<PlaylistItem> PlaylistItems => Set<PlaylistItem>();
    public DbSet<DevicePlaylist> DevicePlaylists => Set<DevicePlaylist>();
    public DbSet<Screenshot> Screenshots => Set<Screenshot>();
    public DbSet<DeviceBroadcastState> DeviceBroadcastStates => Set<DeviceBroadcastState>();
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Log> Logs => Set<Log>();
    public DbSet<AppSettings> AppSettings => Set<AppSettings>();
    public DbSet<Broadcast> Broadcasts => Set<Broadcast>();
    public DbSet<License> Licenses => Set<License>();
    public DbSet<LicenseViolation> LicenseViolations => Set<LicenseViolation>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<DeviceTag> DeviceTags => Set<DeviceTag>();
    public DbSet<PlaylistTag> PlaylistTags => Set<PlaylistTag>();
}

public class User
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? MfaSecret { get; set; }
    public bool IsMfaEnabled { get; set; }
    public string? Email { get; set; }
    public string? DisplayName { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public string PasswordVersion { get; set; } = "sha256"; // sha256 or bcrypt
}

public class RefreshToken
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsRevoked { get; set; } = false;
}

public class Device
{
    public int Id { get; set; }
    public string DeviceId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Token { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Device metadata
    public string? Description { get; set; }
    public string? Location { get; set; }

    // Display Configuration (nullable - will use client .env defaults if not set)
    public int? DisplayWidth { get; set; }
    public int? DisplayHeight { get; set; }
    public bool? KioskMode { get; set; }

    // License tracking
    public int? LicenseId { get; set; }
    public License? License { get; set; }
    public DateTime? LicenseActivatedAt { get; set; }

    // Tags
    public ICollection<DeviceTag> DeviceTags { get; set; } = new List<DeviceTag>();
}

public class DeviceLog
{
    public int Id { get; set; }
    public int DeviceId { get; set; }
    public Device? Device { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class ContentItem
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Url { get; set; }
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Auto-authentication fields
    public string? UsernameSelector { get; set; }  // CSS selector for username field
    public string? PasswordSelector { get; set; }  // CSS selector for password field
    public string? SubmitSelector { get; set; }    // CSS selector for submit button
    public string? Username { get; set; }          // Username to fill
    public string? Password { get; set; }          // Password to fill (encrypted in production!)
    public bool AutoLogin { get; set; } = false;   // Enable auto-login for this content
    public int? DefaultDuration { get; set; }      // Default duration in seconds (e.g. for slideshows)

    // Cached thumbnail
    public string? ThumbnailBase64 { get; set; }   // Cached thumbnail preview image
}

public class Playlist
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public ICollection<PlaylistItem> Items { get; set; } = new List<PlaylistItem>();
    public ICollection<PlaylistTag> PlaylistTags { get; set; } = new List<PlaylistTag>();
}

public class PlaylistItem
{
    public int Id { get; set; }
    public int PlaylistId { get; set; }
    public Playlist? Playlist { get; set; }
    public int? ContentId { get; set; }
    public string Url { get; set; } = string.Empty;
    public int? DurationSeconds { get; set; }
    public int? OrderIndex { get; set; }
    public string? TimeWindowStart { get; set; }
    public string? TimeWindowEnd { get; set; }
    public string? DaysOfWeek { get; set; }
}

public class DevicePlaylist
{
    public int Id { get; set; }
    public int DeviceId { get; set; }
    public Device? Device { get; set; }
    public int PlaylistId { get; set; }
    public Playlist? Playlist { get; set; }
}

public class Screenshot
{
    public int Id { get; set; }
    public string DeviceStringId { get; set; } = string.Empty;
    public string ImageBase64 { get; set; } = string.Empty;
    public string? CurrentUrl { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class DeviceBroadcastState
{
    public int Id { get; set; }
    public int DeviceId { get; set; }
    public Device? Device { get; set; }
    public int? OriginalPlaylistId { get; set; }
    public Playlist? OriginalPlaylist { get; set; }
    public string BroadcastUrl { get; set; } = string.Empty;
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
}

public class Log
{
    public int Id { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string Level { get; set; } = "Info"; // Info, Warning, Error
    public string Message { get; set; } = string.Empty;
    public string? DeviceId { get; set; } // Device ID string (optional - for device-related logs)
    public string? Source { get; set; } // Component/service that logged this
    public string? StackTrace { get; set; } // For errors
    public string? AdditionalData { get; set; } // JSON for extra context

    // Audit logging fields
    public int? UserId { get; set; } // User who performed the action
    public User? User { get; set; } // Navigation property
    public string? Username { get; set; } // Username at time of action (denormalized for audit trail)
    public string? Action { get; set; } // e.g., "device.update", "playlist.delete", "user.login"
    public string? EntityType { get; set; } // e.g., "Device", "Playlist", "Content"
    public int? EntityId { get; set; } // ID of the entity that was acted upon
    public string? OldValue { get; set; } // JSON of old state (for updates)
    public string? NewValue { get; set; } // JSON of new state (for updates/creates)
    public string? IpAddress { get; set; } // Client IP address
    public string? UserAgent { get; set; } // Client user agent
}

public class AppSettings
{
    public int Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class Broadcast
{
    public int Id { get; set; }
    public string Type { get; set; } = string.Empty; // "url" or "message"
    public string? Url { get; set; }
    public string? Message { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EndedAt { get; set; }
}

public class License
{
    public int Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public string KeyHash { get; set; } = string.Empty;
    public string Tier { get; set; } = "free"; // free, pro-10, pro-20, pro-50, pro-100, enterprise
    public int MaxDevices { get; set; } = 3;
    public int CurrentDeviceCount { get; set; } = 0;
    public string? CompanyName { get; set; }
    public string? ContactEmail { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? ExpiresAt { get; set; }
    public DateTime? ActivatedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastValidatedAt { get; set; }
    public string? Notes { get; set; }
}

public class LicenseViolation
{
    public int Id { get; set; }
    public int? LicenseId { get; set; }
    public License? License { get; set; }
    public string ViolationType { get; set; } = string.Empty; // over_limit, expired, inactive
    public int DeviceCount { get; set; }
    public int MaxAllowed { get; set; }
    public DateTime DetectedAt { get; set; } = DateTime.UtcNow;
    public DateTime GracePeriodEndsAt { get; set; }
    public bool Resolved { get; set; } = false;
}

public class Tag
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = "#3B82F6"; // Default blue color
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<DeviceTag> DeviceTags { get; set; } = new List<DeviceTag>();
    public ICollection<PlaylistTag> PlaylistTags { get; set; } = new List<PlaylistTag>();
}

public class DeviceTag
{
    public int Id { get; set; }
    public int DeviceId { get; set; }
    public Device? Device { get; set; }
    public int TagId { get; set; }
    public Tag? Tag { get; set; }
    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
}

public class PlaylistTag
{
    public int Id { get; set; }
    public int PlaylistId { get; set; }
    public Playlist? Playlist { get; set; }
    public int TagId { get; set; }
    public Tag? Tag { get; set; }
    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
}

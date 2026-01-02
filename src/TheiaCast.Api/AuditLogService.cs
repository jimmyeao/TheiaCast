using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace TheiaCast.Api;

public class AuditLogService
{
    private readonly PdsDbContext _db;
    private readonly ILogger<AuditLogService> _logger;

    public AuditLogService(PdsDbContext db, ILogger<AuditLogService> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Log a user action to the audit trail
    /// </summary>
    public async Task LogActionAsync(
        int? userId,
        string? username,
        string action,
        string? entityType = null,
        int? entityId = null,
        object? oldValue = null,
        object? newValue = null,
        string? ipAddress = null,
        string? userAgent = null,
        string? message = null)
    {
        try
        {
            var log = new Log
            {
                Timestamp = DateTime.UtcNow,
                Level = "Info",
                Message = message ?? $"User {username ?? "Unknown"} performed {action}",
                Source = "AuditLog",
                UserId = userId,
                Username = username,
                Action = action,
                EntityType = entityType,
                EntityId = entityId,
                OldValue = oldValue != null ? JsonSerializer.Serialize(oldValue) : null,
                NewValue = newValue != null ? JsonSerializer.Serialize(newValue) : null,
                IpAddress = ipAddress,
                UserAgent = userAgent
            };

            _db.Logs.Add(log);
            await _db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write audit log for action {Action}", action);
        }
    }

    /// <summary>
    /// Log authentication events (login, logout)
    /// </summary>
    public async Task LogAuthEventAsync(
        int? userId,
        string? username,
        string eventType, // "login", "logout", "login.failed", "mfa.enabled", "mfa.disabled"
        string? ipAddress = null,
        string? userAgent = null,
        string? details = null)
    {
        await LogActionAsync(
            userId: userId,
            username: username,
            action: $"auth.{eventType}",
            entityType: "User",
            entityId: userId,
            ipAddress: ipAddress,
            userAgent: userAgent,
            message: $"User {username ?? "Unknown"} {eventType}: {details}"
        );
    }

    /// <summary>
    /// Log device-related actions
    /// </summary>
    public async Task LogDeviceActionAsync(
        int? userId,
        string? username,
        string actionType, // "create", "update", "delete", "token.rotate"
        int deviceId,
        object? oldValue = null,
        object? newValue = null,
        string? ipAddress = null,
        string? userAgent = null)
    {
        await LogActionAsync(
            userId: userId,
            username: username,
            action: $"device.{actionType}",
            entityType: "Device",
            entityId: deviceId,
            oldValue: oldValue,
            newValue: newValue,
            ipAddress: ipAddress,
            userAgent: userAgent,
            message: $"User {username ?? "Unknown"} {actionType} device {deviceId}"
        );
    }

    /// <summary>
    /// Log content-related actions
    /// </summary>
    public async Task LogContentActionAsync(
        int? userId,
        string? username,
        string actionType, // "create", "update", "delete"
        int contentId,
        object? oldValue = null,
        object? newValue = null,
        string? ipAddress = null,
        string? userAgent = null)
    {
        await LogActionAsync(
            userId: userId,
            username: username,
            action: $"content.{actionType}",
            entityType: "Content",
            entityId: contentId,
            oldValue: oldValue,
            newValue: newValue,
            ipAddress: ipAddress,
            userAgent: userAgent,
            message: $"User {username ?? "Unknown"} {actionType} content {contentId}"
        );
    }

    /// <summary>
    /// Log playlist-related actions
    /// </summary>
    public async Task LogPlaylistActionAsync(
        int? userId,
        string? username,
        string actionType, // "create", "update", "delete", "assign", "unassign"
        int playlistId,
        object? oldValue = null,
        object? newValue = null,
        string? ipAddress = null,
        string? userAgent = null)
    {
        await LogActionAsync(
            userId: userId,
            username: username,
            action: $"playlist.{actionType}",
            entityType: "Playlist",
            entityId: playlistId,
            oldValue: oldValue,
            newValue: newValue,
            ipAddress: ipAddress,
            userAgent: userAgent,
            message: $"User {username ?? "Unknown"} {actionType} playlist {playlistId}"
        );
    }

    /// <summary>
    /// Log user management actions
    /// </summary>
    public async Task LogUserActionAsync(
        int? actorUserId,
        string? actorUsername,
        string actionType, // "create", "update", "delete", "password.change"
        int targetUserId,
        object? oldValue = null,
        object? newValue = null,
        string? ipAddress = null,
        string? userAgent = null)
    {
        await LogActionAsync(
            userId: actorUserId,
            username: actorUsername,
            action: $"user.{actionType}",
            entityType: "User",
            entityId: targetUserId,
            oldValue: oldValue,
            newValue: newValue,
            ipAddress: ipAddress,
            userAgent: userAgent,
            message: $"User {actorUsername ?? "Unknown"} {actionType} user {targetUserId}"
        );
    }

    /// <summary>
    /// Get audit logs with optional filtering
    /// </summary>
    public async Task<List<Log>> GetAuditLogsAsync(
        int? userId = null,
        string? action = null,
        string? entityType = null,
        DateTime? startDate = null,
        DateTime? endDate = null,
        int pageSize = 100,
        int skip = 0)
    {
        IQueryable<Log> query = _db.Logs
            .Where(l => l.Action != null); // Only audit logs (not general logs)

        if (userId.HasValue)
            query = query.Where(l => l.UserId == userId.Value);

        if (!string.IsNullOrEmpty(action))
            query = query.Where(l => l.Action == action);

        if (!string.IsNullOrEmpty(entityType))
            query = query.Where(l => l.EntityType == entityType);

        if (startDate.HasValue)
            query = query.Where(l => l.Timestamp >= startDate.Value);

        if (endDate.HasValue)
            query = query.Where(l => l.Timestamp <= endDate.Value);

        return await query
            .OrderByDescending(l => l.Timestamp)
            .Skip(skip)
            .Take(pageSize)
            .ToListAsync();
    }

    /// <summary>
    /// Clean up old audit logs based on retention policy
    /// </summary>
    public async Task CleanupOldLogsAsync(int retentionDays)
    {
        var cutoffDate = DateTime.UtcNow.AddDays(-retentionDays);
        var oldLogs = await _db.Logs
            .Where(l => l.Timestamp < cutoffDate && l.Action != null)
            .ToListAsync();

        if (oldLogs.Any())
        {
            _db.Logs.RemoveRange(oldLogs);
            await _db.SaveChangesAsync();
            _logger.LogInformation("Cleaned up {Count} old audit logs older than {Days} days", oldLogs.Count, retentionDays);
        }
    }
}

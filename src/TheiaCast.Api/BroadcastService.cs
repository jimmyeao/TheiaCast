using Microsoft.EntityFrameworkCore;
using TheiaCast.Api.Contracts;

namespace TheiaCast.Api;

public interface IBroadcastService
{
    Task<object> StartBroadcastAsync(string type, string? url, string? message, int? duration, int[]? tagIds);
    Task<object> StartMediaBroadcastAsync(string type, string mediaData, int? duration, int[]? tagIds);
    Task EndBroadcastAsync();
    Task<object?> GetActiveBroadcastAsync();
}

public class BroadcastService : IBroadcastService
{
    private readonly PdsDbContext _db;
    private readonly ILogger<BroadcastService> _logger;

    public BroadcastService(PdsDbContext db, ILogger<BroadcastService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<object> StartBroadcastAsync(string type, string? url, string? message, int? duration, int[]? tagIds)
    {
        // End any active broadcast first
        await EndBroadcastAsync();

        // Create new broadcast
        var broadcast = new Broadcast
        {
            Type = type,
            Url = url,
            Message = message,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.Broadcasts.Add(broadcast);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Broadcast started: {Type} - {Url}{Message} Duration: {Duration}ms", type, url, message, duration);

        // Load broadcast settings (only for MESSAGE type)
        string? background = null;
        string? logo = null;
        string? logoPosition = null;

        if (type == "message")
        {
            var bgSetting = await _db.AppSettings.FirstOrDefaultAsync(s => s.Key == "broadcast.background");
            var logoSetting = await _db.AppSettings.FirstOrDefaultAsync(s => s.Key == "broadcast.logo");
            var logoPosSetting = await _db.AppSettings.FirstOrDefaultAsync(s => s.Key == "broadcast.logoPosition");

            background = bgSetting?.Value;
            logo = logoSetting?.Value;
            logoPosition = logoPosSetting?.Value ?? "top-left";

            _logger.LogInformation("Loaded broadcast settings - Background: {BgLength} chars, Logo: {LogoLength} chars, Position: {Position}",
                background?.Length ?? 0, logo?.Length ?? 0, logoPosition);
        }

        // Send broadcast to devices (filtered by tags or all devices)
        var payload = new BroadcastPayload(type, url, message, duration, background, logo, logoPosition, null);
        await SendBroadcastToDevicesAsync(payload, tagIds);

        _logger.LogInformation(">>> Broadcast sent successfully");

        // Save broadcast state for each targeted device
        await SaveBroadcastStateForDevicesAsync(url ?? "", tagIds);

        return new { id = broadcast.Id, type = broadcast.Type, url = broadcast.Url, message = broadcast.Message };
    }

    private async Task SendBroadcastToDevicesAsync(BroadcastPayload payload, int[]? tagIds)
    {
        if (tagIds != null && tagIds.Length > 0)
        {
            // Tag-based filtering: send to specific devices
            var deviceIds = await _db.DeviceTags
                .Where(dt => tagIds.Contains(dt.TagId))
                .Select(dt => dt.Device.DeviceId)
                .Distinct()
                .ToListAsync();

            _logger.LogInformation(">>> Broadcasting to {Count} devices with tags - Event: {Event}",
                deviceIds.Count, ServerToClientEvent.BROADCAST_START);

            foreach (var deviceId in deviceIds)
            {
                await RealtimeHub.SendToDevice(deviceId, ServerToClientEvent.BROADCAST_START, payload);
            }
        }
        else
        {
            // Broadcast to all devices
            _logger.LogInformation(">>> Broadcasting to all devices - Event: {Event}",
                ServerToClientEvent.BROADCAST_START);
            await RealtimeHub.BroadcastToDevicesAsync(ServerToClientEvent.BROADCAST_START, payload);
        }
    }

    private async Task SaveBroadcastStateForDevicesAsync(string broadcastIdentifier, int[]? tagIds)
    {
        // Get targeted devices
        var devices = tagIds != null && tagIds.Length > 0
            ? await _db.Devices
                .Where(d => _db.DeviceTags.Any(dt => dt.DeviceId == d.Id && tagIds.Contains(dt.TagId)))
                .ToListAsync()
            : await _db.Devices.ToListAsync();

        foreach (var device in devices)
        {
            // Get current playlist for this device
            var devicePlaylist = await _db.DevicePlaylists
                .Where(dp => dp.DeviceId == device.Id)
                .OrderByDescending(dp => dp.Id)
                .FirstOrDefaultAsync();

            // Remove existing broadcast state if any
            var existingState = await _db.DeviceBroadcastStates
                .FirstOrDefaultAsync(dbs => dbs.DeviceId == device.Id);
            if (existingState != null)
            {
                _db.DeviceBroadcastStates.Remove(existingState);
            }

            // Create new broadcast state
            var broadcastState = new DeviceBroadcastState
            {
                DeviceId = device.Id,
                OriginalPlaylistId = devicePlaylist?.PlaylistId,
                BroadcastUrl = broadcastIdentifier,
                StartedAt = DateTime.UtcNow
            };
            _db.DeviceBroadcastStates.Add(broadcastState);
        }

        await _db.SaveChangesAsync();
    }

    public async Task<object> StartMediaBroadcastAsync(string type, string mediaUrl, int? duration, int[]? tagIds)
    {
        // End any active broadcast first
        await EndBroadcastAsync();

        // Create new broadcast
        var broadcast = new Broadcast
        {
            Type = type,
            Url = mediaUrl,  // Store media URL
            Message = $"{type} broadcast",  // Descriptive message
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.Broadcasts.Add(broadcast);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Media broadcast started: {Type} - Duration: {Duration}ms, Media URL: {Url}",
            type, duration, mediaUrl);

        // Send broadcast to devices (filtered by tags or all devices)
        // mediaUrl is passed as both url and mediaData for backward compatibility
        var payload = new BroadcastPayload(type, mediaUrl, null, duration, null, null, null, mediaUrl);
        await SendBroadcastToDevicesAsync(payload, tagIds);

        _logger.LogInformation(">>> Media broadcast sent successfully");

        // Save broadcast state for each targeted device
        await SaveBroadcastStateForDevicesAsync($"{type}-broadcast", tagIds);

        return new { id = broadcast.Id, type = broadcast.Type, message = broadcast.Message };
    }

    public async Task EndBroadcastAsync()
    {
        // Find active broadcast
        var activeBroadcast = await _db.Broadcasts
            .Where(b => b.IsActive)
            .FirstOrDefaultAsync();

        if (activeBroadcast != null)
        {
            activeBroadcast.IsActive = false;
            activeBroadcast.EndedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            _logger.LogInformation("Broadcast ended: {Id}", activeBroadcast.Id);

            // Notify all devices to end broadcast
            await RealtimeHub.BroadcastToDevicesAsync(ServerToClientEvent.BROADCAST_END, new { });

            // Clear broadcast states
            var broadcastStates = await _db.DeviceBroadcastStates.ToListAsync();
            _db.DeviceBroadcastStates.RemoveRange(broadcastStates);
            await _db.SaveChangesAsync();
        }
    }

    public async Task<object?> GetActiveBroadcastAsync()
    {
        var broadcast = await _db.Broadcasts
            .Where(b => b.IsActive)
            .OrderByDescending(b => b.CreatedAt)
            .FirstOrDefaultAsync();

        if (broadcast == null) return null;

        return new
        {
            id = broadcast.Id,
            type = broadcast.Type,
            url = broadcast.Url,
            message = broadcast.Message,
            createdAt = broadcast.CreatedAt
        };
    }
}

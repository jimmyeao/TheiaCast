using Microsoft.EntityFrameworkCore;
using TheiaCast.Api.Contracts;

namespace TheiaCast.Api;

public interface IPlaylistService
{
    Task<object> CreatePlaylistAsync(CreatePlaylistDto dto);
    Task<IEnumerable<object>> GetPlaylistsAsync();
    Task<object?> GetPlaylistAsync(int id);
    Task<object> UpdatePlaylistAsync(int id, UpdatePlaylistDto dto);
    Task RemovePlaylistAsync(int id);

    Task<object> CreateItemAsync(CreatePlaylistItemDto dto);
    Task<IEnumerable<object>> GetItemsAsync(int playlistId);
    Task<object> UpdateItemAsync(int id, UpdatePlaylistItemDto dto);
    Task<int> RemoveItemAsync(int id);

    Task<object> AssignAsync(AssignPlaylistDto dto);
    Task<IEnumerable<object>> GetDevicePlaylistsAsync(int deviceId);
    Task<IEnumerable<object>> GetPlaylistDevicesAsync(int playlistId);
    Task UnassignAsync(int deviceId, int playlistId);

    // Content
    Task<object> CreateContentAsync(CreateContentDto dto);
    Task<IEnumerable<object>> GetAllContentAsync();
    Task<object?> GetContentAsync(int id);
    Task<object> UpdateContentAsync(int id, UpdateContentDto dto);
    Task RemoveContentAsync(int id);
}

public class PlaylistService : IPlaylistService
{
    private readonly PdsDbContext _db;
    private readonly ILogService _logService;

    public PlaylistService(PdsDbContext db, ILogService logService)
    {
        _db = db;
        _logService = logService;
    }

    public async Task<object> CreatePlaylistAsync(CreatePlaylistDto dto)
    {
        var p = new Playlist { Name = dto.Name, IsActive = dto.IsActive ?? true };
        _db.Playlists.Add(p);
        await _db.SaveChangesAsync();
        return new { id = p.Id, p.Name, isActive = p.IsActive };
    }

    public async Task<IEnumerable<object>> GetPlaylistsAsync()
    {
        var playlists = await _db.Playlists.OrderBy(p => p.Id).ToListAsync();

        var result = new List<object>();
        foreach (var p in playlists)
        {
            // Get items with content info
            var items = await (from i in _db.PlaylistItems
                              where i.PlaylistId == p.Id
                              join c in _db.Content on i.ContentId equals c.Id into contentGroup
                              from c in contentGroup.DefaultIfEmpty()
                              orderby i.OrderIndex ?? i.Id
                              select new
                              {
                                  id = i.Id,
                                  playlistId = i.PlaylistId,
                                  contentId = i.ContentId,
                                  url = i.Url,
                                  displayDuration = (i.DurationSeconds ?? 0) * 1000,
                                  orderIndex = i.OrderIndex ?? 0,
                                  timeWindowStart = i.TimeWindowStart,
                                  timeWindowEnd = i.TimeWindowEnd,
                                  daysOfWeek = i.DaysOfWeek,
                                  content = c == null ? null : new { id = c.Id, name = c.Name, url = c.Url }
                              }).ToListAsync();

            // Get device assignments
            var devicePlaylists = await _db.DevicePlaylists
                .Where(dp => dp.PlaylistId == p.Id)
                .Join(_db.Devices, dp => dp.DeviceId, d => d.Id, (dp, d) => new
                {
                    id = dp.Id,
                    deviceId = d.Id,
                    playlistId = p.Id
                })
                .ToListAsync();

            // Get tags
            var tags = await _db.PlaylistTags
                .Where(pt => pt.PlaylistId == p.Id)
                .Join(_db.Tags, pt => pt.TagId, t => t.Id, (pt, t) => new
                {
                    id = t.Id,
                    name = t.Name,
                    color = t.Color
                })
                .ToListAsync();

            result.Add(new
            {
                id = p.Id,
                name = p.Name,
                isActive = p.IsActive,
                items,
                devicePlaylists,
                tags
            });
        }

        return result;
    }

    public async Task<object?> GetPlaylistAsync(int id)
    {
        var p = await _db.Playlists.FindAsync(id);
        if (p == null) return null;

        var itemsQuery = from i in _db.PlaylistItems
                    where i.PlaylistId == id
                    join c in _db.Content on i.ContentId equals c.Id into contentGroup
                    from c in contentGroup.DefaultIfEmpty()
                    orderby i.OrderIndex ?? i.Id
                    select new
                    {
                        id = i.Id,
                        playlistId = i.PlaylistId,
                        contentId = i.ContentId,
                        url = i.Url,
                        durationSeconds = i.DurationSeconds,
                        orderIndex = i.OrderIndex ?? 0,
                        timeWindowStart = i.TimeWindowStart,
                        timeWindowEnd = i.TimeWindowEnd,
                        daysOfWeek = i.DaysOfWeek,
                        content = c == null ? null : new { id = c.Id, name = c.Name, url = c.Url, requiresInteraction = false }
                    };

        var items = await itemsQuery.ToListAsync();

        // Get device assignments
        var devicePlaylists = await _db.DevicePlaylists
            .Where(dp => dp.PlaylistId == id)
            .Join(_db.Devices, dp => dp.DeviceId, d => d.Id, (dp, d) => new
            {
                id = dp.Id,
                deviceId = d.Id,
                playlistId = id
            })
            .ToListAsync();

        // Get tags
        var tags = await _db.PlaylistTags
            .Where(pt => pt.PlaylistId == id)
            .Join(_db.Tags, pt => pt.TagId, t => t.Id, (pt, t) => new
            {
                id = t.Id,
                name = t.Name,
                color = t.Color
            })
            .ToListAsync();

        return new { id = p.Id, name = p.Name, isActive = p.IsActive, items, devicePlaylists, tags };
    }

    public async Task<object> UpdatePlaylistAsync(int id, UpdatePlaylistDto dto)
    {
        var p = await _db.Playlists.FindAsync(id);
        if (p == null) return new { error = "not_found" };
        if (!string.IsNullOrWhiteSpace(dto.Name)) p.Name = dto.Name!;
        if (dto.IsActive != null) p.IsActive = dto.IsActive.Value;
        await _db.SaveChangesAsync();
        return new { id = p.Id, name = p.Name, isActive = p.IsActive };
    }

    public async Task RemovePlaylistAsync(int id)
    {
        var p = await _db.Playlists.FindAsync(id);
        if (p == null) return;
        _db.Playlists.Remove(p);
        await _db.SaveChangesAsync();
    }

    public async Task<object> CreateItemAsync(CreatePlaylistItemDto dto)
    {
        // Resolve content URL by ContentId, fall back to empty string
        var content = await _db.Content.FindAsync(dto.ContentId);
        var url = content?.Url ?? "";
        var i = new PlaylistItem
        {
            PlaylistId = dto.PlaylistId,
            ContentId = dto.ContentId,
            Url = url,
            DurationSeconds = (dto.DisplayDuration <= 0 ? 0 : dto.DisplayDuration / 1000),
            OrderIndex = dto.OrderIndex,
            TimeWindowStart = dto.TimeWindowStart,
            TimeWindowEnd = dto.TimeWindowEnd,
            // Empty array means "no constraint" - store as null
            DaysOfWeek = dto.DaysOfWeek != null && dto.DaysOfWeek.Length > 0
                ? System.Text.Json.JsonSerializer.Serialize(dto.DaysOfWeek)
                : null
        };
        _db.PlaylistItems.Add(i);
        await _db.SaveChangesAsync();

        // Broadcast updated playlist items to all assigned devices
        var pid = i.PlaylistId;
        var deviceIds = await _db.DevicePlaylists.Where(x => x.PlaylistId == pid)
            .Join(_db.Devices, dp => dp.DeviceId, d => d.Id, (dp, d) => d.DeviceId)
            .ToListAsync();

        var itemsQuery = from x in _db.PlaylistItems
                         where x.PlaylistId == pid
                         join c in _db.Content on x.ContentId equals c.Id into contentGroup
                         from c in contentGroup.DefaultIfEmpty()
                         orderby x.OrderIndex ?? x.Id
                         select new {
                             id = x.Id,
                             playlistId = x.PlaylistId,
                             contentId = x.ContentId,
                             displayDuration = (x.DurationSeconds ?? 0) * 1000,
                             orderIndex = x.OrderIndex ?? 0,
                             timeWindowStart = x.TimeWindowStart,
                             timeWindowEnd = x.TimeWindowEnd,
                             daysOfWeek = x.DaysOfWeek,
                             content = c == null ? null : new { id = c.Id, name = c.Name, url = c.Url, requiresInteraction = false }
                         };
        var items = await itemsQuery.ToListAsync();
        foreach (var devId in deviceIds)
        {
            await RealtimeHub.SendToDevice(devId, ServerToClientEvent.CONTENT_UPDATE, new { playlistId = pid, items });
        }

        return new { id = i.Id, playlistId = i.PlaylistId, contentId = i.ContentId, url = i.Url, displayDuration = (i.DurationSeconds ?? 0) * 1000, orderIndex = i.OrderIndex, timeWindowStart = i.TimeWindowStart, timeWindowEnd = i.TimeWindowEnd, daysOfWeek = i.DaysOfWeek };
    }

    public async Task<IEnumerable<object>> GetItemsAsync(int playlistId)
    {
        var query = from i in _db.PlaylistItems
                    where i.PlaylistId == playlistId
                    join c in _db.Content on i.ContentId equals c.Id into contentGroup
                    from c in contentGroup.DefaultIfEmpty()
                    orderby i.OrderIndex ?? i.Id
                    select new
                    {
                        id = i.Id,
                        playlistId = i.PlaylistId,
                        contentId = i.ContentId,
                        url = i.Url,
                        displayDuration = (i.DurationSeconds ?? 0) * 1000,
                        orderIndex = i.OrderIndex ?? 0,
                        timeWindowStart = i.TimeWindowStart,
                        timeWindowEnd = i.TimeWindowEnd,
                        daysOfWeek = i.DaysOfWeek,
                        content = c == null ? null : new { id = c.Id, name = c.Name, url = c.Url, requiresInteraction = false }
                    };

        return await query.ToListAsync();
    }

    public async Task<object> UpdateItemAsync(int id, UpdatePlaylistItemDto dto)
    {
        var i = await _db.PlaylistItems.FindAsync(id);
        if (i == null) return new { error = "not_found" };
        if (dto.DisplayDuration != null) i.DurationSeconds = (dto.DisplayDuration.Value <= 0 ? 0 : dto.DisplayDuration.Value / 1000);
        if (dto.OrderIndex != null) i.OrderIndex = dto.OrderIndex.Value;
        if (dto.TimeWindowStart != null) i.TimeWindowStart = dto.TimeWindowStart;
        if (dto.TimeWindowEnd != null) i.TimeWindowEnd = dto.TimeWindowEnd;
        if (dto.DaysOfWeek != null)
        {
            // Empty array means "no constraint" - clear the field
            i.DaysOfWeek = dto.DaysOfWeek.Length == 0 ? null : System.Text.Json.JsonSerializer.Serialize(dto.DaysOfWeek);
        }
        await _db.SaveChangesAsync();

        // Notify all devices assigned to this playlist with updated items
        var pid = i.PlaylistId;
        var deviceIds = await _db.DevicePlaylists.Where(x => x.PlaylistId == pid)
            .Join(_db.Devices, dp => dp.DeviceId, d => d.Id, (dp, d) => d.DeviceId)
            .ToListAsync();

        var itemsQuery = from x in _db.PlaylistItems
                         where x.PlaylistId == pid
                         join c in _db.Content on x.ContentId equals c.Id into contentGroup
                         from c in contentGroup.DefaultIfEmpty()
                         orderby x.OrderIndex ?? x.Id
                         select new {
                             id = x.Id,
                             playlistId = x.PlaylistId,
                             contentId = x.ContentId,
                             displayDuration = (x.DurationSeconds ?? 0) * 1000,
                             orderIndex = x.OrderIndex ?? 0,
                             timeWindowStart = x.TimeWindowStart,
                             timeWindowEnd = x.TimeWindowEnd,
                             daysOfWeek = x.DaysOfWeek,
                             content = c == null ? null : new { id = c.Id, name = c.Name, url = c.Url, requiresInteraction = false }
                         };
        var items = await itemsQuery.ToListAsync();
        foreach (var devId in deviceIds)
        {
            await RealtimeHub.SendToDevice(devId, ServerToClientEvent.CONTENT_UPDATE, new { playlistId = pid, items });
        }

        return new { id = i.Id, playlistId = i.PlaylistId, contentId = i.ContentId, url = i.Url, displayDuration = (i.DurationSeconds ?? 0) * 1000, orderIndex = i.OrderIndex, timeWindowStart = i.TimeWindowStart, timeWindowEnd = i.TimeWindowEnd, daysOfWeek = i.DaysOfWeek };
    }

    public async Task<int> RemoveItemAsync(int id)
    {
        var i = await _db.PlaylistItems.FindAsync(id);
        if (i == null) return 0;
        var pid = i.PlaylistId;
        _db.PlaylistItems.Remove(i);
        await _db.SaveChangesAsync();

        // Notify all devices assigned to this playlist with updated items
        var deviceIds = await _db.DevicePlaylists.Where(x => x.PlaylistId == pid)
            .Join(_db.Devices, dp => dp.DeviceId, d => d.Id, (dp, d) => d.DeviceId)
            .ToListAsync();

        var itemsQuery = from x in _db.PlaylistItems
                         where x.PlaylistId == pid
                         join c in _db.Content on x.ContentId equals c.Id into contentGroup
                         from c in contentGroup.DefaultIfEmpty()
                         orderby x.OrderIndex ?? x.Id
                         select new {
                             id = x.Id,
                             playlistId = x.PlaylistId,
                             contentId = x.ContentId,
                             displayDuration = (x.DurationSeconds ?? 0) * 1000,
                             orderIndex = x.OrderIndex ?? 0,
                             timeWindowStart = x.TimeWindowStart,
                             timeWindowEnd = x.TimeWindowEnd,
                             daysOfWeek = x.DaysOfWeek,
                             content = c == null ? null : new { id = c.Id, name = c.Name, url = c.Url, requiresInteraction = false }
                         };
        var items = await itemsQuery.ToListAsync();
        foreach (var devId in deviceIds)
        {
            await RealtimeHub.SendToDevice(devId, ServerToClientEvent.CONTENT_UPDATE, new { playlistId = pid, items });
        }
        return pid;
    }

    public async Task<object> AssignAsync(AssignPlaylistDto dto)
    {
        var device = await _db.Devices.FindAsync(dto.DeviceId);
        var playlist = await _db.Playlists.FindAsync(dto.PlaylistId);

        // Avoid duplicate assignment
        var exists = await _db.DevicePlaylists.AnyAsync(x => x.DeviceId == dto.DeviceId && x.PlaylistId == dto.PlaylistId);
        if (!exists)
        {
            var dp = new DevicePlaylist { DeviceId = dto.DeviceId, PlaylistId = dto.PlaylistId };
            _db.DevicePlaylists.Add(dp);
            await _db.SaveChangesAsync();

            // Log playlist assignment
            await _logService.AddLogAsync("Info",
                $"Playlist '{playlist?.Name}' (ID: {dto.PlaylistId}) assigned to device '{device?.Name}' (ID: {dto.DeviceId})",
                device?.DeviceId,
                "PlaylistService");
        }

        // Push content update to device if connected
        if (device != null)
        {
            var items = await _db.PlaylistItems.Where(i => i.PlaylistId == dto.PlaylistId)
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
            await RealtimeHub.SendToDevice(device.DeviceId, ServerToClientEvent.CONTENT_UPDATE, new { playlistId = dto.PlaylistId, items });
        }

        return new { deviceId = dto.DeviceId, playlistId = dto.PlaylistId };
    }

    public async Task<IEnumerable<object>> GetDevicePlaylistsAsync(int deviceId)
    {
        return await _db.DevicePlaylists.Where(x => x.DeviceId == deviceId)
            .Join(_db.Playlists, dp => dp.PlaylistId, p => p.Id, (dp, p) => new { id = p.Id, name = p.Name, isActive = p.IsActive })
            .Distinct()
            .ToListAsync();
    }

    public async Task<IEnumerable<object>> GetPlaylistDevicesAsync(int playlistId)
    {
        return await _db.DevicePlaylists.Where(x => x.PlaylistId == playlistId)
            .Join(_db.Devices, dp => dp.DeviceId, d => d.Id, (dp, d) => new { id = d.Id, deviceId = d.DeviceId, name = d.Name })
            .ToListAsync();
    }

    public async Task UnassignAsync(int deviceId, int playlistId)
    {
        var dp = await _db.DevicePlaylists.FirstOrDefaultAsync(x => x.DeviceId == deviceId && x.PlaylistId == playlistId);
        if (dp == null) return;

        var device = await _db.Devices.FindAsync(deviceId);
        var playlist = await _db.Playlists.FindAsync(playlistId);

        _db.DevicePlaylists.Remove(dp);
        await _db.SaveChangesAsync();

        // Log playlist unassignment
        await _logService.AddLogAsync("Info",
            $"Playlist '{playlist?.Name}' (ID: {playlistId}) unassigned from device '{device?.Name}' (ID: {deviceId})",
            device?.DeviceId,
            "PlaylistService");

        // If device has no more playlists, push empty content update
        var remaining = await _db.DevicePlaylists.AnyAsync(x => x.DeviceId == deviceId);
        if (device != null)
        {
            if (!remaining)
            {
                await RealtimeHub.SendToDevice(device.DeviceId, ServerToClientEvent.CONTENT_UPDATE, new { playlistId = 0, items = Array.Empty<object>() });
            }
            else
            {
                // Optionally, pick one playlist and push its items
                var nextPid = await _db.DevicePlaylists.Where(x => x.DeviceId == deviceId).Select(x => x.PlaylistId).FirstAsync();
                var items = await _db.PlaylistItems.Where(x => x.PlaylistId == nextPid)
                    .OrderBy(x => x.Id)
                    .Select(x => new
                    {
                        id = x.Id,
                        playlistId = nextPid,
                        contentId = x.Id,
                        displayDuration = (x.DurationSeconds ?? 0) * 1000,
                        orderIndex = x.Id,
                        timeWindowStart = x.TimeWindowStart,
                        timeWindowEnd = x.TimeWindowEnd,
                        daysOfWeek = x.DaysOfWeek,
                        content = new { id = x.Id, name = x.Url, url = x.Url, requiresInteraction = false }
                    })
                    .ToListAsync();
                await RealtimeHub.SendToDevice(device.DeviceId, ServerToClientEvent.CONTENT_UPDATE, new { playlistId = nextPid, items });
            }
        }
    }

    // Content
    public async Task<object> CreateContentAsync(CreateContentDto dto)
    {
        var c = new ContentItem
        {
            Name = dto.Name,
            Url = dto.Url,
            Description = dto.Description,
            UsernameSelector = dto.UsernameSelector,
            PasswordSelector = dto.PasswordSelector,
            SubmitSelector = dto.SubmitSelector,
            Username = dto.Username,
            Password = dto.Password,
            AutoLogin = dto.AutoLogin ?? false
        };
        _db.Content.Add(c);
        await _db.SaveChangesAsync();
        return new
        {
            id = c.Id,
            name = c.Name,
            url = c.Url,
            usernameSelector = c.UsernameSelector,
            passwordSelector = c.PasswordSelector,
            submitSelector = c.SubmitSelector,
            username = c.Username,
            password = c.Password,
            autoLogin = c.AutoLogin
        };
    }

    public async Task<IEnumerable<object>> GetAllContentAsync()
    {
        return await _db.Content.OrderBy(c => c.Id)
            .Select(c => new
            {
                id = c.Id,
                name = c.Name,
                url = c.Url,
                description = c.Description,
                usernameSelector = c.UsernameSelector,
                passwordSelector = c.PasswordSelector,
                submitSelector = c.SubmitSelector,
                username = c.Username,
                password = c.Password,
                autoLogin = c.AutoLogin,
                defaultDuration = c.DefaultDuration
            })
            .ToListAsync();
    }

    public async Task<object?> GetContentAsync(int id)
    {
        var c = await _db.Content.FindAsync(id);
        return c == null ? null : new
        {
            id = c.Id,
            name = c.Name,
            url = c.Url,
            usernameSelector = c.UsernameSelector,
            passwordSelector = c.PasswordSelector,
            submitSelector = c.SubmitSelector,
            username = c.Username,
            password = c.Password,
            autoLogin = c.AutoLogin,
            defaultDuration = c.DefaultDuration
        };
    }

    public async Task<object> UpdateContentAsync(int id, UpdateContentDto dto)
    {
        var c = await _db.Content.FindAsync(id);
        if (c == null) return new { error = "not_found" };
        if (!string.IsNullOrWhiteSpace(dto.Name)) c.Name = dto.Name!;
        if (!string.IsNullOrWhiteSpace(dto.Url)) c.Url = dto.Url!;
        if (dto.Description != null) c.Description = dto.Description;

        // Update auto-login fields
        if (dto.UsernameSelector != null) c.UsernameSelector = dto.UsernameSelector;
        if (dto.PasswordSelector != null) c.PasswordSelector = dto.PasswordSelector;
        if (dto.SubmitSelector != null) c.SubmitSelector = dto.SubmitSelector;
        if (dto.Username != null) c.Username = dto.Username;
        if (dto.Password != null) c.Password = dto.Password;
        if (dto.AutoLogin.HasValue) c.AutoLogin = dto.AutoLogin.Value;

        await _db.SaveChangesAsync();

        // Notify all devices with playlists containing this content
        // Get all playlists that contain this content
        var affectedPlaylistIds = await _db.PlaylistItems
            .Where(x => x.ContentId == id)
            .Select(x => x.PlaylistId)
            .Distinct()
            .ToListAsync();

        // For each affected playlist, notify all assigned devices
        foreach (var playlistId in affectedPlaylistIds)
        {
            var deviceIds = await _db.DevicePlaylists
                .Where(x => x.PlaylistId == playlistId)
                .Join(_db.Devices, dp => dp.DeviceId, d => d.Id, (dp, d) => d.DeviceId)
                .ToListAsync();

            var itemsQuery = from x in _db.PlaylistItems
                             where x.PlaylistId == playlistId
                             join content in _db.Content on x.ContentId equals content.Id into contentGroup
                             from content in contentGroup.DefaultIfEmpty()
                             orderby x.OrderIndex ?? x.Id
                             select new {
                                 id = x.Id,
                                 playlistId = x.PlaylistId,
                                 contentId = x.ContentId,
                                 displayDuration = (x.DurationSeconds ?? 0) * 1000,
                                 orderIndex = x.OrderIndex ?? 0,
                                 timeWindowStart = x.TimeWindowStart,
                                 timeWindowEnd = x.TimeWindowEnd,
                                 daysOfWeek = x.DaysOfWeek,
                                 content = content == null ? null : new { id = content.Id, name = content.Name, url = content.Url, requiresInteraction = false }
                             };
            var items = await itemsQuery.ToListAsync();

            foreach (var devId in deviceIds)
            {
                await RealtimeHub.SendToDevice(devId, ServerToClientEvent.CONTENT_UPDATE, new { playlistId, items });
            }
        }

        return new { id = c.Id, name = c.Name, url = c.Url, description = c.Description };
    }

    public async Task RemoveContentAsync(int id)
    {
        var c = await _db.Content.FindAsync(id);
        if (c == null) return;

        // Remove all playlist items referencing this content
        var items = await _db.PlaylistItems.Where(i => i.ContentId == id).ToListAsync();
        if (items.Any())
        {
            _db.PlaylistItems.RemoveRange(items);
        }

        _db.Content.Remove(c);
        await _db.SaveChangesAsync();
    }
}

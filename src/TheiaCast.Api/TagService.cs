using Microsoft.EntityFrameworkCore;
using TheiaCast.Api.Contracts;

namespace TheiaCast.Api
{
    public class TagService : ITagService
    {
        private readonly PdsDbContext _db;
        private readonly ILogger<TagService> _logger;

        public TagService(PdsDbContext db, ILogger<TagService> logger)
        {
            _db = db;
            _logger = logger;
        }

        public async Task<IResult> GetAllAsync()
        {
            _logger.LogInformation("Getting all tags");
            var tags = await _db.Tags
                .Select(t => new { t.Id, t.Name, t.Color, t.CreatedAt, DeviceCount = t.DeviceTags.Count })
                .ToListAsync();
            return Results.Ok(tags);
        }

        public async Task<IResult> GetByIdAsync(int id)
        {
            _logger.LogInformation("Getting tag by id {Id}", id);
            var tag = await _db.Tags
                .Where(t => t.Id == id)
                .Select(t => new { t.Id, t.Name, t.Color, t.CreatedAt, DeviceCount = t.DeviceTags.Count })
                .FirstOrDefaultAsync();
            return tag != null ? Results.Ok(tag) : Results.NotFound();
        }

        public async Task<IResult> CreateAsync(CreateTagDto dto)
        {
            _logger.LogInformation("Creating tag with name {Name}", dto.Name);
            var tag = new Tag { Name = dto.Name, Color = dto.Color ?? "#3B82F6" };
            _db.Tags.Add(tag);
            await _db.SaveChangesAsync();
            return Results.Ok(new { id = tag.Id, name = tag.Name, color = tag.Color });
        }

        public async Task<IResult> UpdateAsync(int id, UpdateTagDto dto)
        {
            _logger.LogInformation("Updating tag {Id}", id);
            var tag = await _db.Tags.FindAsync(id);
            if (tag == null) return Results.NotFound();

            if (dto.Name != null) tag.Name = dto.Name;
            if (dto.Color != null) tag.Color = dto.Color;

            await _db.SaveChangesAsync();
            return Results.Ok(new { id = tag.Id, name = tag.Name, color = tag.Color });
        }

        public async Task<IResult> DeleteAsync(int id)
        {
            _logger.LogInformation("Deleting tag {Id}", id);
            var tag = await _db.Tags.FindAsync(id);
            if (tag == null) return Results.NotFound();

            _db.Tags.Remove(tag);
            await _db.SaveChangesAsync();
            return Results.Ok(new { message = "Tag deleted successfully" });
        }

        public async Task<IResult> AssignToDeviceAsync(int deviceId, int tagId)
        {
            _logger.LogInformation("Assigning tag {TagId} to device {DeviceId}", tagId, deviceId);
            var exists = await _db.DeviceTags.AnyAsync(dt => dt.DeviceId == deviceId && dt.TagId == tagId);
            if (exists) return Results.Conflict(new { message = "Tag already assigned to device" });

            var deviceTag = new DeviceTag { DeviceId = deviceId, TagId = tagId };
            _db.DeviceTags.Add(deviceTag);
            await _db.SaveChangesAsync();

            // Auto-assign all playlists that have this tag to this device
            var playlistsWithTag = await _db.PlaylistTags
                .Where(pt => pt.TagId == tagId)
                .Select(pt => pt.PlaylistId)
                .ToListAsync();

            foreach (var playlistId in playlistsWithTag)
            {
                // Check if playlist is already assigned to this device
                var alreadyAssigned = await _db.DevicePlaylists
                    .AnyAsync(dp => dp.DeviceId == deviceId && dp.PlaylistId == playlistId);

                if (!alreadyAssigned)
                {
                    _db.DevicePlaylists.Add(new DevicePlaylist { DeviceId = deviceId, PlaylistId = playlistId });
                    _logger.LogInformation($"Auto-assigned playlist {playlistId} to device {deviceId} based on tag {tagId}");
                }
            }
            await _db.SaveChangesAsync();

            // Push content update to device for each assigned playlist
            var device = await _db.Devices.FindAsync(deviceId);
            if (device != null)
            {
                foreach (var playlistId in playlistsWithTag)
                {
                    var items = await _db.PlaylistItems
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

                    await RealtimeHub.SendToDevice(device.DeviceId, ServerToClientEvent.CONTENT_UPDATE, new { playlistId, items });
                }
            }

            return Results.Ok(new { message = "Tag assigned to device", deviceId, tagId, playlistsAutoAssigned = playlistsWithTag.Count });
        }

        public async Task<IResult> RemoveFromDeviceAsync(int deviceId, int tagId)
        {
            _logger.LogInformation("Removing tag {TagId} from device {DeviceId}", tagId, deviceId);
            var deviceTag = await _db.DeviceTags.FirstOrDefaultAsync(dt => dt.DeviceId == deviceId && dt.TagId == tagId);
            if (deviceTag == null) return Results.NotFound();

            _db.DeviceTags.Remove(deviceTag);
            await _db.SaveChangesAsync();

            // Find playlists that had this tag
            var playlistsWithTag = await _db.PlaylistTags
                .Where(pt => pt.TagId == tagId)
                .Select(pt => pt.PlaylistId)
                .ToListAsync();

            int playlistsUnassigned = 0;
            foreach (var playlistId in playlistsWithTag)
            {
                // Check if this device has any OTHER tags that this playlist is still assigned to
                var deviceTagIds = await _db.DeviceTags
                    .Where(dt => dt.DeviceId == deviceId)
                    .Select(dt => dt.TagId)
                    .ToListAsync();

                var remainingMatchingTags = await _db.PlaylistTags
                    .Where(pt => pt.PlaylistId == playlistId && deviceTagIds.Contains(pt.TagId))
                    .AnyAsync();

                // If no other matching tags, unassign the playlist from this device
                if (!remainingMatchingTags)
                {
                    var devicePlaylist = await _db.DevicePlaylists
                        .FirstOrDefaultAsync(dp => dp.DeviceId == deviceId && dp.PlaylistId == playlistId);

                    if (devicePlaylist != null)
                    {
                        _db.DevicePlaylists.Remove(devicePlaylist);
                        playlistsUnassigned++;
                        _logger.LogInformation($"Auto-unassigned playlist {playlistId} from device {deviceId} (tag {tagId} removed, no other matching tags)");
                    }
                }
            }
            await _db.SaveChangesAsync();

            // Push content update to device if playlists were unassigned
            if (playlistsUnassigned > 0)
            {
                var device = await _db.Devices.FindAsync(deviceId);
                if (device != null)
                {
                    // Get next available playlist or send empty
                    var nextPlaylistId = await _db.DevicePlaylists
                        .Where(dp => dp.DeviceId == deviceId)
                        .Select(dp => dp.PlaylistId)
                        .FirstOrDefaultAsync();

                    if (nextPlaylistId > 0)
                    {
                        var items = await _db.PlaylistItems
                            .Where(i => i.PlaylistId == nextPlaylistId)
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

                        await RealtimeHub.SendToDevice(device.DeviceId, ServerToClientEvent.CONTENT_UPDATE, new { playlistId = nextPlaylistId, items });
                    }
                    else
                    {
                        // No playlists left, send empty
                        await RealtimeHub.SendToDevice(device.DeviceId, ServerToClientEvent.CONTENT_UPDATE, new { playlistId = 0, items = Array.Empty<object>() });
                    }
                }
            }

            return Results.Ok(new { message = "Tag removed from device", deviceId, tagId, playlistsUnassigned });
        }

        public async Task<IResult> GetDeviceTagsAsync(int deviceId)
        {
            _logger.LogInformation("Getting tags for device {DeviceId}", deviceId);
            var tags = await _db.DeviceTags
                .Where(dt => dt.DeviceId == deviceId)
                .Include(dt => dt.Tag)
                .Select(dt => new { dt.Tag!.Id, dt.Tag.Name, dt.Tag.Color })
                .ToListAsync();
            return Results.Ok(tags);
        }
    }
}

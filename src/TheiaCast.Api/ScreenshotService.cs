using Microsoft.EntityFrameworkCore;

namespace TheiaCast.Api;

public interface IScreenshotService
{
    Task<object?> GetLatestAsync(string deviceId);
    Task<IEnumerable<object>> GetByDeviceAsync(string deviceId);
    Task<object?> GetByIdAsync(int id);
}

public class ScreenshotService : IScreenshotService
{
    private readonly PdsDbContext _db;

    public ScreenshotService(PdsDbContext db) => _db = db;

    public async Task<object?> GetLatestAsync(string deviceId)
    {
        var s = await _db.Screenshots.Where(x => x.DeviceStringId == deviceId)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync();
        return s == null ? null : new { id = s.Id, deviceId = s.DeviceStringId, url = s.CurrentUrl, capturedAt = s.CreatedAt, imageData = s.ImageBase64 };
    }

    public async Task<IEnumerable<object>> GetByDeviceAsync(string deviceId)
    {
        return await _db.Screenshots.Where(x => x.DeviceStringId == deviceId)
            .OrderByDescending(x => x.CreatedAt)
            .Select(s => new { id = s.Id, deviceId = s.DeviceStringId, url = s.CurrentUrl, capturedAt = s.CreatedAt, imageData = s.ImageBase64 })
            .ToListAsync();
    }

    public async Task<object?> GetByIdAsync(int id)
    {
        var s = await _db.Screenshots.FindAsync(id);
        return s == null ? null : new { id = s.Id, deviceId = s.DeviceStringId, url = s.CurrentUrl, capturedAt = s.CreatedAt, imageData = s.ImageBase64 };
    }
}

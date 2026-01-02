using Microsoft.EntityFrameworkCore;

namespace TheiaCast.Api;

public interface ISettingsService
{
    Task<string?> GetSettingAsync(string key);
    Task SetSettingAsync(string key, string value);
    Task<IEnumerable<object>> GetAllSettingsAsync();
}

public class SettingsService : ISettingsService
{
    private readonly PdsDbContext _db;

    public SettingsService(PdsDbContext db) => _db = db;

    public async Task<string?> GetSettingAsync(string key)
    {
        var setting = await _db.AppSettings.FirstOrDefaultAsync(s => s.Key == key);
        return setting?.Value;
    }

    public async Task SetSettingAsync(string key, string value)
    {
        var setting = await _db.AppSettings.FirstOrDefaultAsync(s => s.Key == key);
        if (setting == null)
        {
            setting = new AppSettings { Key = key, Value = value, UpdatedAt = DateTime.UtcNow };
            _db.AppSettings.Add(setting);
        }
        else
        {
            setting.Value = value;
            setting.UpdatedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync();
    }

    public async Task<IEnumerable<object>> GetAllSettingsAsync()
    {
        return await _db.AppSettings
            .Select(s => new { key = s.Key, value = s.Value, updatedAt = s.UpdatedAt })
            .ToListAsync();
    }
}

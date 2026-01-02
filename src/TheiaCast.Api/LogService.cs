using Microsoft.EntityFrameworkCore;

namespace TheiaCast.Api;

public interface ILogService
{
    Task AddLogAsync(string level, string message, string? deviceId = null, string? source = null, string? stackTrace = null, string? additionalData = null);
    Task<IEnumerable<object>> GetLogsAsync(string? deviceId = null, string? level = null, DateTime? startDate = null, DateTime? endDate = null, int limit = 100, int offset = 0);
    Task CleanupOldLogsAsync();
}

public class LogService : ILogService
{
    private readonly PdsDbContext _db;
    private readonly ILogger<LogService> _logger;

    public LogService(PdsDbContext db, ILogger<LogService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task AddLogAsync(string level, string message, string? deviceId = null, string? source = null, string? stackTrace = null, string? additionalData = null)
    {
        try
        {
            var logEntry = new TheiaCast.Api.Log
            {
                Level = level,
                Message = message,
                DeviceId = deviceId,
                Source = source,
                StackTrace = stackTrace,
                AdditionalData = additionalData,
                Timestamp = DateTime.UtcNow
            };
            _db.Logs.Add(logEntry);
            await _db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            // Fallback to console logging if database logging fails
            _logger.LogError(ex, "Failed to write log to database: {Message}", message);
        }
    }

    public async Task<IEnumerable<object>> GetLogsAsync(string? deviceId = null, string? level = null, DateTime? startDate = null, DateTime? endDate = null, int limit = 100, int offset = 0)
    {
        var query = _db.Logs.AsQueryable();

        if (!string.IsNullOrEmpty(deviceId))
            query = query.Where(l => l.DeviceId == deviceId);

        if (!string.IsNullOrEmpty(level))
            query = query.Where(l => l.Level == level);

        if (startDate.HasValue)
            query = query.Where(l => l.Timestamp >= startDate.Value);

        if (endDate.HasValue)
            query = query.Where(l => l.Timestamp <= endDate.Value);

        return await query.OrderByDescending(l => l.Timestamp)
            .Skip(offset)
            .Take(limit)
            .Select(l => new
            {
                id = l.Id,
                timestamp = l.Timestamp,
                level = l.Level,
                message = l.Message,
                deviceId = l.DeviceId,
                source = l.Source,
                stackTrace = l.StackTrace,
                additionalData = l.AdditionalData
            })
            .ToListAsync();
    }

    public async Task CleanupOldLogsAsync()
    {
        try
        {
            var retentionDaysSetting = await _db.AppSettings.FirstOrDefaultAsync(s => s.Key == "LogRetentionDays");
            var retentionDays = retentionDaysSetting != null ? int.Parse(retentionDaysSetting.Value) : 7;
            var cutoffDate = DateTime.UtcNow.AddDays(-retentionDays);

            var oldLogs = _db.Logs.Where(l => l.Timestamp < cutoffDate);
            _db.Logs.RemoveRange(oldLogs);
            await _db.SaveChangesAsync();

            _logger.LogInformation("Cleaned up logs older than {CutoffDate} ({RetentionDays} days)", cutoffDate, retentionDays);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to cleanup old logs");
        }
    }
}

namespace TheiaCast.Api;

public class BroadcastMediaCleanupService : BackgroundService
{
    private readonly ILogger<BroadcastMediaCleanupService> _logger;
    private readonly IWebHostEnvironment _environment;
    private readonly TimeSpan _cleanupInterval = TimeSpan.FromHours(1);
    private readonly TimeSpan _fileRetentionPeriod = TimeSpan.FromHours(24);

    public BroadcastMediaCleanupService(
        ILogger<BroadcastMediaCleanupService> logger,
        IWebHostEnvironment environment)
    {
        _logger = logger;
        _environment = environment;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("BroadcastMediaCleanupService started. Cleanup runs every {Interval} hours, deleting files older than {Retention} hours.",
            _cleanupInterval.TotalHours, _fileRetentionPeriod.TotalHours);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(_cleanupInterval, stoppingToken);
                await CleanupOldFilesAsync();
            }
            catch (OperationCanceledException)
            {
                // Expected when application is shutting down
                _logger.LogInformation("BroadcastMediaCleanupService is stopping.");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during broadcast media cleanup.");
            }
        }
    }

    private async Task CleanupOldFilesAsync()
    {
        try
        {
            var broadcastMediaDir = Path.Combine(_environment.WebRootPath, "broadcast-media");

            if (!Directory.Exists(broadcastMediaDir))
            {
                _logger.LogDebug("Broadcast media directory does not exist: {Directory}", broadcastMediaDir);
                return;
            }

            var cutoffTime = DateTime.UtcNow - _fileRetentionPeriod;
            var files = Directory.GetFiles(broadcastMediaDir);
            var deletedCount = 0;
            var totalSize = 0L;

            foreach (var filePath in files)
            {
                try
                {
                    var fileInfo = new FileInfo(filePath);

                    if (fileInfo.CreationTimeUtc < cutoffTime)
                    {
                        var fileSize = fileInfo.Length;
                        await Task.Run(() => File.Delete(filePath));
                        deletedCount++;
                        totalSize += fileSize;

                        _logger.LogDebug("Deleted old broadcast file: {FileName}, Size: {Size} bytes, Age: {Age} hours",
                            fileInfo.Name, fileSize, (DateTime.UtcNow - fileInfo.CreationTimeUtc).TotalHours);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete file: {FilePath}", filePath);
                }
            }

            if (deletedCount > 0)
            {
                _logger.LogInformation("Cleanup completed: Deleted {Count} file(s), freed {Size:N0} bytes ({SizeMB:F2} MB)",
                    deletedCount, totalSize, totalSize / 1024.0 / 1024.0);
            }
            else
            {
                _logger.LogDebug("Cleanup completed: No files to delete");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during broadcast media cleanup");
        }
    }
}

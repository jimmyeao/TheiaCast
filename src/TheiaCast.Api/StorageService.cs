using Microsoft.EntityFrameworkCore;

namespace TheiaCast.Api;

public interface IStorageService
{
    Task<object> GetStorageStatsAsync();
}

public class StorageService : IStorageService
{
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<StorageService> _logger;

    public StorageService(IWebHostEnvironment env, ILogger<StorageService> logger)
    {
        _env = env;
        _logger = logger;
    }

    public async Task<object> GetStorageStatsAsync()
    {
        try
        {
            var wwwrootPath = _env.WebRootPath;

            // Calculate storage for each content type
            var videosPath = Path.Combine(wwwrootPath, "videos");
            var imagesPath = Path.Combine(wwwrootPath, "images");
            var slideshowsPath = Path.Combine(wwwrootPath, "api", "render", "slideshow");

            long videoSize = await Task.Run(() => GetDirectorySize(videosPath));
            long imageSize = await Task.Run(() => GetDirectorySize(imagesPath));
            long slideshowSize = await Task.Run(() => GetDirectorySize(slideshowsPath));
            long totalUsed = videoSize + imageSize + slideshowSize;

            // Get disk information
            var driveInfo = new DriveInfo(Path.GetPathRoot(wwwrootPath) ?? "C:\\");
            long totalSpace = driveInfo.TotalSize;
            long freeSpace = driveInfo.AvailableFreeSpace;
            long usedSpace = totalSpace - freeSpace;

            return new
            {
                totalSpace = totalSpace,
                freeSpace = freeSpace,
                usedSpace = usedSpace,
                contentUsed = totalUsed,
                videoSize = videoSize,
                imageSize = imageSize,
                slideshowSize = slideshowSize,
                percentUsed = totalSpace > 0 ? (double)usedSpace / totalSpace * 100 : 0
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to calculate storage statistics");
            throw;
        }
    }

    private long GetDirectorySize(string path)
    {
        if (!Directory.Exists(path))
            return 0;

        try
        {
            var directory = new DirectoryInfo(path);
            return directory.EnumerateFiles("*", SearchOption.AllDirectories)
                .Sum(file => file.Length);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to calculate size for directory: {Path}", path);
            return 0;
        }
    }
}

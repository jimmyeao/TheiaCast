using System.Security.Cryptography;
using System.Text;

namespace KioskClient.Core;

public class VideoCacheManager : IDisposable
{
    private readonly ILogger _logger;
    private readonly string _cacheDirectory;
    private readonly Dictionary<string, CacheEntry> _cache = new();
    private readonly SemaphoreSlim _cacheLock = new SemaphoreSlim(1, 1);
    private readonly HttpClient _httpClient;

    // Video file extensions
    private static readonly HashSet<string> VideoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp4", ".webm", ".avi", ".mov", ".mkv", ".m4v", ".flv", ".wmv", ".mpg", ".mpeg", ".3gp"
    };

    public VideoCacheManager(ILogger logger, string? cacheDirectory = null)
    {
        _logger = logger;
        _cacheDirectory = cacheDirectory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "KioskClient", "Cache"
        );

        // Create cache directory if it doesn't exist
        Directory.CreateDirectory(_cacheDirectory);

        _httpClient = new HttpClient();
        _httpClient.Timeout = TimeSpan.FromMinutes(10); // Long timeout for large videos

        _logger.LogInformation("Video cache directory: {CacheDir}", _cacheDirectory);
    }

    public bool IsVideoUrl(string url)
    {
        if (string.IsNullOrEmpty(url))
            return false;

        // Check if URL ends with video extension
        try
        {
            var uri = new Uri(url, UriKind.RelativeOrAbsolute);
            if (uri.IsAbsoluteUri)
            {
                var path = uri.AbsolutePath;
                var extension = Path.GetExtension(path);
                return VideoExtensions.Contains(extension);
            }
            else
            {
                var extension = Path.GetExtension(url);
                return VideoExtensions.Contains(extension);
            }
        }
        catch
        {
            return false;
        }
    }

    public async Task<string?> GetCachedVideoPathAsync(string url)
    {
        await _cacheLock.WaitAsync();
        try
        {
            if (_cache.TryGetValue(url, out var entry))
            {
                if (entry.Status == CacheStatus.Ready && File.Exists(entry.LocalPath))
                {
                    return entry.LocalPath;
                }
            }

            return null;
        }
        finally
        {
            _cacheLock.Release();
        }
    }

    public async Task<CacheStatus> GetCacheStatusAsync(string url)
    {
        await _cacheLock.WaitAsync();
        try
        {
            if (_cache.TryGetValue(url, out var entry))
            {
                return entry.Status;
            }

            return CacheStatus.NotCached;
        }
        finally
        {
            _cacheLock.Release();
        }
    }

    public async Task CacheVideoAsync(string url)
    {
        if (!IsVideoUrl(url))
        {
            _logger.LogDebug("URL is not a video, skipping cache: {Url}", url);
            return;
        }

        await _cacheLock.WaitAsync();
        try
        {
            // Check if already cached or downloading
            if (_cache.TryGetValue(url, out var existingEntry))
            {
                if (existingEntry.Status == CacheStatus.Ready || existingEntry.Status == CacheStatus.Downloading)
                {
                    _logger.LogDebug("Video already cached or downloading: {Url}", url);
                    return;
                }
            }

            // Generate cache file path
            var fileName = GetCacheFileName(url);
            var localPath = Path.Combine(_cacheDirectory, fileName);

            // Add cache entry
            var entry = new CacheEntry
            {
                Url = url,
                LocalPath = localPath,
                Status = CacheStatus.Downloading,
                StartedAt = DateTime.UtcNow
            };

            _cache[url] = entry;

            _logger.LogInformation("Starting video download: {Url}", url);
        }
        finally
        {
            _cacheLock.Release();
        }

        // Download video (outside of lock to allow other operations)
        await DownloadVideoAsync(url);
    }

    private async Task DownloadVideoAsync(string url)
    {
        CacheEntry? entry;
        await _cacheLock.WaitAsync();
        try
        {
            if (!_cache.TryGetValue(url, out entry))
            {
                _logger.LogWarning("Cache entry not found for {Url}", url);
                return;
            }
        }
        finally
        {
            _cacheLock.Release();
        }

        try
        {
            _logger.LogInformation("Downloading video: {Url} -> {Path}", url, entry.LocalPath);

            // Download to temp file first
            var tempPath = entry.LocalPath + ".tmp";

            using (var response = await _httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead))
            {
                response.EnsureSuccessStatusCode();

                var totalBytes = response.Content.Headers.ContentLength ?? 0;
                _logger.LogInformation("Video size: {Size} bytes", totalBytes);

                using (var contentStream = await response.Content.ReadAsStreamAsync())
                using (var fileStream = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None, 8192, true))
                {
                    var buffer = new byte[8192];
                    var totalRead = 0L;
                    int bytesRead;

                    while ((bytesRead = await contentStream.ReadAsync(buffer, 0, buffer.Length)) > 0)
                    {
                        await fileStream.WriteAsync(buffer, 0, bytesRead);
                        totalRead += bytesRead;

                        if (totalBytes > 0 && totalRead % (1024 * 1024) == 0) // Log every MB
                        {
                            var progress = (int)((totalRead * 100) / totalBytes);
                            _logger.LogDebug("Download progress: {Progress}% ({Read}/{Total} bytes)", progress, totalRead, totalBytes);
                        }
                    }
                }
            }

            // Move temp file to final location
            if (File.Exists(entry.LocalPath))
            {
                File.Delete(entry.LocalPath);
            }
            File.Move(tempPath, entry.LocalPath);

            // Update status
            await _cacheLock.WaitAsync();
            try
            {
                if (_cache.TryGetValue(url, out entry))
                {
                    entry.Status = CacheStatus.Ready;
                    entry.CompletedAt = DateTime.UtcNow;
                    _logger.LogInformation("✅ Video cached successfully: {Url}", url);
                }
            }
            finally
            {
                _cacheLock.Release();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to download video: {Url}", url);

            // Update status to error
            await _cacheLock.WaitAsync();
            try
            {
                if (_cache.TryGetValue(url, out entry))
                {
                    entry.Status = CacheStatus.Error;
                    entry.Error = ex.Message;
                }
            }
            finally
            {
                _cacheLock.Release();
            }

            // Clean up temp file if it exists
            var tempPath = entry?.LocalPath + ".tmp";
            if (tempPath != null && File.Exists(tempPath))
            {
                try
                {
                    File.Delete(tempPath);
                }
                catch { }
            }
        }
    }

    public async Task CleanupUnusedVideosAsync(IEnumerable<string> currentPlaylistUrls)
    {
        await _cacheLock.WaitAsync();
        try
        {
            var urlsToKeep = new HashSet<string>(currentPlaylistUrls.Where(IsVideoUrl));
            var urlsToRemove = _cache.Keys.Where(url => !urlsToKeep.Contains(url)).ToList();

            foreach (var url in urlsToRemove)
            {
                if (_cache.TryGetValue(url, out var entry))
                {
                    // Delete file
                    if (File.Exists(entry.LocalPath))
                    {
                        try
                        {
                            File.Delete(entry.LocalPath);
                            _logger.LogInformation("Removed cached video: {Url}", url);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to delete cached video: {Path}", entry.LocalPath);
                        }
                    }

                    // Remove from cache
                    _cache.Remove(url);
                }
            }

            if (urlsToRemove.Count > 0)
            {
                _logger.LogInformation("Cleaned up {Count} unused cached videos", urlsToRemove.Count);
            }
        }
        finally
        {
            _cacheLock.Release();
        }
    }

    private string GetCacheFileName(string url)
    {
        // Generate a filename based on URL hash + extension
        using var sha256 = SHA256.Create();
        var hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(url));
        var hashString = BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();

        // Try to get extension from URL
        var extension = ".mp4"; // default
        try
        {
            var uri = new Uri(url, UriKind.RelativeOrAbsolute);
            if (uri.IsAbsoluteUri)
            {
                var ext = Path.GetExtension(uri.AbsolutePath);
                if (!string.IsNullOrEmpty(ext) && VideoExtensions.Contains(ext))
                {
                    extension = ext;
                }
            }
        }
        catch { }

        return $"{hashString}{extension}";
    }

    public void Dispose()
    {
        _httpClient?.Dispose();
        _cacheLock?.Dispose();
    }
}

public class CacheEntry
{
    public string Url { get; set; } = string.Empty;
    public string LocalPath { get; set; } = string.Empty;
    public CacheStatus Status { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? Error { get; set; }
}

public enum CacheStatus
{
    NotCached,
    Downloading,
    Ready,
    Error
}

using System.Text.Json;

namespace KioskClient.Core;

public class PlaylistExecutor
{
    private readonly ILogger _logger;
    private readonly BrowserController _browser;
    private readonly string _serverUrl;
    private readonly VideoCacheManager _cacheManager;
    private List<PlaylistItem> _playlistItems = new();
    private int _currentIndex = 0;
    private Timer? _rotationTimer;
    private bool _isRunning = false;
    private int _currentPlaylistId = 0;
    private bool _isPaused = false;
    private DateTime _pausedAt;
    private int _remainingDurationMs = 0;
    private DateTime _currentItemStartTime;
    private Timer? _stateEmissionTimer;
    private Action<object>? _onStateUpdate;

    // Broadcast state
    private bool _isBroadcasting = false;
    private List<PlaylistItem> _savedPlaylist = new();
    private int _savedIndex = 0;
    private Timer? _broadcastTimer;

    public event Action<string, string>? OnScreenshotReady;

    public PlaylistExecutor(ILogger logger, BrowserController browser, string serverUrl, VideoCacheManager cacheManager)
    {
        _logger = logger;
        _browser = browser;
        _serverUrl = serverUrl;
        _cacheManager = cacheManager;
    }

    public void SetStateUpdateHandler(Action<object> handler)
    {
        _onStateUpdate = handler;
    }

    public void LoadPlaylist(int playlistId, List<PlaylistItem> items)
    {
        _logger.LogInformation("Loading playlist {PlaylistId} with {Count} items", playlistId, items.Count);

        // Store old playlist for comparison
        var oldPlaylist = _playlistItems.ToList();
        var wasRunning = _isRunning;

        _currentPlaylistId = playlistId;
        _playlistItems = items.OrderBy(i => i.OrderIndex).ToList();

        // Start caching videos in background
        _ = Task.Run(async () =>
        {
            try
            {
                // Get all video URLs from new playlist
                var videoUrls = _playlistItems
                    .Where(item => !string.IsNullOrEmpty(item.Url))
                    .Select(item => item.Url!)
                    .Where(url => _cacheManager.IsVideoUrl(url))
                    .ToList();

                _logger.LogInformation("Found {Count} videos to cache", videoUrls.Count);

                // Start caching videos
                foreach (var url in videoUrls)
                {
                    await _cacheManager.CacheVideoAsync(url);
                }

                // Cleanup videos no longer in playlist
                var allUrls = _playlistItems
                    .Where(item => !string.IsNullOrEmpty(item.Url))
                    .Select(item => item.Url!)
                    .ToList();
                await _cacheManager.CleanupUnusedVideosAsync(allUrls);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error caching videos");
            }
        });

        // Restart execution if already running
        if (wasRunning)
        {
            // Check if we need to restart:
            // - If it's a single permanent item (duration 0) and it hasn't changed, don't restart
            // - If current item still exists in new playlist, don't restart
            // - BUT if scheduling fields or content changed, always restart to re-evaluate
            var currentItem = _playlistItems.Count > 0 && _currentIndex > 0
                ? oldPlaylist.ElementAtOrDefault((_currentIndex - 1 + oldPlaylist.Count) % oldPlaylist.Count)
                : null;

            var currentStillExists = currentItem != null && _playlistItems.Any(i => i.Id == currentItem.Id);
            var isPermanentDisplay = _playlistItems.Count == 1 && _playlistItems[0].DurationSeconds == 0;
            var wasPermanentDisplay = oldPlaylist.Count == 1 && oldPlaylist[0]?.DurationSeconds == 0;
            var sameContent = isPermanentDisplay && wasPermanentDisplay &&
                              _playlistItems[0].Id == oldPlaylist[0].Id;

            // Check if scheduling or content changed (items added/removed, scheduling fields changed, durations changed)
            var contentChanged = HasPlaylistChanged(oldPlaylist, _playlistItems);

            if (sameContent && !contentChanged)
            {
                _logger.LogInformation("Permanent display item unchanged - no restart needed");
                return;
            }

            if (currentStillExists && !isPermanentDisplay && !contentChanged)
            {
                _logger.LogInformation("Current item still in playlist - updating playlist without restart");
                return;
            }

            if (contentChanged)
            {
                _logger.LogInformation("Playlist content or scheduling changed - restarting executor to re-evaluate");
            }
            else
            {
                _logger.LogInformation("Playlist changed significantly - restarting executor");
            }
            Stop();
            Start();
        }
    }

    public void Start()
    {
        if (_isRunning)
        {
            _logger.LogWarning("Playlist executor already running");
            return;
        }

        if (_playlistItems.Count == 0)
        {
            _logger.LogWarning("Cannot start playlist executor: no playlist items loaded");
            return;
        }

        _logger.LogInformation("Starting playlist executor");
        _isRunning = true;
        _isPaused = false;
        _currentIndex = 0;

        // Start periodic state emission (every 5 seconds)
        _stateEmissionTimer = new Timer(_ => EmitStateUpdate(), null, TimeSpan.Zero, TimeSpan.FromSeconds(5));

        EmitStateUpdate();
        ExecuteNextItem();
    }

    public void Stop()
    {
        _rotationTimer?.Dispose();
        _rotationTimer = null;
        _stateEmissionTimer?.Dispose();
        _stateEmissionTimer = null;
        _isRunning = false;
        _isPaused = false;
        _logger.LogInformation("Playlist executor stopped");
        EmitStateUpdate();
    }

    private void ExecuteNextItem()
    {
        if (!_isRunning || _playlistItems.Count == 0)
            return;

        // Find next valid item
        var item = GetNextValidItem();

        if (item == null)
        {
            _logger.LogWarning("No valid playlist items to display at this time");
            // Retry after 1 minute
            _rotationTimer = new Timer(_ => ExecuteNextItem(), null, TimeSpan.FromMinutes(1), Timeout.InfiniteTimeSpan);
            return;
        }

        _logger.LogInformation("Executing playlist item {ItemId} (URL: {Url})", item.Id, item.Url);

        // Navigate to content
        DisplayContent(item);

        // Record start time for pause/resume
        _currentItemStartTime = DateTime.Now;

        // Emit state update after displaying content
        EmitStateUpdate();

        // Schedule screenshot 3 seconds after content loads
        _ = Task.Run(async () =>
        {
            await Task.Delay(3000);
            if (_browser != null)
            {
                try
                {
                    var screenshot = await _browser.CaptureScreenshotAsync();
                    var currentUrl = _browser.GetCurrentUrl();
                    // Signal screenshot ready (will be handled by worker)
                    OnScreenshotReady?.Invoke(screenshot, currentUrl);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to capture screenshot after item change");
                }
            }
        });

        // Determine next rotation timing
        var nextDelay = item.DurationSeconds * 1000;

        // If duration is 0 and only one item, display permanently
        if (nextDelay == 0 && _playlistItems.Count == 1)
        {
            _logger.LogInformation("Displaying permanently without rotation (single item)");
            return;
        }

        // If duration is 0 but multiple items, use default 15 seconds
        if (nextDelay == 0 && _playlistItems.Count > 1)
        {
            nextDelay = 15000;
            _logger.LogWarning("Item duration is 0 but playlist has {Count} items; using default 15s rotation", _playlistItems.Count);
        }

        // If item has a time window, ensure we don't play past the end time
        if (!string.IsNullOrEmpty(item.TimeWindowStart) && !string.IsNullOrEmpty(item.TimeWindowEnd))
        {
            var now = DateTime.Now;
            var endTime = item.TimeWindowEnd;

            // Parse time window end (HH:mm format)
            if (TimeSpan.TryParse(endTime, out var endTimeSpan))
            {
                var windowEnd = now.Date.Add(endTimeSpan);

                // Calculate milliseconds until time window ends
                var msUntilWindowEnd = (int)(windowEnd - now).TotalMilliseconds;

                // If time window will end before displayDuration, use the shorter time
                if (msUntilWindowEnd > 0 && msUntilWindowEnd < nextDelay)
                {
                    _logger.LogInformation(
                        "Item time window ends in {Seconds}s - will rotate then instead of waiting full duration ({Duration}s)",
                        Math.Round(msUntilWindowEnd / 1000.0), nextDelay / 1000);
                    nextDelay = msUntilWindowEnd;
                }
                else if (msUntilWindowEnd <= 0)
                {
                    // Time window already ended (shouldn't happen if GetNextValidItem works correctly, but be safe)
                    _logger.LogWarning("Item time window already ended - rotating immediately");
                    nextDelay = 0;
                }
            }
        }

        _logger.LogInformation("Next rotation in {Delay}ms (duration: {Duration}s, playlist count: {Count})",
            nextDelay, item.DurationSeconds, _playlistItems.Count);

        // Schedule next rotation
        _rotationTimer = new Timer(_ =>
        {
            try
            {
                ExecuteNextItem();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in playlist rotation timer");
            }
        }, null, TimeSpan.FromMilliseconds(nextDelay), Timeout.InfiniteTimeSpan);
    }

    private PlaylistItem? GetNextValidItem()
    {
        var now = DateTime.Now;
        var currentDay = (int)now.DayOfWeek;
        var currentTime = now.ToString("HH:mm");

        int attempts = 0;
        int maxAttempts = _playlistItems.Count;

        while (attempts < maxAttempts)
        {
            var item = _playlistItems[_currentIndex];

            // Check day of week constraint
            if (!string.IsNullOrEmpty(item.DaysOfWeek))
            {
                try
                {
                    var daysOfWeek = JsonSerializer.Deserialize<int[]>(item.DaysOfWeek);
                    if (daysOfWeek != null && !daysOfWeek.Contains(currentDay))
                    {
                        _logger.LogDebug("Item {ItemId} skipped: wrong day of week", item.Id);
                        _currentIndex = (_currentIndex + 1) % _playlistItems.Count;
                        attempts++;
                        continue;
                    }
                }
                catch
                {
                    // Invalid JSON, skip constraint
                }
            }

            // Check time window constraint
            if (!string.IsNullOrEmpty(item.TimeWindowStart) && !string.IsNullOrEmpty(item.TimeWindowEnd))
            {
                if (string.Compare(currentTime, item.TimeWindowStart) < 0 || string.Compare(currentTime, item.TimeWindowEnd) > 0)
                {
                    _logger.LogDebug("Item {ItemId} skipped: outside time window", item.Id);
                    _currentIndex = (_currentIndex + 1) % _playlistItems.Count;
                    attempts++;
                    continue;
                }
            }

            // Item is valid
            _currentIndex = (_currentIndex + 1) % _playlistItems.Count;
            return item;
        }

        return null;
    }

    private async void DisplayContent(PlaylistItem item)
    {
        try
        {
            if (string.IsNullOrEmpty(item.Url))
            {
                _logger.LogError(null, "Playlist item {ItemId} missing URL", item.Id);
                // Skip to next item after a short delay
                _rotationTimer?.Dispose();
                _rotationTimer = new Timer(_ => ExecuteNextItem(), null, TimeSpan.FromSeconds(3), Timeout.InfiniteTimeSpan);
                return;
            }

            // Convert relative URLs to absolute URLs
            var url = item.Url;
            if (url.StartsWith("/"))
            {
                url = $"{_serverUrl.TrimEnd('/')}{url}";
                _logger.LogDebug("Converted relative URL {RelativeUrl} to absolute URL {AbsoluteUrl}", item.Url, url);
            }

            // Check if this is a video that needs to be cached
            if (_cacheManager.IsVideoUrl(url))
            {
                _logger.LogInformation("Waiting for video to be cached: {Url}", url);

                // Wait for video to be cached (with timeout)
                var maxWaitTime = TimeSpan.FromMinutes(5);
                var startTime = DateTime.UtcNow;
                var checkInterval = TimeSpan.FromSeconds(1);

                while (DateTime.UtcNow - startTime < maxWaitTime)
                {
                    var status = await _cacheManager.GetCacheStatusAsync(url);

                    if (status == CacheStatus.Ready)
                    {
                        // Get cached file path
                        var cachedPath = await _cacheManager.GetCachedVideoPathAsync(url);
                        if (cachedPath != null)
                        {
                            _logger.LogInformation("✅ Video ready in cache, using local file: {Path}", cachedPath);
                            url = "file:///" + cachedPath.Replace("\\", "/");
                            break;
                        }
                    }
                    else if (status == CacheStatus.Error)
                    {
                        _logger.LogWarning("Video caching failed, will attempt to play from remote URL: {Url}", url);
                        break;
                    }

                    // Still downloading, wait a bit
                    await Task.Delay(checkInterval);
                }

                if (DateTime.UtcNow - startTime >= maxWaitTime)
                {
                    _logger.LogWarning("Timeout waiting for video cache, will attempt to play from remote URL: {Url}", url);
                }
            }

            await _browser.NavigateAsync(url);

            if (item.DurationSeconds == 0)
            {
                _logger.LogInformation("✅ Displaying content {Url} permanently (duration: 0)", item.Url ?? "");
            }
            else
            {
                _logger.LogInformation("✅ Displaying content {Url} for {Duration}s", item.Url ?? "", item.DurationSeconds);
            }
        }
        catch (Exception ex) when (ex.Message.Contains("Target page, context or browser has been closed") ||
                                    ex.Message.Contains("TargetClosedException"))
        {
            _logger.LogError(ex, "Browser/page was closed while displaying content {Url}. Waiting for recovery (10 seconds)...", item.Url ?? "");
            // Give browser recovery time to complete before trying next item (increased delay)
            _rotationTimer?.Dispose();
            _rotationTimer = new Timer(_ => ExecuteNextItem(), null, TimeSpan.FromSeconds(10), Timeout.InfiniteTimeSpan);
        }
        catch (Exception ex) when (ex.Message.Contains("Page crashed") ||
                                    ex.Message.Contains("Target crashed") ||
                                    ex.Message.Contains("STATUS_ACCESS_VIOLATION"))
        {
            _logger.LogError(ex, "Browser crashed while displaying content {Url}. Recovery will be attempted automatically. Continuing playlist in 7 seconds...", item.Url ?? "");
            // Give browser recovery time to complete before trying next item
            _rotationTimer?.Dispose();
            _rotationTimer = new Timer(_ => ExecuteNextItem(), null, TimeSpan.FromSeconds(7), Timeout.InfiniteTimeSpan);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to display content {Url}. Continuing to next item in 3 seconds...", item.Url ?? "");
            // Skip to next item after a short delay
            _rotationTimer?.Dispose();
            _rotationTimer = new Timer(_ => ExecuteNextItem(), null, TimeSpan.FromSeconds(3), Timeout.InfiniteTimeSpan);
        }
    }

    public void Pause()
    {
        if (!_isRunning || _isPaused)
        {
            _logger.LogWarning("Cannot pause: executor not running or already paused (isRunning={IsRunning}, isPaused={IsPaused})", _isRunning, _isPaused);
            return;
        }

        _logger.LogInformation("Pausing playlist");
        _isPaused = true;
        _pausedAt = DateTime.Now;

        // Calculate remaining duration for current item
        if (_rotationTimer != null)
        {
            var elapsed = (int)(DateTime.Now - _currentItemStartTime).TotalMilliseconds;
            var currentItem = _playlistItems[(_currentIndex - 1 + _playlistItems.Count) % _playlistItems.Count];
            var totalDuration = currentItem.DurationSeconds * 1000;
            _remainingDurationMs = Math.Max(0, totalDuration - elapsed);

            _rotationTimer?.Dispose();
            _rotationTimer = null;
        }

        _logger.LogInformation("Paused with {RemainingMs}ms remaining", _remainingDurationMs);
        EmitStateUpdate();
    }

    public void Resume()
    {
        if (!_isRunning || !_isPaused)
        {
            _logger.LogWarning("Cannot resume: executor not running or not paused (isRunning={IsRunning}, isPaused={IsPaused})", _isRunning, _isPaused);
            return;
        }

        _logger.LogInformation("Resuming playlist");
        _isPaused = false;

        // Resume with remaining duration
        if (_remainingDurationMs > 0)
        {
            _currentItemStartTime = DateTime.Now;
            _rotationTimer = new Timer(_ => ExecuteNextItem(), null, _remainingDurationMs, Timeout.Infinite);
            _logger.LogInformation("Resuming with {RemainingMs}ms remaining", _remainingDurationMs);
        }
        else
        {
            // No remaining duration, advance to next item
            ExecuteNextItem();
        }

        EmitStateUpdate();
    }

    public void Next()
    {
        if (!_isRunning)
        {
            _logger.LogWarning("Cannot advance: executor not running");
            return;
        }

        _logger.LogInformation("Advancing to next playlist item");

        // Clear current timeout
        _rotationTimer?.Dispose();
        _rotationTimer = null;

        // If paused, unpause before advancing
        _isPaused = false;

        // Execute next item
        ExecuteNextItem();
        EmitStateUpdate();
    }

    public void Previous()
    {
        if (!_isRunning)
        {
            _logger.LogWarning("Cannot go back: executor not running");
            return;
        }

        _logger.LogInformation("Going back to previous playlist item");

        // Clear current timeout
        _rotationTimer?.Dispose();
        _rotationTimer = null;

        // If paused, unpause before going back
        _isPaused = false;

        // Move back two positions (one to undo the increment from last ExecuteNextItem, one to go back)
        _currentIndex = (_currentIndex - 2 + _playlistItems.Count) % _playlistItems.Count;

        // Execute next item (which is actually the previous item now)
        ExecuteNextItem();
        EmitStateUpdate();
    }

    private void EmitStateUpdate()
    {
        if (_onStateUpdate == null) return;

        // Get current item (the one we're displaying now, which is at index-1 since we increment before displaying)
        var currentItem = _playlistItems.Count > 0 && _currentIndex > 0
            ? _playlistItems[(_currentIndex - 1 + _playlistItems.Count) % _playlistItems.Count]
            : null;

        // Calculate time remaining for current item
        int timeRemaining = 0;
        if (_isRunning && !_isPaused && currentItem != null && _rotationTimer != null)
        {
            var elapsed = (int)(DateTime.Now - _currentItemStartTime).TotalMilliseconds;
            var totalDuration = currentItem.DurationSeconds * 1000;
            timeRemaining = Math.Max(0, totalDuration - elapsed);
        }
        else if (_isPaused)
        {
            timeRemaining = _remainingDurationMs;
        }

        var state = new
        {
            isPlaying = _isRunning,
            isPaused = _isPaused,
            isBroadcasting = _isBroadcasting,
            currentItemId = currentItem?.Id,
            currentItemIndex = currentItem != null ? (_currentIndex - 1 + _playlistItems.Count) % _playlistItems.Count : 0,
            playlistId = _currentPlaylistId,
            totalItems = _playlistItems.Count,
            currentUrl = currentItem?.Url,
            timeRemaining = timeRemaining
        };

        _logger.LogDebug("Emitting playback state: running={IsRunning}, paused={IsPaused}, item={ItemId}/{Total}",
            _isRunning, _isPaused, currentItem?.Id, _playlistItems.Count);

        _onStateUpdate(state);
    }

    private string GetLogoPositionStyles(string position)
    {
        return position switch
        {
            "top-left" => "top: 20px; left: 20px;",
            "top-center" => "top: 20px; left: 50%; transform: translateX(-50%);",
            "top-right" => "top: 20px; right: 20px;",
            "middle-left" => "top: 50%; left: 20px; transform: translateY(-50%);",
            "middle-center" => "top: 50%; left: 50%; transform: translate(-50%, -50%);",
            "middle-right" => "top: 50%; right: 20px; transform: translateY(-50%);",
            "bottom-left" => "bottom: 20px; left: 20px;",
            "bottom-center" => "bottom: 20px; left: 50%; transform: translateX(-50%);",
            "bottom-right" => "bottom: 20px; right: 20px;",
            _ => "top: 20px; left: 20px;"
        };
    }

    private string GenerateMediaPage(string type, string mediaUrl)
    {
        // Construct full URL from server base URL + media path
        var serverUrl = _serverUrl.TrimEnd('/');
        var fullMediaUrl = mediaUrl.StartsWith("http") ? mediaUrl : $"{serverUrl}{mediaUrl}";

        var mediaElement = type == "image"
            ? $"<img src='{fullMediaUrl}' alt='Broadcast {type}' />"
            : $"<video autoplay loop muted playsinline><source src='{fullMediaUrl}' type='video/mp4' /></video>";

        return $@"<!DOCTYPE html>
<html>
  <head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <title>Broadcast {char.ToUpper(type[0]) + type.Substring(1)}</title>
    <style>
      body {{
        margin: 0;
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: #000;
        overflow: hidden;
      }}
      img, video {{
        max-width: 100%;
        max-height: 100vh;
        object-fit: contain;
      }}
    </style>
  </head>
  <body>
    {mediaElement}
  </body>
</html>";
    }

    public void StartBroadcast(string type, string? url, string? message, int duration,
                               string? background = null, string? logo = null, string? logoPosition = null, string? mediaData = null)
    {
        _logger.LogInformation("Starting broadcast ({Type}): {Content} (duration: {Duration}ms)", type, url ?? message ?? "media", duration);

        // Save current playlist state
        _savedPlaylist = _playlistItems.ToList();
        _savedIndex = _currentIndex;
        _isBroadcasting = true;

        // Clear current rotation timer
        _rotationTimer?.Dispose();
        _rotationTimer = null;

        // Display broadcast content
        if (type == "url" && !string.IsNullOrEmpty(url))
        {
            // Navigate to broadcast URL
            _ = Task.Run(async () =>
            {
                try
                {
                    await _browser.NavigateAsync(url);
                    _logger.LogInformation("Displaying broadcast URL: {Url}", url);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to navigate to broadcast URL");
                }
            });
        }
        else if ((type == "image" || type == "video") && !string.IsNullOrEmpty(mediaData))
        {
            // Construct full URL from server base URL + media path
            var serverUrl = _serverUrl.TrimEnd('/');
            var fullMediaUrl = mediaData.StartsWith("http") ? mediaData : $"{serverUrl}{mediaData}";

            _logger.LogInformation("Displaying broadcast {Type} directly from URL: {Url}", type, fullMediaUrl);

            _ = Task.Run(async () =>
            {
                try
                {
                    await _browser.NavigateAsync(fullMediaUrl);
                    _logger.LogInformation("Displaying broadcast {Type}", type);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to display broadcast {Type}", type);
                }
            });
        }
        else if (type == "message" && !string.IsNullOrEmpty(message))
        {
            // Create HTML page to display the message
            // Background: custom image or gradient
            var backgroundStyle = !string.IsNullOrEmpty(background)
                ? $"background-image: url('{background}'); background-size: cover; background-position: center; background-repeat: no-repeat;"
                : "background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);";

            // Logo element (if provided)
            var logoHtml = !string.IsNullOrEmpty(logo)
                ? $"<img src='{logo}' style='position: fixed; {GetLogoPositionStyles(logoPosition ?? "top-left")} max-width: 200px; max-height: 200px; object-fit: contain; z-index: 1000;' alt='Logo' />"
                : "";

            var messageHtml = $@"
<!DOCTYPE html>
<html>
  <head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <title>Broadcast Message</title>
    <style>
      body {{
        margin: 0;
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        {backgroundStyle}
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      }}
      .message-container {{
        background: white;
        border-radius: 20px;
        padding: 60px 80px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        max-width: 80%;
        text-align: center;
      }}
      .message-text {{
        font-size: 48px;
        font-weight: 600;
        color: #2d3748;
        line-height: 1.4;
        white-space: pre-wrap;
        word-wrap: break-word;
      }}
      .broadcast-label {{
        font-size: 18px;
        color: #667eea;
        text-transform: uppercase;
        letter-spacing: 2px;
        margin-bottom: 30px;
        font-weight: 700;
      }}
    </style>
  </head>
  <body>
    {logoHtml}
    <div class='message-container'>
      <div class='broadcast-label'>Broadcast Message</div>
      <div class='message-text'>{System.Net.WebUtility.HtmlEncode(message)}</div>
    </div>
  </body>
</html>";

            var dataUri = "data:text/html;charset=utf-8," + Uri.EscapeDataString(messageHtml);
            _ = Task.Run(async () =>
            {
                try
                {
                    await _browser.NavigateAsync(dataUri);
                    _logger.LogInformation("Displaying broadcast message: {Message}", message);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to display broadcast message");
                }
            });
        }

        EmitStateUpdate();

        // Auto-end broadcast after duration if specified
        if (duration > 0)
        {
            _broadcastTimer = new Timer(_ =>
            {
                try
                {
                    _logger.LogInformation("Broadcast duration expired, ending broadcast");
                    EndBroadcast();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error ending broadcast after timeout");
                }
            }, null, TimeSpan.FromMilliseconds(duration), Timeout.InfiniteTimeSpan);
        }
    }

    public void EndBroadcast()
    {
        if (!_isBroadcasting)
        {
            _logger.LogWarning("Not currently broadcasting");
            return;
        }

        _logger.LogInformation("Ending broadcast, restoring playlist");

        // Clear broadcast timer
        _broadcastTimer?.Dispose();
        _broadcastTimer = null;

        // Restore saved playlist
        _playlistItems = _savedPlaylist.ToList();
        _currentIndex = _savedIndex;
        _isBroadcasting = false;

        // Resume normal playlist execution
        if (_isRunning && !_isPaused)
        {
            ExecuteNextItem();
        }

        EmitStateUpdate();
    }

    private bool HasPlaylistChanged(List<PlaylistItem> oldItems, List<PlaylistItem> newItems)
    {
        // If items were added or removed, we need to restart to re-evaluate what should play
        if (oldItems.Count != newItems.Count)
        {
            return true; // Items added/removed - need to restart
        }

        // Check if any item's scheduling fields or duration changed
        foreach (var newItem in newItems)
        {
            var oldItem = oldItems.FirstOrDefault(i => i.Id == newItem.Id);
            if (oldItem == null)
            {
                // New item (shouldn't happen since counts match, but be safe)
                return true;
            }

            // Compare scheduling fields
            if (oldItem.TimeWindowStart != newItem.TimeWindowStart ||
                oldItem.TimeWindowEnd != newItem.TimeWindowEnd ||
                oldItem.DaysOfWeek != newItem.DaysOfWeek)
            {
                return true; // Scheduling changed for this item
            }

            // Also check if duration changed (affects rotation timing)
            if (oldItem.DurationSeconds != newItem.DurationSeconds)
            {
                return true; // Duration changed - need to restart timers
            }
        }

        return false; // No significant changes detected
    }

    public void Dispose()
    {
        _broadcastTimer?.Dispose();
        Stop();
    }
}

public class PlaylistItem
{
    public int Id { get; set; }
    public int PlaylistId { get; set; }
    public int? ContentId { get; set; }
    public string? Url { get; set; }
    public int DurationSeconds { get; set; }
    public int OrderIndex { get; set; }
    public string? TimeWindowStart { get; set; }
    public string? TimeWindowEnd { get; set; }
    public string? DaysOfWeek { get; set; }
}

using KioskClient.Core;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace KioskClient.Service;

public class KioskWorker : BackgroundService
{
    private readonly ILogger<KioskWorker> _logger;
    private readonly KioskConfiguration _config;
    private readonly SemaphoreSlim _configUpdateLock = new SemaphoreSlim(1, 1);
    private WebSocketClient? _wsClient;
    private BrowserController? _browser;
    private HealthMonitor? _healthMonitor;
    private PlaylistExecutor? _playlistExecutor;
    private VideoCacheManager? _videoCacheManager;
    private Timer? _healthTimer;
    private Timer? _screenshotTimer;
    private readonly string _instanceId;
    private DateTime _initializationCompletedAt = DateTime.MinValue;

    public KioskWorker(ILogger<KioskWorker> logger, KioskConfiguration config)
    {
        _logger = logger;
        _config = config;
        _instanceId = Guid.NewGuid().ToString("N").Substring(0, 8);
        _logger.LogWarning(">>> INSTANCE CREATED: KioskWorker instance ID = {InstanceId}", _instanceId);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            _logger.LogInformation("Kiosk Client starting...");
            _logger.LogInformation("Device ID: {DeviceId}", _config.DeviceId);
            _logger.LogInformation("Server URL: {ServerUrl}", _config.ServerUrl);

            // Initialize components
            await InitializeAsync(stoppingToken);

            // Keep service running and monitor WebSocket connection
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    // Check WebSocket connection health
                    if (_wsClient != null && !_wsClient.IsConnected)
                    {
                        _logger.LogWarning("WebSocket connection lost. Attempting to reconnect...");

                        try
                        {
                            // Dispose old client
                            _wsClient.Dispose();

                            // Create new WebSocket client
                            _wsClient = new WebSocketClient(_config, new LoggerAdapter(_logger));
                            _wsClient.OnMessage += HandleWebSocketMessage;

                            // Attempt to connect
                            await _wsClient.ConnectAsync(stoppingToken);

                            _logger.LogInformation("WebSocket reconnected successfully");
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Failed to reconnect WebSocket. Will retry in 5 seconds...");
                            await Task.Delay(5000, stoppingToken);
                            continue;
                        }
                    }

                    await Task.Delay(1000, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in main service loop");
                    await Task.Delay(5000, stoppingToken);
                }
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Kiosk Client stopping...");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Fatal error in Kiosk Client");
            throw;
        }
    }

    private async Task FetchAndApplyDeviceConfigAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(10);

            // Authenticate with device token (not DeviceId string)
            var url = $"{_config.ServerUrl}/devices/config?token={Uri.EscapeDataString(_config.DeviceToken)}";
            _logger.LogInformation("Fetching device config using token authentication");

            var response = await httpClient.GetAsync(url, cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                var deviceConfig = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(json);

                // Apply configuration if present in the response
                if (deviceConfig.TryGetProperty("displayWidth", out var widthElement) && widthElement.ValueKind != System.Text.Json.JsonValueKind.Null)
                {
                    _config.ViewportWidth = widthElement.GetInt32();
                    _logger.LogInformation("Applied DisplayWidth from server: {Width}", _config.ViewportWidth);
                }

                if (deviceConfig.TryGetProperty("displayHeight", out var heightElement) && heightElement.ValueKind != System.Text.Json.JsonValueKind.Null)
                {
                    _config.ViewportHeight = heightElement.GetInt32();
                    _logger.LogInformation("Applied DisplayHeight from server: {Height}", _config.ViewportHeight);
                }

                if (deviceConfig.TryGetProperty("kioskMode", out var kioskElement) && kioskElement.ValueKind != System.Text.Json.JsonValueKind.Null)
                {
                    _config.KioskMode = kioskElement.GetBoolean();
                    _logger.LogInformation("Applied KioskMode from server: {KioskMode}", _config.KioskMode);
                }
            }
            else if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                _logger.LogWarning("Device not found on server (token authentication failed). Using default configuration. The device may not be registered yet.");
            }
            else
            {
                _logger.LogWarning("Failed to fetch device config: {StatusCode}. Using default configuration.", response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch device configuration from server. Using default configuration.");
            // Continue with default configuration - don't fail startup
        }
    }

    private async Task InitializeAsync(CancellationToken cancellationToken)
    {
        try
        {
            // IMPORTANT: Fetch device configuration from server BEFORE initializing browser
            // This prevents the ugly startup behavior where browser is created with default config,
            // then immediately killed and recreated after receiving config from WebSocket
            _logger.LogInformation(">>> INIT: Fetching device configuration from server...");
            await FetchAndApplyDeviceConfigAsync(cancellationToken);
            _logger.LogInformation(">>> INIT: Device configuration applied (DisplayWidth={Width}, DisplayHeight={Height}, KioskMode={KioskMode})",
                _config.ViewportWidth, _config.ViewportHeight, _config.KioskMode);

            // Initialize browser with correct configuration
            _logger.LogInformation(">>> INIT: Creating BrowserController...");
            _browser = new BrowserController(_config, new LoggerAdapter(_logger));

            _logger.LogInformation(">>> INIT: Initializing browser...");
            await _browser.InitializeAsync();
            _logger.LogInformation(">>> INIT: Browser initialized successfully");

            // Set up screencast frame handler
            var frameCounter = 0;
            _browser.SetScreencastFrameHandler((frameData, metadata) =>
            {
                frameCounter++;
                if (frameCounter == 1)
                {
                    _logger.LogInformation("First screencast frame captured!");
                }
                if (frameCounter % 30 == 0) // Log every 30 frames (~3 seconds at 10 FPS)
                {
                    _logger.LogInformation($"Captured screencast frame #{frameCounter}, wsClient={(_wsClient != null ? "connected" : "null")}");
                }

                if (_wsClient != null)
                {
                    try
                    {
                        _wsClient.SendEventAsync("screencast:frame", new
                        {
                            data = frameData,
                            metadata = metadata
                        }).Wait();
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to send screencast frame");
                    }
                }
            });

            // Initialize health monitor
            _logger.LogInformation(">>> INIT: Creating HealthMonitor...");
            _healthMonitor = new HealthMonitor(new LoggerAdapter(_logger));

            // Initialize video cache manager
            _logger.LogInformation(">>> INIT: Creating VideoCacheManager...");
            _videoCacheManager = new VideoCacheManager(new LoggerAdapter(_logger));

            // Initialize playlist executor
            _logger.LogInformation(">>> INIT: Creating PlaylistExecutor...");
            _playlistExecutor = new PlaylistExecutor(new LoggerAdapter(_logger), _browser, _config.ServerUrl, _videoCacheManager);
            _logger.LogInformation(">>> INIT: PlaylistExecutor created successfully");

            // Set up screenshot handler for when playlist items change
            _playlistExecutor.OnScreenshotReady += async (screenshot, currentUrl) =>
            {
                try
                {
                    if (_wsClient != null)
                    {
                        await _wsClient.SendEventAsync("screenshot:upload", new
                        {
                            image = screenshot,  // Match Node.js client property name
                            currentUrl
                        });
                        _logger.LogInformation("Screenshot sent after playlist item change ({Length} bytes)", screenshot.Length);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to send screenshot after item change");
                }
            };

            // Initialize WebSocket client
            _logger.LogInformation(">>> INIT: Creating WebSocket client...");
            _wsClient = new WebSocketClient(_config, new LoggerAdapter(_logger));

            // Set up playback state handler to send updates via WebSocket
            _playlistExecutor.SetStateUpdateHandler(state =>
            {
                if (_wsClient != null)
                {
                    try
                    {
                        // Use Task.Run to fire-and-forget the async operation
                        _ = Task.Run(async () =>
                        {
                            try
                            {
                                await _wsClient.SendEventAsync("playback:state:update", state);
                                var stateJson = System.Text.Json.JsonSerializer.Serialize(state);
                                _logger.LogInformation("Playback state sent: {State}", stateJson);
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError(ex, "Failed to send playback state update");
                            }
                        });
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to queue playback state update");
                    }
                }
            });
            _wsClient.OnMessage += HandleWebSocketMessage;

            await _wsClient.ConnectAsync(cancellationToken);

            // Start periodic health reports
            _healthTimer = new Timer(_ =>
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await SendHealthReportAsync();
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error in health report timer");
                    }
                });
            }, null, TimeSpan.FromSeconds(10), TimeSpan.FromMilliseconds(_config.HealthReportIntervalMs));

            // Set up periodic screenshot timer (especially important for single-item playlists)
            var screenshotInterval = _config.ScreenshotIntervalMs > 0 ? _config.ScreenshotIntervalMs : 30000; // Default 30 seconds
            _screenshotTimer = new Timer(async _ =>
            {
                try
                {
                    await SendScreenshotAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in screenshot timer");
                }
            }, null, TimeSpan.FromSeconds(5), TimeSpan.FromMilliseconds(screenshotInterval));

            // Mark initialization as complete - used to skip immediate config:update events
            _initializationCompletedAt = DateTime.UtcNow;
            _logger.LogInformation("Kiosk Client initialized successfully (Screenshot interval: {Interval}ms)", screenshotInterval);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, ">>> INIT FAILED: Critical error during initialization. Service will continue but will not function properly.");
            _logger.LogError(">>> INIT: _browser={BrowserNull}, _playlistExecutor={ExecutorNull}",
                _browser == null ? "NULL" : "OK",
                _playlistExecutor == null ? "NULL" : "OK");
            throw; // Re-throw to ensure startup failure is visible
        }
    }

    private async Task HandleWebSocketMessage(string eventName, JsonElement payload)
    {
        try
        {
            _logger.LogInformation(">>> Handling event: {Event} with payload: {Payload}", eventName, payload.ToString());

            switch (eventName)
            {
                case "display:navigate":
                    if (payload.TryGetProperty("url", out var urlElement))
                    {
                        var url = urlElement.GetString();
                        if (!string.IsNullOrEmpty(url) && _browser != null)
                        {
                            await _browser.NavigateAsync(url);
                        }
                    }
                    break;

                case "display:refresh":
                    if (_browser != null)
                    {
                        await _browser.RefreshAsync();
                    }
                    break;

                case "screenshot:request":
                    await SendScreenshotAsync();
                    break;

                case "remote:click":
                    if (_browser != null &&
                        payload.TryGetProperty("x", out var xElement) &&
                        payload.TryGetProperty("y", out var yElement))
                    {
                        var button = payload.TryGetProperty("button", out var btnElement) ? btnElement.GetString() : "left";
                        await _browser.ClickAsync(xElement.GetInt32(), yElement.GetInt32(), button ?? "left");
                    }
                    break;

                case "remote:type":
                    if (_browser != null && payload.TryGetProperty("text", out var textElement))
                    {
                        var text = textElement.GetString();
                        var selector = payload.TryGetProperty("selector", out var selElement) ? selElement.GetString() : null;
                        if (!string.IsNullOrEmpty(text))
                        {
                            await _browser.TypeAsync(text, selector);
                        }
                    }
                    break;

                case "remote:key":
                    if (_browser != null && payload.TryGetProperty("key", out var keyElement))
                    {
                        var key = keyElement.GetString();
                        if (!string.IsNullOrEmpty(key))
                        {
                            await _browser.PressKeyAsync(key);
                        }
                    }
                    break;

                case "remote:scroll":
                    if (_browser != null &&
                        payload.TryGetProperty("x", out var scrollX) &&
                        payload.TryGetProperty("y", out var scrollY))
                    {
                        await _browser.ScrollAsync(scrollX.GetInt32(), scrollY.GetInt32());
                    }
                    break;

                case "content:update":
                    if (_playlistExecutor != null && payload.TryGetProperty("items", out var itemsElement))
                    {
                        var playlistId = payload.TryGetProperty("playlistId", out var playlistIdElement) ? playlistIdElement.GetInt32() : 0;

                        var items = new List<Core.PlaylistItem>();
                        foreach (var item in itemsElement.EnumerateArray())
                        {
                            items.Add(new Core.PlaylistItem
                            {
                                Id = item.GetProperty("id").GetInt32(),
                                PlaylistId = item.TryGetProperty("playlistId", out var pid) ? pid.GetInt32() : 0,
                                ContentId = item.TryGetProperty("contentId", out var cid) ? cid.GetInt32() : null,
                                Url = item.TryGetProperty("content", out var content) && content.TryGetProperty("url", out var url) ? url.GetString() : null,
                                DurationSeconds = item.TryGetProperty("displayDuration", out var dur) ? dur.GetInt32() / 1000 : 0,
                                OrderIndex = item.TryGetProperty("orderIndex", out var order) ? order.GetInt32() : 0,
                                TimeWindowStart = item.TryGetProperty("timeWindowStart", out var tws) ? tws.GetString() : null,
                                TimeWindowEnd = item.TryGetProperty("timeWindowEnd", out var twe) ? twe.GetString() : null,
                                DaysOfWeek = item.TryGetProperty("daysOfWeek", out var dow) ? dow.GetRawText() : null
                            });
                        }

                        _playlistExecutor.LoadPlaylist(playlistId, items);
                        _playlistExecutor.Start();
                        _logger.LogInformation("Playlist loaded and started with {Count} items", items.Count);
                    }
                    break;

                case "config:update":
                    _logger.LogInformation("Received config update");
                    await HandleConfigUpdateAsync(payload);
                    break;

                case "screencast:start":
                    if (_browser != null)
                    {
                        _logger.LogInformation("Starting screencast...");
                        await _browser.StartScreencastAsync();
                    }
                    break;

                case "screencast:stop":
                    if (_browser != null)
                    {
                        _logger.LogInformation("Stopping screencast...");
                        await _browser.StopScreencastAsync();
                    }
                    break;

                case "device:restart":
                    _logger.LogWarning("🔄 Restart command received from server. Restarting browser...");
                    // Restart browser without restarting entire process
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            if (_browser != null)
                            {
                                _logger.LogInformation("Stopping playlist and services...");

                                // Stop services
                                _playlistExecutor?.Pause();

                                // Restart browser (closes and reinitializes)
                                _logger.LogInformation("Restarting browser...");
                                await _browser.RecoverBrowserAsync();

                                // Resume playlist
                                _logger.LogInformation("Resuming playlist...");
                                _playlistExecutor?.Resume();

                                _logger.LogInformation("✅ Browser restarted successfully");
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Failed to restart browser");
                        }
                    });
                    break;

                case "playlist:pause":
                    if (_playlistExecutor != null)
                    {
                        _logger.LogInformation("Pausing playlist...");
                        _playlistExecutor.Pause();
                    }
                    break;

                case "playlist:resume":
                    if (_playlistExecutor != null)
                    {
                        _logger.LogInformation("Resuming playlist...");
                        _playlistExecutor.Resume();
                    }
                    break;

                case "playlist:next":
                    if (_playlistExecutor != null)
                    {
                        _logger.LogInformation("Advancing to next playlist item...");
                        _playlistExecutor.Next();
                    }
                    break;

                case "playlist:previous":
                    if (_playlistExecutor != null)
                    {
                        _logger.LogInformation("Going back to previous playlist item...");
                        _playlistExecutor.Previous();
                    }
                    break;

                case "playlist:broadcast:start":
                    _logger.LogInformation(">>> Received playlist:broadcast:start event [Instance: {InstanceId}]", _instanceId);
                    _logger.LogInformation(">>> Component State: _browser={Browser}, _playlistExecutor={Executor}, _wsClient={WsClient}",
                        _browser == null ? "NULL" : "OK",
                        _playlistExecutor == null ? "NULL" : "OK",
                        _wsClient == null ? "NULL" : "OK");

                    if (_playlistExecutor != null)
                    {
                        var type = payload.TryGetProperty("type", out var typeElement) ? typeElement.GetString() : "url";
                        var broadcastUrl = payload.TryGetProperty("url", out var broadcastUrlElement) && broadcastUrlElement.ValueKind != JsonValueKind.Null ? broadcastUrlElement.GetString() : null;
                        var message = payload.TryGetProperty("message", out var messageElement) && messageElement.ValueKind != JsonValueKind.Null ? messageElement.GetString() : null;
                        var duration = payload.TryGetProperty("duration", out var durationElement) && durationElement.ValueKind != JsonValueKind.Null ? durationElement.GetInt32() : 0;
                        var background = payload.TryGetProperty("background", out var backgroundElement) && backgroundElement.ValueKind != JsonValueKind.Null ? backgroundElement.GetString() : null;
                        var logo = payload.TryGetProperty("logo", out var logoElement) && logoElement.ValueKind != JsonValueKind.Null ? logoElement.GetString() : null;
                        var logoPosition = payload.TryGetProperty("logoPosition", out var logoPositionElement) && logoPositionElement.ValueKind != JsonValueKind.Null ? logoPositionElement.GetString() : null;
                        var mediaData = payload.TryGetProperty("mediaData", out var mediaDataElement) && mediaDataElement.ValueKind != JsonValueKind.Null ? mediaDataElement.GetString() : null;

                        _logger.LogInformation("Starting broadcast ({Type}): {Content}, Background: {BgLen} chars, Logo: {LogoLen} chars, Position: {Pos}, Media: {MediaLen} chars",
                            type, broadcastUrl ?? message ?? "media", background?.Length ?? 0, logo?.Length ?? 0, logoPosition, mediaData?.Length ?? 0);
                        _playlistExecutor.StartBroadcast(type ?? "url", broadcastUrl, message, duration, background, logo, logoPosition, mediaData);
                    }
                    else
                    {
                        _logger.LogError(">>> CRITICAL: Received broadcast start event but _playlistExecutor is NULL! [Instance: {InstanceId}]", _instanceId);
                        _logger.LogError(">>> This likely means the browser restart failed or the service is in a broken state.");
                        _logger.LogError(">>> Component State: _browser={Browser}, _playlistExecutor={Executor}",
                            _browser == null ? "NULL" : "OK",
                            _playlistExecutor == null ? "NULL" : "OK");
                    }
                    break;

                case "playlist:broadcast:end":
                    if (_playlistExecutor != null)
                    {
                        _logger.LogInformation("Ending broadcast");
                        _playlistExecutor.EndBroadcast();
                    }
                    break;

                default:
                    _logger.LogWarning("Unhandled event: {Event}", eventName);
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling WebSocket message: {Event}", eventName);
        }
    }

    private async Task SendHealthReportAsync()
    {
        try
        {
            if (_healthMonitor != null && _wsClient != null)
            {
                var health = await _healthMonitor.GetHealthReportAsync();
                await _wsClient.SendEventAsync("health:report", new
                {
                    cpu = health.CpuPercent,
                    memory = health.MemoryPercent,
                    disk = health.DiskPercent,
                    timestamp = health.Timestamp
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send health report");
        }
    }

    private async Task SendScreenshotAsync()
    {
        try
        {
            if (_browser != null && _wsClient != null)
            {
                var screenshot = await _browser.CaptureScreenshotAsync();
                var currentUrl = _browser.GetCurrentUrl();

                await _wsClient.SendEventAsync("screenshot:upload", new
                {
                    image = screenshot,  // Match Node.js client property name
                    currentUrl
                });

                _logger.LogInformation("Screenshot sent successfully ({Length} bytes)", screenshot.Length);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send screenshot");
        }
    }

    private async Task HandleConfigUpdateAsync(JsonElement payload)
    {
        // Prevent concurrent config updates
        if (!await _configUpdateLock.WaitAsync(0))
        {
            _logger.LogWarning("Config update already in progress, skipping this update");
            return;
        }

        try
        {
            // IMPORTANT: Skip config:update events during initialization grace period (15 seconds)
            // This prevents the "ugly startup" where:
            // 1. Client fetches config via HTTP (device not registered yet, returns 404)
            // 2. Client initializes browser with default config
            // 3. WebSocket connects and device gets registered
            // 4. Server sends config:update with database values
            // 5. Browser gets restarted unnecessarily
            if (_initializationCompletedAt != DateTime.MinValue)
            {
                var timeSinceInit = DateTime.UtcNow - _initializationCompletedAt;
                if (timeSinceInit.TotalSeconds < 15)
                {
                    _logger.LogInformation("Skipping config:update during initialization grace period ({Elapsed:F1}s < 15s). Config will be applied on next restart if needed.", timeSinceInit.TotalSeconds);
                    _configUpdateLock.Release();
                    return;
                }
            }

            bool displayConfigChanged = false;

            // Check for display width changes
            if (payload.TryGetProperty("displayWidth", out var widthElement) && widthElement.ValueKind != JsonValueKind.Null)
            {
                var newWidth = widthElement.GetInt32();
                if (newWidth != _config.ViewportWidth)
                {
                    _logger.LogInformation("Display width changed from {OldWidth} to {NewWidth}", _config.ViewportWidth, newWidth);
                    _config.ViewportWidth = newWidth;
                    displayConfigChanged = true;
                }
            }

            // Check for display height changes
            if (payload.TryGetProperty("displayHeight", out var heightElement) && heightElement.ValueKind != JsonValueKind.Null)
            {
                var newHeight = heightElement.GetInt32();
                if (newHeight != _config.ViewportHeight)
                {
                    _logger.LogInformation("Display height changed from {OldHeight} to {NewHeight}", _config.ViewportHeight, newHeight);
                    _config.ViewportHeight = newHeight;
                    displayConfigChanged = true;
                }
            }

            // Check for kiosk mode changes
            if (payload.TryGetProperty("kioskMode", out var kioskElement) && kioskElement.ValueKind != JsonValueKind.Null)
            {
                var newKioskMode = kioskElement.GetBoolean();
                if (newKioskMode != _config.KioskMode)
                {
                    _logger.LogInformation("Kiosk mode changed from {OldMode} to {NewMode}", _config.KioskMode, newKioskMode);

                    // If transitioning FROM kiosk mode TO non-kiosk mode, restore taskbar immediately
                    if (_config.KioskMode == true && newKioskMode == false)
                    {
                        _logger.LogInformation("Exiting kiosk mode - restoring Windows taskbar");
                        if (TaskbarManager.Show())
                        {
                            _logger.LogInformation("Windows taskbar restored when exiting kiosk mode");
                        }
                        else
                        {
                            _logger.LogWarning("Failed to restore Windows taskbar when exiting kiosk mode");
                        }
                    }

                    _config.KioskMode = newKioskMode;
                    displayConfigChanged = true;
                }
            }

            // Restart browser if display configuration changed
            if (displayConfigChanged && _browser != null)
            {
                _logger.LogInformation("Display configuration changed, restarting browser...");

                // CRITICAL: Stop all timers first to prevent concurrent operations
                _logger.LogInformation("Stopping timers before browser restart...");
                _healthTimer?.Change(Timeout.Infinite, Timeout.Infinite);
                _screenshotTimer?.Change(Timeout.Infinite, Timeout.Infinite);

                // Wait a moment to ensure any in-flight operations complete
                await Task.Delay(1000);

                // Save current playlist state
                var wasRunning = _playlistExecutor != null;
                var currentPlaylistId = 0;
                var currentPlaylistItems = new List<Core.PlaylistItem>();

                if (_playlistExecutor != null)
                {
                    // Save playlist state before disposing
                    currentPlaylistId = _playlistExecutor.GetType().GetField("_currentPlaylistId", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)?.GetValue(_playlistExecutor) as int? ?? 0;
                    currentPlaylistItems = _playlistExecutor.GetType().GetField("_playlistItems", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)?.GetValue(_playlistExecutor) as List<Core.PlaylistItem> ?? new List<Core.PlaylistItem>();

                    _logger.LogInformation("Stopping playlist executor...");
                    _playlistExecutor.Stop();
                    _playlistExecutor.Dispose();
                    _playlistExecutor = null;
                }

                // Dispose old browser
                _logger.LogInformation("Disposing old browser...");
                try
                {
                    await _browser.DisposeAsync();
                    _browser = null;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error disposing old browser (may already be closed)");
                }

                // Wait for complete disposal
                await Task.Delay(2000);

                // Reinitialize browser with new config (with retry logic)
                _logger.LogInformation("Initializing new browser with updated config...");
                BrowserController? newBrowser = null;
                int retryCount = 0;
                const int maxRetries = 3;

                while (newBrowser == null && retryCount < maxRetries)
                {
                    try
                    {
                        newBrowser = new BrowserController(_config, new LoggerAdapter(_logger));
                        await newBrowser.InitializeAsync();
                        _logger.LogInformation("Browser initialized successfully");
                    }
                    catch (Exception ex)
                    {
                        retryCount++;
                        _logger.LogError(ex, "Failed to initialize browser (attempt {Retry}/{MaxRetries})", retryCount, maxRetries);

                        if (newBrowser != null)
                        {
                            try { await newBrowser.DisposeAsync(); } catch { }
                            newBrowser = null;
                        }

                        if (retryCount < maxRetries)
                        {
                            _logger.LogWarning("Waiting 3 seconds before retry...");
                            await Task.Delay(3000);
                        }
                        else
                        {
                            _logger.LogError(">>> CRITICAL: Failed to initialize browser after {MaxRetries} attempts. Service is in broken state!", maxRetries);
                            throw; // Re-throw to be caught by outer catch block
                        }
                    }
                }

                _browser = newBrowser!;

                // Re-setup screencast handler
                _browser.SetScreencastFrameHandler((frameData, metadata) =>
                {
                    if (_wsClient != null)
                    {
                        try
                        {
                            _wsClient.SendEventAsync("screencast:frame", new
                            {
                                data = frameData,
                                metadata = metadata
                            }).Wait();
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Failed to send screencast frame");
                        }
                    }
                });

                _logger.LogInformation("Browser restarted with new configuration");

                // Recreate playlist executor with new browser
                _logger.LogInformation("Recreating playlist executor with new browser...");
                _playlistExecutor = new PlaylistExecutor(new LoggerAdapter(_logger), _browser, _config.ServerUrl, _videoCacheManager!);
                _logger.LogInformation("Playlist executor recreated successfully");

                // Re-setup screenshot handler
                _playlistExecutor.OnScreenshotReady += async (screenshot, currentUrl) =>
                {
                    try
                    {
                        if (_wsClient != null)
                        {
                            await _wsClient.SendEventAsync("screenshot:upload", new
                            {
                                image = screenshot,
                                currentUrl
                            });
                            _logger.LogInformation("Screenshot sent after playlist item change ({Length} bytes)", screenshot.Length);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to send screenshot after item change");
                    }
                };

                // Re-setup playback state handler
                _playlistExecutor.SetStateUpdateHandler(state =>
                {
                    if (_wsClient != null)
                    {
                        try
                        {
                            _ = Task.Run(async () =>
                            {
                                try
                                {
                                    await _wsClient.SendEventAsync("playback:state:update", state);
                                    var stateJson = System.Text.Json.JsonSerializer.Serialize(state);
                                    _logger.LogInformation("Playback state sent: {State}", stateJson);
                                }
                                catch (Exception ex)
                                {
                                    _logger.LogError(ex, "Failed to send playback state update");
                                }
                            });
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Failed to queue playback state update");
                        }
                    }
                });

                // Reload playlist if it was running
                if (wasRunning && currentPlaylistItems.Any())
                {
                    _playlistExecutor.LoadPlaylist(currentPlaylistId, currentPlaylistItems);
                    _playlistExecutor.Start();
                    _logger.LogInformation("Playlist restarted after display config change");
                }

                // Restart timers
                _logger.LogInformation("Restarting timers after browser restart...");

                // Restart health timer
                var healthInterval = _config.HealthReportIntervalMs > 0 ? _config.HealthReportIntervalMs : 60000;
                _healthTimer?.Change(TimeSpan.FromSeconds(5), TimeSpan.FromMilliseconds(healthInterval));

                // Restart screenshot timer
                var screenshotInterval = _config.ScreenshotIntervalMs > 0 ? _config.ScreenshotIntervalMs : 30000;
                _screenshotTimer?.Change(TimeSpan.FromSeconds(5), TimeSpan.FromMilliseconds(screenshotInterval));

                _logger.LogInformation("Browser restart complete - all systems operational");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to handle config update");
        }
        finally
        {
            _configUpdateLock.Release();
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Kiosk Client stopping...");

        _healthTimer?.Dispose();
        _screenshotTimer?.Dispose();

        _playlistExecutor?.Dispose();
        _videoCacheManager?.Dispose();

        if (_wsClient != null)
        {
            await _wsClient.DisconnectAsync();
            _wsClient.Dispose();
        }

        if (_browser != null)
        {
            await _browser.DisposeAsync();
        }

        _healthMonitor?.Dispose();
        _configUpdateLock?.Dispose();

        await base.StopAsync(cancellationToken);
    }
}

// Adapter to bridge ILogger to our simple ILogger interface
public class LoggerAdapter : Core.ILogger
{
    private readonly Microsoft.Extensions.Logging.ILogger _logger;

    public LoggerAdapter(Microsoft.Extensions.Logging.ILogger logger)
    {
        _logger = logger;
    }

    public void LogInformation(string message, params object[] args) => _logger.LogInformation(message, args);
    public void LogWarning(Exception? exception, string message, params object[] args) => _logger.LogWarning(exception, message, args);
    public void LogWarning(string message, params object[] args) => _logger.LogWarning(message, args);
    public void LogError(Exception? exception, string message, params object[] args) => _logger.LogError(exception, message, args);
    public void LogDebug(string message, params object[] args) => _logger.LogDebug(message, args);
}

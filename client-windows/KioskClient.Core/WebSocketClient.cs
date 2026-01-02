using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace KioskClient.Core;

public class WebSocketClient : IDisposable
{
    private readonly KioskConfiguration _config;
    private readonly ILogger _logger;
    private ClientWebSocket? _webSocket;
    private CancellationTokenSource? _cts;
    private Task? _receiveTask;

    public event Func<string, JsonElement, Task>? OnMessage;
    public bool IsConnected => _webSocket?.State == WebSocketState.Open;

    public WebSocketClient(KioskConfiguration config, ILogger logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            _webSocket = new ClientWebSocket();
            _cts = new CancellationTokenSource();

            var wsUrl = _config.ServerUrl.Replace("http://", "ws://").Replace("https://", "wss://");
            var uri = new Uri($"{wsUrl}/ws?role=device&token={_config.DeviceToken}");

            _logger.LogInformation("Connecting to WebSocket: {Uri}", uri);
            await _webSocket.ConnectAsync(uri, cancellationToken);
            _logger.LogInformation("WebSocket connected");

            // Register device (only send token, backend looks up device by token)
            await SendEventAsync("device:register", new
            {
                token = _config.DeviceToken
            });

            // Start receiving messages
            _receiveTask = ReceiveMessagesAsync(_cts.Token);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to connect to WebSocket");
            throw;
        }
    }

    public async Task SendEventAsync(string eventName, object payload)
    {
        if (_webSocket?.State != WebSocketState.Open)
        {
            _logger.LogWarning("Cannot send event, WebSocket not connected");
            return;
        }

        try
        {
            var envelope = new
            {
                @event = eventName,
                payload
            };

            var options = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            };
            var json = JsonSerializer.Serialize(envelope, options);
            var bytes = Encoding.UTF8.GetBytes(json);

            await _webSocket.SendAsync(
                new ArraySegment<byte>(bytes),
                WebSocketMessageType.Text,
                endOfMessage: true,
                CancellationToken.None
            );

            _logger.LogDebug("Sent event: {Event}", eventName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send event: {Event}", eventName);
        }
    }

    private async Task ReceiveMessagesAsync(CancellationToken cancellationToken)
    {
        var buffer = new byte[1024 * 64]; // 64KB buffer per frame

        try
        {
            while (!cancellationToken.IsCancellationRequested && _webSocket?.State == WebSocketState.Open)
            {
                using var messageStream = new MemoryStream();
                WebSocketReceiveResult result;

                // Read all frames of the message
                do
                {
                    result = await _webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);

                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        _logger.LogInformation("WebSocket closed by server");
                        await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                        return;
                    }

                    messageStream.Write(buffer, 0, result.Count);
                }
                while (!result.EndOfMessage);

                messageStream.Seek(0, SeekOrigin.Begin);
                var json = Encoding.UTF8.GetString(messageStream.ToArray());

                _logger.LogDebug("Received WebSocket message ({Size} bytes)", messageStream.Length);
                await HandleMessageAsync(json);
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("WebSocket receive loop cancelled");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in WebSocket receive loop");
        }
    }

    private async Task HandleMessageAsync(string json)
    {
        try
        {
            var document = JsonDocument.Parse(json);
            var root = document.RootElement;

            if (root.TryGetProperty("event", out var eventElement) &&
                root.TryGetProperty("payload", out var payloadElement))
            {
                var eventName = eventElement.GetString() ?? string.Empty;
                _logger.LogDebug("Received event: {Event}", eventName);

                if (OnMessage != null)
                {
                    await OnMessage.Invoke(eventName, payloadElement);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to handle WebSocket message");
        }
    }

    public async Task DisconnectAsync()
    {
        if (_webSocket?.State == WebSocketState.Open)
        {
            _logger.LogInformation("Disconnecting WebSocket...");
            _cts?.Cancel();

            try
            {
                await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Client shutdown", CancellationToken.None);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error closing WebSocket");
            }
        }

        _receiveTask = null;
    }

    public void Dispose()
    {
        _cts?.Cancel();
        _cts?.Dispose();
        _webSocket?.Dispose();
    }
}

// Simple logger interface for now
public interface ILogger
{
    void LogInformation(string message, params object[] args);
    void LogWarning(Exception? exception, string message, params object[] args);
    void LogWarning(string message, params object[] args);
    void LogError(Exception? exception, string message, params object[] args);
    void LogDebug(string message, params object[] args);
}

using System.Text.Json.Serialization;

namespace TheiaCast.Api.Contracts
{
    // Enums mirroring client/server events
    public static class ClientToServerEvent
    {
        public const string DEVICE_REGISTER = "device:register";
        public const string HEALTH_REPORT = "health:report";
        public const string DEVICE_STATUS = "device:status";
        public const string ERROR_REPORT = "error:report";
        public const string SCREENSHOT_UPLOAD = "screenshot:upload";
    }

    public static class ServerToClientEvent
    {
        public const string CONTENT_UPDATE = "content:update";
        public const string BROADCAST_START = "playlist:broadcast:start";
        public const string BROADCAST_END = "playlist:broadcast:end";
    }

    public static class ServerToAdminEvent
    {
        public const string DEVICE_CONNECTED = "admin:device:connected";
        public const string DEVICE_DISCONNECTED = "admin:device:disconnected";
        public const string DEVICE_STATUS_CHANGED = "admin:device:status";
        public const string DEVICE_HEALTH_UPDATE = "admin:device:health";
        public const string ERROR_OCCURRED = "admin:error";
        public const string SCREENSHOT_RECEIVED = "admin:screenshot:received";
    }

    // Payloads
    public record DeviceRegisterPayload([property: JsonPropertyName("deviceId")] string DeviceId);

    public record HealthReportPayload(
        [property: JsonPropertyName("cpu")] double Cpu,
        [property: JsonPropertyName("mem")] double Mem,
        [property: JsonPropertyName("disk")] double Disk,
        [property: JsonPropertyName("ts")] DateTime Ts
    );

    public record DeviceStatusPayload([property: JsonPropertyName("status")] string Status);

    public record ErrorReportPayload([property: JsonPropertyName("error")] string Error);

    public record ScreenshotUploadPayload(
        [property: JsonPropertyName("image")] string ImageBase64,
        [property: JsonPropertyName("currentUrl")] string CurrentUrl
    );

    public record AdminDeviceConnectedPayload([property: JsonPropertyName("deviceId")] string DeviceId,
                                               [property: JsonPropertyName("timestamp")] DateTime Timestamp);

    public record AdminDeviceDisconnectedPayload([property: JsonPropertyName("deviceId")] string DeviceId,
                                                 [property: JsonPropertyName("timestamp")] DateTime Timestamp);

    public record AdminDeviceStatusPayload([property: JsonPropertyName("deviceId")] string DeviceId,
                                           [property: JsonPropertyName("status")] string Status,
                                           [property: JsonPropertyName("timestamp")] DateTime Timestamp);

    public record AdminDeviceHealthPayload([property: JsonPropertyName("deviceId")] string DeviceId,
                                           [property: JsonPropertyName("health")] HealthReportPayload Health,
                                           [property: JsonPropertyName("timestamp")] DateTime Timestamp);

    public record AdminErrorPayload([property: JsonPropertyName("deviceId")] string DeviceId,
                                    [property: JsonPropertyName("error")] string Error,
                                    [property: JsonPropertyName("timestamp")] DateTime Timestamp);

    public record AdminScreenshotReceivedPayload([property: JsonPropertyName("deviceId")] string DeviceId,
                                                 [property: JsonPropertyName("screenshotId")] int ScreenshotId,
                                                 [property: JsonPropertyName("timestamp")] DateTime Timestamp);

    public record ContentUpdatePayload([property: JsonPropertyName("playlistId")] int PlaylistId,
                                       [property: JsonPropertyName("items")] IEnumerable<PlaylistItemDto> Items);

    public record PlaylistItemDto([property: JsonPropertyName("playlistId")] int PlaylistId,
                                  [property: JsonPropertyName("url")] string Url,
                                  [property: JsonPropertyName("durationSeconds")] int? DurationSeconds);

    public record SetSettingRequest([property: JsonPropertyName("value")] string Value);

    public record CreateLogRequest(
        [property: JsonPropertyName("level")] string Level,
        [property: JsonPropertyName("message")] string Message,
        [property: JsonPropertyName("deviceId")] string? DeviceId,
        [property: JsonPropertyName("source")] string? Source,
        [property: JsonPropertyName("stackTrace")] string? StackTrace,
        [property: JsonPropertyName("additionalData")] string? AdditionalData
    );

    public record StartBroadcastRequest(
        [property: JsonPropertyName("type")] string Type, // "url" or "message"
        [property: JsonPropertyName("url")] string? Url,
        [property: JsonPropertyName("message")] string? Message,
        [property: JsonPropertyName("duration")] int? Duration,
        [property: JsonPropertyName("tagIds")] int[]? TagIds
    );

    public record BroadcastPayload(
        [property: JsonPropertyName("type")] string Type,
        [property: JsonPropertyName("url")] string? Url,
        [property: JsonPropertyName("message")] string? Message,
        [property: JsonPropertyName("duration")] int? Duration,
        [property: JsonPropertyName("background")] string? Background,
        [property: JsonPropertyName("logo")] string? Logo,
        [property: JsonPropertyName("logoPosition")] string? LogoPosition,
        [property: JsonPropertyName("mediaData")] string? MediaData  // Base64-encoded image or video data
    );

    // License DTOs
    public record GenerateLicenseDto(
        [property: JsonPropertyName("tier")] string Tier,
        [property: JsonPropertyName("maxDevices")] int MaxDevices,
        [property: JsonPropertyName("companyName")] string? CompanyName,
        [property: JsonPropertyName("expiresAt")] DateTime? ExpiresAt
    );

    public record UpdateLicenseDto(
        [property: JsonPropertyName("isActive")] bool? IsActive,
        [property: JsonPropertyName("expiresAt")] DateTime? ExpiresAt,
        [property: JsonPropertyName("notes")] string? Notes
    );

    public record ActivateLicenseDto(
        [property: JsonPropertyName("licenseKey")] string LicenseKey
    );

    public record ActivateLicenseGlobalDto(
        [property: JsonPropertyName("licenseKey")] string LicenseKey
    );

    public record DebugLicenseKeyDto(
        [property: JsonPropertyName("licenseKey")] string LicenseKey
    );

    // Tag DTOs
    public record CreateTagDto(string Name, string? Color);
    public record UpdateTagDto(string? Name, string? Color);

    public interface ITagService
    {
        Task<IResult> GetAllAsync();
        Task<IResult> GetByIdAsync(int id);
        Task<IResult> CreateAsync(CreateTagDto dto);
        Task<IResult> UpdateAsync(int id, UpdateTagDto dto);
        Task<IResult> DeleteAsync(int id);
        Task<IResult> AssignToDeviceAsync(int deviceId, int tagId);
        Task<IResult> RemoveFromDeviceAsync(int deviceId, int tagId);
        Task<IResult> GetDeviceTagsAsync(int deviceId);
    }
}
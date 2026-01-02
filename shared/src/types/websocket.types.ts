import { DeviceInfo, DeviceHealthMetrics, DeviceStatus } from './device.types';
import { PlaylistItem } from './playlist.types';

// WebSocket Events - Backend to Client (Devices)
export enum ServerToClientEvent {
  CONTENT_UPDATE = 'content:update',
  DISPLAY_NAVIGATE = 'display:navigate',
  SCREENSHOT_REQUEST = 'screenshot:request',
  CONFIG_UPDATE = 'config:update',
  DEVICE_RESTART = 'device:restart',
  DISPLAY_REFRESH = 'display:refresh',
  REMOTE_CLICK = 'remote:click',
  REMOTE_TYPE = 'remote:type',
  REMOTE_KEY = 'remote:key',
  REMOTE_SCROLL = 'remote:scroll',
  PLAYLIST_PAUSE = 'playlist:pause',
  PLAYLIST_RESUME = 'playlist:resume',
  PLAYLIST_NEXT = 'playlist:next',
  PLAYLIST_PREVIOUS = 'playlist:previous',
  PLAYLIST_BROADCAST_START = 'playlist:broadcast:start',
  PLAYLIST_BROADCAST_END = 'playlist:broadcast:end',
}

// WebSocket Events - Backend to Admin UI
export enum ServerToAdminEvent {
  DEVICE_CONNECTED = 'admin:device:connected',
  DEVICE_DISCONNECTED = 'admin:device:disconnected',
  DEVICE_STATUS_CHANGED = 'admin:device:status',
  DEVICE_HEALTH_UPDATE = 'admin:device:health',
  SCREENSHOT_RECEIVED = 'admin:screenshot:received',
  ERROR_OCCURRED = 'admin:error',
  PLAYBACK_STATE_CHANGED = 'admin:playback:state',
}

// WebSocket Events - Client to Backend
export enum ClientToServerEvent {
  DEVICE_REGISTER = 'device:register',
  SCREENSHOT_UPLOAD = 'screenshot:upload',
  HEALTH_REPORT = 'health:report',
  DEVICE_STATUS = 'device:status',
  ERROR_REPORT = 'error:report',
  PLAYBACK_STATE_UPDATE = 'playback:state:update',
}

// Payload types for Backend → Client
export interface ContentUpdatePayload {
  playlistId: number;
  items: PlaylistItem[];
}

export interface DisplayNavigatePayload {
  url: string;
  duration?: number;
}

export interface ScreenshotRequestPayload {
  timestamp: number;
}

export interface ConfigUpdatePayload {
  screenshotInterval?: number;
  healthCheckInterval?: number;
  displayWidth?: number;
  displayHeight?: number;
  kioskMode?: boolean;
  [key: string]: any;
}

export interface DeviceRestartPayload {
  message?: string;
}

export interface DisplayRefreshPayload {
  force?: boolean;
}

export interface RemoteClickPayload {
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
}

export interface RemoteTypePayload {
  text: string;
  selector?: string; // Optional CSS selector to focus before typing
}

export interface RemoteKeyPayload {
  key: string; // e.g., 'Enter', 'Tab', 'Escape', 'ArrowDown'
  modifiers?: ('Shift' | 'Control' | 'Alt' | 'Meta')[];
}

export interface RemoteScrollPayload {
  x?: number;
  y?: number;
  deltaX?: number; // For relative scrolling
  deltaY?: number;
}

// Payload types for Client → Backend
// Note: deviceId is no longer included in these payloads - it's determined from the authenticated WebSocket connection
export interface DeviceRegisterPayload {
  deviceInfo: DeviceInfo;
}

export interface ScreenshotUploadPayload {
  image: string; // Base64 encoded
  timestamp: number;
  currentUrl: string;
}

export interface HealthReportPayload extends DeviceHealthMetrics {}

export interface DeviceStatusPayload {
  status: DeviceStatus;
  message?: string;
}

export interface ErrorReportPayload {
  error: string;
  stack?: string;
  context?: any;
}

// Admin UI event payloads
export interface AdminDeviceConnectedPayload {
  deviceId: string;
  timestamp: Date;
}

export interface AdminDeviceDisconnectedPayload {
  deviceId: string;
  timestamp: Date;
}

export interface AdminDeviceStatusPayload {
  deviceId: string;
  status: DeviceStatus;
  timestamp: Date;
}

export interface AdminDeviceHealthPayload {
  deviceId: string;
  health: DeviceHealthMetrics;
  timestamp: Date;
}

export interface AdminScreenshotReceivedPayload {
  deviceId: string;
  screenshotId: number;
  timestamp: Date;
}

export interface AdminErrorPayload {
  deviceId: string;
  error: string;
  timestamp: Date;
}

// Playlist control payloads
export interface PlaylistPausePayload {
  // Empty payload - just pause current state
}

export interface PlaylistResumePayload {
  // Empty payload - resume from current position
}

export interface PlaylistNextPayload {
  respectConstraints?: boolean; // Default true - respect time windows and days
}

export interface PlaylistPreviousPayload {
  respectConstraints?: boolean; // Default true - respect time windows and days
}

export interface PlaylistBroadcastStartPayload {
  type: 'url' | 'message' | 'image' | 'video';
  url?: string;
  message?: string;
  duration?: number; // Duration in milliseconds, 0 = infinite until manual end
  background?: string; // Custom background image (base64 or URL) for MESSAGE type
  logo?: string; // Custom logo image (base64 or URL) for MESSAGE type
  logoPosition?: string; // Logo position: top-left, top-center, top-right, etc.
  mediaData?: string; // Base64-encoded image or video data for IMAGE/VIDEO types
}

export interface PlaylistBroadcastEndPayload {
  // Empty payload - restore to original playlist
}

// Playback state reporting
export interface PlaybackStateUpdatePayload {
  isPlaying: boolean;
  isPaused: boolean;
  isBroadcasting: boolean;
  currentItemId: number | null;
  currentItemIndex: number;
  playlistId: number | null;
  totalItems: number;
  currentUrl: string | null;
  timeRemaining: number | null; // Milliseconds until next rotation, null if static
}

export interface AdminPlaybackStatePayload {
  deviceId: string;
  state: PlaybackStateUpdatePayload;
  timestamp: Date;
}

// WebSocket Authentication
export interface WebSocketAuthPayload {
  token?: string;
  role?: 'device' | 'admin';
}

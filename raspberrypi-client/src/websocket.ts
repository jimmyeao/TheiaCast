  import WebSocket, { RawData } from 'ws';
  import { config } from './config';
  import { logger } from './logger';
  import type {
    ContentUpdatePayload,
    DisplayNavigatePayload,
    ScreenshotRequestPayload,
    ConfigUpdatePayload,
    DeviceRestartPayload,
    DisplayRefreshPayload,
    DeviceStatus,
    RemoteClickPayload,
    RemoteTypePayload,
    RemoteKeyPayload,
    RemoteScrollPayload,
    PlaylistPausePayload,
    PlaylistResumePayload,
    PlaylistNextPayload,
    PlaylistPreviousPayload,
    PlaylistBroadcastStartPayload,
    PlaylistBroadcastEndPayload,
    PlaybackStateUpdatePayload,
  } from '@theiacast/shared';

  // Event and enum values (since we can't import enums from CommonJS shared package)
  const ServerToClientEventValues = {
    CONTENT_UPDATE: 'content:update',
    DISPLAY_NAVIGATE: 'display:navigate',
    SCREENSHOT_REQUEST: 'screenshot:request',
    CONFIG_UPDATE: 'config:update',
    DEVICE_RESTART: 'device:restart',
    DISPLAY_REFRESH: 'display:refresh',
    REMOTE_CLICK: 'remote:click',
    REMOTE_TYPE: 'remote:type',
    REMOTE_KEY: 'remote:key',
    REMOTE_SCROLL: 'remote:scroll',
    STREAM_START: 'stream:start',
    STREAM_STOP: 'stream:stop',
    PLAYLIST_PAUSE: 'playlist:pause',
    PLAYLIST_RESUME: 'playlist:resume',
    PLAYLIST_NEXT: 'playlist:next',
    PLAYLIST_PREVIOUS: 'playlist:previous',
    PLAYLIST_BROADCAST_START: 'playlist:broadcast:start',
    PLAYLIST_BROADCAST_END: 'playlist:broadcast:end',
  } as const;

  const ClientToServerEventValues = {
    DEVICE_REGISTER: 'device:register',
    SCREENSHOT_UPLOAD: 'screenshot:upload',
    HEALTH_REPORT: 'health:report',
    DEVICE_STATUS: 'device:status',
    ERROR_REPORT: 'error:report',
    PLAYBACK_STATE_UPDATE: 'playback:state:update',
  } as const;

  export const DeviceStatusValues = {
    ONLINE: 'online' as DeviceStatus,
    OFFLINE: 'offline' as DeviceStatus,
    ERROR: 'error' as DeviceStatus,
  } as const;

  export type ContentUpdateCallback = (payload: ContentUpdatePayload) => void;
  export type DisplayNavigateCallback = (payload: DisplayNavigatePayload) => void;
  export type ScreenshotRequestCallback = (payload: ScreenshotRequestPayload) => void;
  export type ConfigUpdateCallback = (payload: ConfigUpdatePayload) => void;
  export type DeviceRestartCallback = (payload: DeviceRestartPayload) => void;
  export type DisplayRefreshCallback = (payload: DisplayRefreshPayload) => void;
  export type RemoteClickCallback = (payload: RemoteClickPayload) => void;
  export type RemoteTypeCallback = (payload: RemoteTypePayload) => void;
  export type RemoteKeyCallback = (payload: RemoteKeyPayload) => void;
  export type RemoteScrollCallback = (payload: RemoteScrollPayload) => void;
  export type StreamStartCallback = (payload: any) => void;
  export type StreamStopCallback = (payload: any) => void;
  export type ScreencastStartCallback = () => void;
  export type ScreencastStopCallback = () => void;
  export type PlaylistPauseCallback = (payload: PlaylistPausePayload) => void;
  export type PlaylistResumeCallback = (payload: PlaylistResumePayload) => void;
  export type PlaylistNextCallback = (payload: PlaylistNextPayload) => void;
  export type PlaylistPreviousCallback = (payload: PlaylistPreviousPayload) => void;
  export type PlaylistBroadcastStartCallback = (payload: PlaylistBroadcastStartPayload) => void;
  export type PlaylistBroadcastEndCallback = (payload: PlaylistBroadcastEndPayload) => void;

  class WebSocketClient {
    private socket: WebSocket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 1000000; // Effectively infinite
    private isConnected = false;

    // Event callbacks
    private contentUpdateCallback?: ContentUpdateCallback;
    private displayNavigateCallback?: DisplayNavigateCallback;
    private screenshotRequestCallback?: ScreenshotRequestCallback;
    private configUpdateCallback?: ConfigUpdateCallback;
    private deviceRestartCallback?: DeviceRestartCallback;
    private displayRefreshCallback?: DisplayRefreshCallback;
    private remoteClickCallback?: RemoteClickCallback;
    private remoteTypeCallback?: RemoteTypeCallback;
    private remoteKeyCallback?: RemoteKeyCallback;
    private remoteScrollCallback?: RemoteScrollCallback;
    private streamStartCallback?: StreamStartCallback;
    private streamStopCallback?: StreamStopCallback;
    private screencastStartCallback?: ScreencastStartCallback;
    private screencastStopCallback?: ScreencastStopCallback;
    private playlistPauseCallback?: PlaylistPauseCallback;
    private playlistResumeCallback?: PlaylistResumeCallback;
    private playlistNextCallback?: PlaylistNextCallback;
    private playlistPreviousCallback?: PlaylistPreviousCallback;
    private playlistBroadcastStartCallback?: PlaylistBroadcastStartCallback;
    private playlistBroadcastEndCallback?: PlaylistBroadcastEndCallback;

    constructor() {}

    public connect(): void {
      if (this.socket?.readyState === WebSocket.OPEN) {
        logger.warn('WebSocket already connected');
        return;
      }

      const wsUrl = `${config.serverUrl.replace(/^http/, 'ws')}/ws?role=device&token=${encodeURIComponent(config.deviceToken)}`;
      logger.info(`Connecting to server: ${wsUrl}`);

      this.socket = new WebSocket(wsUrl);
      this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
      if (!this.socket) return;

      this.socket.on('open', () => {
        logger.info('✅ Connected to server');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.registerDevice();
      });

      this.socket.on('close', (code: number, reason: Buffer) => {
        logger.warn(`❌ Disconnected from server: code=${code} reason=${reason.toString()}`);
        this.isConnected = false;
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          // Exponential backoff: 5s, 10s, 20s, capped at 60s
          const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 60000);
          logger.info(`Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})...`);
          setTimeout(() => this.connect(), delay);
        } else {
          logger.error('Max reconnection attempts reached. Stopping...');
        }
      });

      this.socket.on('error', (error: Error) => {
        logger.error(`Connection error: ${String((error as any)?.message || error)}`);
      });

      this.socket.on('message', (data: RawData) => {
        try {
          const msg = JSON.parse(data.toString());
          const evt: string = msg.event;
          const payload = msg.payload;

          switch (evt) {
            case ServerToClientEventValues.CONTENT_UPDATE:
              this.contentUpdateCallback?.(payload as ContentUpdatePayload);
              break;
            case ServerToClientEventValues.DISPLAY_NAVIGATE:
              this.displayNavigateCallback?.(payload as DisplayNavigatePayload);
              break;
            case ServerToClientEventValues.SCREENSHOT_REQUEST:
              this.screenshotRequestCallback?.(payload as ScreenshotRequestPayload);
              break;
            case ServerToClientEventValues.CONFIG_UPDATE:
              this.configUpdateCallback?.(payload as ConfigUpdatePayload);
              break;
            case ServerToClientEventValues.DEVICE_RESTART:
              this.deviceRestartCallback?.(payload as DeviceRestartPayload);
              break;
            case ServerToClientEventValues.DISPLAY_REFRESH:
              this.displayRefreshCallback?.(payload as DisplayRefreshPayload);
              break;
            case ServerToClientEventValues.REMOTE_CLICK:
              this.remoteClickCallback?.(payload as RemoteClickPayload);
              break;
            case ServerToClientEventValues.REMOTE_TYPE:
              this.remoteTypeCallback?.(payload as RemoteTypePayload);
              break;
            case ServerToClientEventValues.REMOTE_KEY:
              this.remoteKeyCallback?.(payload as RemoteKeyPayload);
              break;
            case ServerToClientEventValues.REMOTE_SCROLL:
              this.remoteScrollCallback?.(payload as RemoteScrollPayload);
              break;
            case ServerToClientEventValues.STREAM_START:
              this.streamStartCallback?.(payload);
              break;
            case ServerToClientEventValues.STREAM_STOP:
              this.streamStopCallback?.(payload);
              break;
            case ServerToClientEventValues.PLAYLIST_PAUSE:
              this.playlistPauseCallback?.(payload as PlaylistPausePayload);
              break;
            case ServerToClientEventValues.PLAYLIST_RESUME:
              this.playlistResumeCallback?.(payload as PlaylistResumePayload);
              break;
            case ServerToClientEventValues.PLAYLIST_NEXT:
              this.playlistNextCallback?.(payload as PlaylistNextPayload);
              break;
            case ServerToClientEventValues.PLAYLIST_PREVIOUS:
              this.playlistPreviousCallback?.(payload as PlaylistPreviousPayload);
              break;
            case ServerToClientEventValues.PLAYLIST_BROADCAST_START:
              this.playlistBroadcastStartCallback?.(payload as PlaylistBroadcastStartPayload);
              break;
            case ServerToClientEventValues.PLAYLIST_BROADCAST_END:
              this.playlistBroadcastEndCallback?.(payload as PlaylistBroadcastEndPayload);
              break;
            case 'screencast:start':
              this.screencastStartCallback?.();
              break;
            case 'screencast:stop':
              this.screencastStopCallback?.();
              break;
          }
        } catch (err: any) {
          logger.error('Failed to parse WS message', err?.message || String(err));
        }
      });
    }

    private registerDevice(): void {
      const payload = { token: config.deviceToken };
      this.send(ClientToServerEventValues.DEVICE_REGISTER, payload);
      logger.debug('Device registration sent');
    }

    public disconnect(): void {
      if (this.socket) {
        try { this.socket.close(); } catch {}
        this.socket = null;
        this.isConnected = false;
        logger.info('WebSocket disconnected');
      }
    }

    public getConnectionStatus(): boolean {
      return this.isConnected;
    }

    // Event emitters to server
    public sendHealthReport(health: any): void {
      if (!this.isConnected) {
        logger.warn('Cannot send health report: not connected');
        return;
      }
      const payload = {
        cpu: (health as any).cpu ?? 0,
        mem: (health as any).mem ?? 0,
        disk: (health as any).disk ?? 0,
        ts: new Date().toISOString(),
      };
      this.send(ClientToServerEventValues.HEALTH_REPORT, payload);
      logger.debug('Health report sent', payload);
    }

    public sendDeviceStatus(status: DeviceStatus, message?: string): void {
      if (!this.isConnected && status !== DeviceStatusValues.OFFLINE) {
        logger.warn('Cannot send device status: not connected');
        return;
      }

      const payload = { status, message };
      this.send(ClientToServerEventValues.DEVICE_STATUS, payload);
      logger.debug('Device status sent', payload);
    }

    public sendErrorReport(error: string, stack?: string, context?: any): void {
      if (!this.isConnected) {
        logger.warn('Cannot send error report: not connected');
        return;
      }

      const payload = { error, stack, context };
      this.send(ClientToServerEventValues.ERROR_REPORT, payload);
      logger.error('Error report sent', payload);
    }

    public sendScreenshot(image: string, currentUrl: string): void {
      if (!this.isConnected) {
        logger.warn('Cannot send screenshot: not connected');
        return;
      }

      const payload = { image, currentUrl };
      this.send(ClientToServerEventValues.SCREENSHOT_UPLOAD, payload);
      logger.debug('Screenshot sent');
    }

    public sendScreencastFrame(frameData: { data: string; metadata: any }): void {
      if (!this.isConnected) {
        return; // Silently skip if not connected (too verbose to log every frame)
      }
      this.send('screencast:frame', frameData);
    }

    public sendPlaybackState(state: PlaybackStateUpdatePayload): void {
      if (!this.isConnected) {
        logger.warn('Cannot send playback state: not connected');
        return;
      }

      this.send(ClientToServerEventValues.PLAYBACK_STATE_UPDATE, state);
      logger.debug('Playback state sent', state);
    }

    private send(event: string, payload: any): void {
      if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
        logger.warn(`Cannot send ${event}: not connected`);
        return;
      }
      const msg = JSON.stringify({ event, payload });
      this.socket.send(msg);
    }

    // Event callback setters
    public onContentUpdate(callback: ContentUpdateCallback): void {
      this.contentUpdateCallback = callback;
    }

    public onDisplayNavigate(callback: DisplayNavigateCallback): void {
      this.displayNavigateCallback = callback;
    }

    public onScreenshotRequest(callback: ScreenshotRequestCallback): void {
      this.screenshotRequestCallback = callback;
    }

    public onConfigUpdate(callback: ConfigUpdateCallback): void {
      this.configUpdateCallback = callback;
    }

    public onDeviceRestart(callback: DeviceRestartCallback): void {
      this.deviceRestartCallback = callback;
    }

    public onDisplayRefresh(callback: DisplayRefreshCallback): void {
      this.displayRefreshCallback = callback;
    }

    public onRemoteClick(callback: RemoteClickCallback): void {
      this.remoteClickCallback = callback;
    }

    public onRemoteType(callback: RemoteTypeCallback): void {
      this.remoteTypeCallback = callback;
    }

    public onRemoteKey(callback: RemoteKeyCallback): void {
      this.remoteKeyCallback = callback;
    }

    public onRemoteScroll(callback: RemoteScrollCallback): void {
      this.remoteScrollCallback = callback;
    }

    public onStreamStart(callback: StreamStartCallback): void {
      this.streamStartCallback = callback;
    }

    public onStreamStop(callback: StreamStopCallback): void {
      this.streamStopCallback = callback;
    }

    public onScreencastStart(callback: ScreencastStartCallback): void {
      this.screencastStartCallback = callback;
    }

    public onScreencastStop(callback: ScreencastStopCallback): void {
      this.screencastStopCallback = callback;
    }

    public onPlaylistPause(callback: PlaylistPauseCallback): void {
      this.playlistPauseCallback = callback;
    }

    public onPlaylistResume(callback: PlaylistResumeCallback): void {
      this.playlistResumeCallback = callback;
    }

    public onPlaylistNext(callback: PlaylistNextCallback): void {
      this.playlistNextCallback = callback;
    }

    public onPlaylistPrevious(callback: PlaylistPreviousCallback): void {
      this.playlistPreviousCallback = callback;
    }

    public onPlaylistBroadcastStart(callback: PlaylistBroadcastStartCallback): void {
      this.playlistBroadcastStartCallback = callback;
    }

    public onPlaylistBroadcastEnd(callback: PlaylistBroadcastEndCallback): void {
      this.playlistBroadcastEndCallback = callback;
    }
  }

  export const websocketClient = new WebSocketClient();
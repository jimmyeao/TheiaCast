import type {
  AdminDeviceConnectedPayload,
  AdminDeviceDisconnectedPayload,
  AdminDeviceStatusPayload,
  AdminDeviceHealthPayload,
  AdminScreenshotReceivedPayload,
  AdminErrorPayload,
  PlaybackStateUpdatePayload,
} from '@theiacast/shared';

// Import enum values as constants
const ServerToAdminEventValues = {
  DEVICE_CONNECTED: 'admin:device:connected',
  DEVICE_DISCONNECTED: 'admin:device:disconnected',
  DEVICE_STATUS_CHANGED: 'admin:device:status',
  DEVICE_HEALTH_UPDATE: 'admin:device:health',
  SCREENSHOT_RECEIVED: 'admin:screenshot:received',
  ERROR_OCCURRED: 'admin:error',
} as const;

class WebSocketService {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  // Connection state management
  private connectionState: 'DISCONNECTED' | 'CONNECTING' | 'OPEN' | 'CLOSED' = 'DISCONNECTED';
  private connectionPromise: Promise<void> | null = null;
  private connectionResolve: (() => void) | null = null;
  private connectionReject: ((error: Error) => void) | null = null;

  // Message queue for pre-connection messages
  private messageQueue: Array<{ event: string; payload: any }> = [];
  private maxQueueSize = 100;
  private currentToken: string = '';

  // Callback registries
  private devicesSyncCallbacks: Array<(payload: { deviceIds: string[]; timestamp: Date }) => void> = [];
  private deviceConnectedCallbacks: Array<(payload: AdminDeviceConnectedPayload) => void> = [];
  private deviceDisconnectedCallbacks: Array<(payload: AdminDeviceDisconnectedPayload) => void> = [];
  private deviceStatusCallbacks: Array<(payload: AdminDeviceStatusPayload) => void> = [];
  private deviceHealthCallbacks: Array<(payload: AdminDeviceHealthPayload) => void> = [];
  private screenshotReceivedCallbacks: Array<(payload: AdminScreenshotReceivedPayload) => void> = [];
  private errorCallbacks: Array<(payload: AdminErrorPayload) => void> = [];
  private screencastFrameCallbacks: Array<(payload: any) => void> = [];
  private playbackStateCallbacks: Array<(payload: { deviceId: string; state: PlaybackStateUpdatePayload; timestamp: Date }) => void> = [];

  async connect(token: string): Promise<void> {
    // If already connected, return immediately
    if (this.connectionState === 'OPEN') {
      console.log('WebSocket already connected');
      return Promise.resolve();
    }

    // If connection in progress, return existing promise
    if (this.connectionState === 'CONNECTING' && this.connectionPromise) {
      console.log('WebSocket connection in progress, waiting...');
      return this.connectionPromise;
    }

    this.currentToken = token;
    this.connectionState = 'CONNECTING';

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      this.connectionResolve = resolve;
      this.connectionReject = reject;

      let baseUrl = (import.meta as any).env?.VITE_API_URL || '/api';

      // If baseUrl is relative, prepend origin
      if (baseUrl.startsWith('/')) {
        baseUrl = window.location.origin + baseUrl;
      }

      // Include JWT token for admin authentication
      const wsUrl = baseUrl.replace(/^http/, 'ws') + `/ws?role=admin&token=${encodeURIComponent(token)}`;

      // Timeout after 10 seconds
      const timeout = setTimeout(() => {
        this.connectionState = 'CLOSED';
        this.connectionPromise = null;
        const error = new Error('WebSocket connection timeout');
        if (this.connectionReject) {
          this.connectionReject(error);
        }
      }, 10000);

      try {
        this.socket = new WebSocket(wsUrl);
        this.setupHandlers(token, timeout);
      } catch (error) {
        clearTimeout(timeout);
        this.connectionState = 'CLOSED';
        this.connectionPromise = null;
        if (this.connectionReject) {
          this.connectionReject(error as Error);
        }
      }
    });

    return this.connectionPromise;
  }

  private setupHandlers(token: string, connectionTimeout: number) {
    if (!this.socket) return;

    this.socket.onopen = () => {
      clearTimeout(connectionTimeout);
      this.connectionState = 'OPEN';
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;

      // Resolve connection promise
      if (this.connectionResolve) {
        this.connectionResolve();
        this.connectionPromise = null;
      }

      // Flush queued messages
      this.flushQueue();
    };

    this.socket.onclose = (ev) => {
      this.connectionState = 'CLOSED';
      console.log('❌ WebSocket disconnected:', ev.reason || ev.code);

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => this.connect(token), this.reconnectDelay);
      }
    };

    this.socket.onerror = (err) => {
      clearTimeout(connectionTimeout);
      console.error('WebSocket connection error:', err);

      // Reject connection promise if still pending
      if (this.connectionState === 'CONNECTING' && this.connectionReject) {
        this.connectionState = 'CLOSED';
        this.connectionReject(new Error('WebSocket connection failed'));
        this.connectionPromise = null;
      }
    };

    this.socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        const evt: string = msg.event;
        const payload = msg.payload;

        switch (evt) {
          case 'admin:devices:sync':
            this.devicesSyncCallbacks.forEach((cb) => cb(payload));
            break;
          case ServerToAdminEventValues.DEVICE_CONNECTED:
            this.deviceConnectedCallbacks.forEach((cb) => cb(payload));
            break;
          case ServerToAdminEventValues.DEVICE_DISCONNECTED:
            this.deviceDisconnectedCallbacks.forEach((cb) => cb(payload));
            break;
          case ServerToAdminEventValues.DEVICE_STATUS_CHANGED:
            this.deviceStatusCallbacks.forEach((cb) => cb(payload));
            break;
          case ServerToAdminEventValues.DEVICE_HEALTH_UPDATE:
            this.deviceHealthCallbacks.forEach((cb) => cb(payload));
            break;
          case ServerToAdminEventValues.SCREENSHOT_RECEIVED:
            this.screenshotReceivedCallbacks.forEach((cb) => cb(payload));
            break;
          case ServerToAdminEventValues.ERROR_OCCURRED:
            this.errorCallbacks.forEach((cb) => cb(payload));
            break;
          case 'admin:screencast:frame':
            console.log('[WebSocketService] Received admin:screencast:frame event');
            this.screencastFrameCallbacks.forEach((cb) => cb(payload));
            break;
          case 'admin:playback:state':
            console.log('[WebSocketService] Received playback state:', payload);
            this.playbackStateCallbacks.forEach((cb) => cb(payload));
            break;
        }
      } catch (e) {
        console.error('Failed to parse WS admin message', e);
      }
    };
  }

  disconnect() {
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
      console.log('WebSocket manually disconnected');
    }
  }

  isConnected(): boolean {
    return this.connectionState === 'OPEN' && !!this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  getConnectionState(): string {
    return this.connectionState;
  }

  // Send a message to the server (with automatic queuing)
  send(event: string, payload: any): void {
    // If not connected, queue the message
    if (this.connectionState !== 'OPEN') {
      console.log(`Queuing message (state=${this.connectionState}):`, event);

      // Prevent queue from growing unbounded
      if (this.messageQueue.length >= this.maxQueueSize) {
        const dropped = this.messageQueue.shift();
        console.warn('Message queue full, dropped oldest message:', dropped?.event);
      }

      this.messageQueue.push({ event, payload });

      // Attempt to connect if not already connecting
      if (this.connectionState === 'DISCONNECTED' || this.connectionState === 'CLOSED') {
        console.log('Auto-connecting to send queued message...');
        this.connect(this.currentToken).catch(err => {
          console.error('Failed to auto-connect for queued message:', err);
        });
      }

      return;
    }

    // Send immediately if connected
    if (!this.socket) {
      console.error('Socket is null but state is OPEN - this should not happen');
      return;
    }

    try {
      const message = JSON.stringify({ event, payload });
      this.socket.send(message);
      console.log(`✓ Sent message: ${event}`);
    } catch (error) {
      console.error(`Failed to send message ${event}:`, error);
    }
  }

  // Flush queued messages when connection opens
  private flushQueue(): void {
    if (this.messageQueue.length === 0) {
      return;
    }

    console.log(`Flushing message queue (${this.messageQueue.length} messages)`);

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of queue) {
      try {
        this.send(message.event, message.payload);
      } catch (error) {
        console.error('Failed to flush queued message:', error);
        // Re-queue failed message
        this.messageQueue.push(message);
      }
    }
  }

  // Event listeners for admin events
  onDevicesSync(callback: (payload: { deviceIds: string[]; timestamp: Date }) => void) {
    this.devicesSyncCallbacks.push(callback);
  }

  onDeviceConnected(callback: (payload: AdminDeviceConnectedPayload) => void) {
    this.deviceConnectedCallbacks.push(callback);
  }

  onDeviceDisconnected(callback: (payload: AdminDeviceDisconnectedPayload) => void) {
    this.deviceDisconnectedCallbacks.push(callback);
  }

  onDeviceStatusChanged(callback: (payload: AdminDeviceStatusPayload) => void) {
    this.deviceStatusCallbacks.push(callback);
  }

  onDeviceHealthUpdate(callback: (payload: AdminDeviceHealthPayload) => void) {
    this.deviceHealthCallbacks.push(callback);
  }

  onScreenshotReceived(callback: (payload: AdminScreenshotReceivedPayload) => void) {
    this.screenshotReceivedCallbacks.push(callback);
  }

  onError(callback: (payload: AdminErrorPayload) => void) {
    this.errorCallbacks.push(callback);
  }

  // Remove event listeners
  offDevicesSync(callback: (payload: { deviceIds: string[]; timestamp: Date }) => void) {
    this.devicesSyncCallbacks = this.devicesSyncCallbacks.filter((cb) => cb !== callback);
  }

  offDeviceConnected(callback: (payload: AdminDeviceConnectedPayload) => void) {
    this.deviceConnectedCallbacks = this.deviceConnectedCallbacks.filter((cb) => cb !== callback);
  }

  offDeviceDisconnected(callback: (payload: AdminDeviceDisconnectedPayload) => void) {
    this.deviceDisconnectedCallbacks = this.deviceDisconnectedCallbacks.filter((cb) => cb !== callback);
  }

  offDeviceStatusChanged(callback: (payload: AdminDeviceStatusPayload) => void) {
    this.deviceStatusCallbacks = this.deviceStatusCallbacks.filter((cb) => cb !== callback);
  }

  offDeviceHealthUpdate(callback: (payload: AdminDeviceHealthPayload) => void) {
    this.deviceHealthCallbacks = this.deviceHealthCallbacks.filter((cb) => cb !== callback);
  }

  offScreenshotReceived(callback: (payload: AdminScreenshotReceivedPayload) => void) {
    this.screenshotReceivedCallbacks = this.screenshotReceivedCallbacks.filter((cb) => cb !== callback);
  }

  offError(callback: (payload: AdminErrorPayload) => void) {
    this.errorCallbacks = this.errorCallbacks.filter((cb) => cb !== callback);
  }

  onScreencastFrame(callback: (payload: any) => void) {
    this.screencastFrameCallbacks.push(callback);
  }

  offScreencastFrame(callback: (payload: any) => void) {
    this.screencastFrameCallbacks = this.screencastFrameCallbacks.filter((cb) => cb !== callback);
  }

  onPlaybackStateChanged(callback: (payload: { deviceId: string; state: PlaybackStateUpdatePayload; timestamp: Date }) => void) {
    this.playbackStateCallbacks.push(callback);
  }

  offPlaybackStateChanged(callback: (payload: { deviceId: string; state: PlaybackStateUpdatePayload; timestamp: Date }) => void) {
    this.playbackStateCallbacks = this.playbackStateCallbacks.filter((cb) => cb !== callback);
  }

  // Remove all listeners
  removeAllListeners() {
    this.devicesSyncCallbacks = [];
    this.deviceConnectedCallbacks = [];
    this.deviceDisconnectedCallbacks = [];
    this.deviceStatusCallbacks = [];
    this.deviceHealthCallbacks = [];
    this.screenshotReceivedCallbacks = [];
    this.errorCallbacks = [];
    this.screencastFrameCallbacks = [];
    this.playbackStateCallbacks = [];
  }
}

export const websocketService = new WebSocketService();

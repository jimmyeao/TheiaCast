import { create } from 'zustand';
import { websocketService } from '../services/websocket.service';
import { logService } from '../services/log.service';
import type {
  AdminDeviceConnectedPayload,
  AdminDeviceDisconnectedPayload,
  AdminDeviceStatusPayload,
  AdminErrorPayload,
  PlaybackStateUpdatePayload,
} from '@theiacast/shared';

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
}

interface WebSocketState {
  isConnected: boolean;
  connectedDevices: Set<string>;
  notifications: Notification[];
  deviceStatus: Map<string, string>;
  devicePlaybackState: Map<string, PlaybackStateUpdatePayload>;

  connect: (token: string) => void;
  disconnect: () => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  isConnected: false,
  connectedDevices: new Set(),
  notifications: [],
  deviceStatus: new Map(),
  devicePlaybackState: new Map(),

  connect: (token: string) => {
    websocketService.connect(token);

    // Initial sync of connected devices
    websocketService.onDevicesSync((payload) => {
      console.log('Received devices sync:', payload.deviceIds);

      set({
        connectedDevices: new Set(payload.deviceIds),
      });
    });

    // Device connected event
    websocketService.onDeviceConnected((payload: AdminDeviceConnectedPayload) => {
      console.log('Device connected:', payload.deviceId);

      set((state) => {
        const newDevices = new Set(state.connectedDevices);
        newDevices.add(payload.deviceId);
        const newStatus = new Map(state.deviceStatus);
        newStatus.set(payload.deviceId, 'online');
        return { connectedDevices: newDevices, deviceStatus: newStatus };
      });
    });

    // Device disconnected event
    websocketService.onDeviceDisconnected((payload: AdminDeviceDisconnectedPayload) => {
      console.log('Device disconnected:', payload.deviceId);

      set((state) => {
        const newDevices = new Set(state.connectedDevices);
        newDevices.delete(payload.deviceId);
        const newStatus = new Map(state.deviceStatus);
        newStatus.set(payload.deviceId, 'offline');
        return { connectedDevices: newDevices, deviceStatus: newStatus };
      });
    });

    // Device status changed event
    websocketService.onDeviceStatusChanged((payload: AdminDeviceStatusPayload) => {
      console.log('Device status changed:', payload.deviceId, payload.status);

      set((state) => {
        const newStatus = new Map(state.deviceStatus);
        newStatus.set(payload.deviceId, payload.status);
        return { deviceStatus: newStatus };
      });
    });

    // Error event
    websocketService.onError((payload: AdminErrorPayload) => {
      console.error('Device error:', payload.deviceId, payload.error);

      // Filter out screenshot and remote type errors (noise - we have live streaming now)
      const isNoiseError =
        payload.error?.toLowerCase().includes('screenshot') ||
        payload.error?.toLowerCase().includes('remote type failed') ||
        payload.error?.toLowerCase().includes('no text input focused');

      if (!isNoiseError) {
        // Log error to backend instead of showing UI toast
        logService.log({
          level: 'Error',
          message: payload.error || 'Unknown error',
          deviceId: payload.deviceId,
          source: 'DeviceError',
        }).catch(err => {
          console.error('Failed to log device error to backend:', err);
        });
      }
    });

    // Playback state changed event
    websocketService.onPlaybackStateChanged((payload) => {
      console.log('Playback state changed:', payload.deviceId, payload.state);

      set((state) => {
        const newPlaybackState = new Map(state.devicePlaybackState);
        newPlaybackState.set(payload.deviceId, payload.state);
        return { devicePlaybackState: newPlaybackState };
      });
    });

    set({ isConnected: true });
  },

  disconnect: () => {
    websocketService.removeAllListeners();
    websocketService.disconnect();
    set({
      isConnected: false,
      connectedDevices: new Set(),
      deviceStatus: new Map(),
      devicePlaybackState: new Map(),
    });
  },

  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
    };

    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 50), // Keep last 50
    }));

    // Auto-remove after 5 seconds
    setTimeout(() => {
      get().removeNotification(newNotification.id);
    }, 5000);
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearNotifications: () => {
    set({ notifications: [] });
  },
}));

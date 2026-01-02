import api from './api';
import type { Device, CreateDeviceDto, UpdateDeviceDto } from '@theiacast/shared';

export const deviceService = {
  async getAll(): Promise<Device[]> {
    const response = await api.get<Device[]>('/devices');
    return response.data;
  },

  async getById(id: number): Promise<Device> {
    const response = await api.get<Device>(`/devices/${id}`);
    return response.data;
  },

  async create(data: CreateDeviceDto): Promise<Device> {
    const response = await api.post<Device>('/devices', data);
    return response.data;
  },

  async update(id: number, data: UpdateDeviceDto): Promise<Device> {
    const response = await api.patch<Device>(`/devices/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/devices/${id}`);
  },

  async getLogs(id: number, limit?: number): Promise<any[]> {
    const response = await api.get(`/devices/${id}/logs`, {
      params: { limit },
    });
    return response.data;
  },

  async getToken(id: number): Promise<{ id: number; deviceId: string; name: string; token: string }>{
    const response = await api.get(`/devices/${id}/token`);
    return response.data;
  },

  async rotateToken(id: number): Promise<{ id: number; deviceId: string; name: string; token: string }>{
    const response = await api.post(`/devices/${id}/token/rotate`);
    return response.data;
  },

  // Remote control methods
  async remoteClick(deviceId: string, x: number, y: number, button?: string): Promise<void> {
    await api.post(`/devices/${deviceId}/remote/click`, { x, y, button });
  },

  async remoteType(deviceId: string, text: string, selector?: string): Promise<void> {
    await api.post(`/devices/${deviceId}/remote/type`, { text, selector });
  },

  async remoteKey(deviceId: string, key: string, modifiers?: string[]): Promise<void> {
    await api.post(`/devices/${deviceId}/remote/key`, { key, modifiers });
  },

  async remoteScroll(deviceId: string, x?: number, y?: number, deltaX?: number, deltaY?: number): Promise<void> {
    await api.post(`/devices/${deviceId}/remote/scroll`, { x, y, deltaX, deltaY });
  },

  // Screencast control methods
  async startScreencast(deviceId: string): Promise<void> {
    await api.post(`/devices/${deviceId}/screencast/start`);
  },

  async stopScreencast(deviceId: string): Promise<void> {
    await api.post(`/devices/${deviceId}/screencast/stop`);
  },

  // Device control methods
  async restart(deviceId: string): Promise<void> {
    await api.post(`/devices/${deviceId}/restart`);
  },

  // Playlist control methods
  async playlistPause(deviceId: string): Promise<void> {
    await api.post(`/devices/${deviceId}/playlist/pause`);
  },

  async playlistResume(deviceId: string): Promise<void> {
    await api.post(`/devices/${deviceId}/playlist/resume`);
  },

  async playlistNext(deviceId: string, respectConstraints: boolean = true): Promise<void> {
    await api.post(`/devices/${deviceId}/playlist/next?respectConstraints=${respectConstraints}`);
  },

  async playlistPrevious(deviceId: string, respectConstraints: boolean = true): Promise<void> {
    await api.post(`/devices/${deviceId}/playlist/previous?respectConstraints=${respectConstraints}`);
  },

  // Broadcast methods
  async broadcastStart(deviceIds: string[], url: string, duration?: number): Promise<void> {
    await api.post('/broadcast/start', { deviceIds, url, duration });
  },

  async broadcastEnd(): Promise<void> {
    await api.post('/broadcast/end');
  },

  async getBroadcastStatus(): Promise<{ broadcasts: any[]; count: number }> {
    const response = await api.get('/broadcast/status');
    return response.data;
  },
};

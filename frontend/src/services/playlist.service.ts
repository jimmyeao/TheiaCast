import api from './api';
import type {
  Playlist,
  CreatePlaylistDto,
  UpdatePlaylistDto,
  PlaylistItem,
  CreatePlaylistItemDto,
  UpdatePlaylistItemDto,
  DevicePlaylistAssignment,
} from '@theiacast/shared';

export const playlistService = {
  // Playlist operations
  async getAll(): Promise<Playlist[]> {
    const response = await api.get<any[]>('/playlists');
    return response.data.map((p) => ({
      ...p,
      items: (p.items || []).map((r: any) => ({
        id: r.id,
        playlistId: r.playlistId,
        contentId: r.contentId,
        displayDuration: r.displayDuration ?? 0, // Backend now returns displayDuration in ms
        orderIndex: r.orderIndex ?? 0,
        timeWindowStart: r.timeWindowStart ?? undefined,
        timeWindowEnd: r.timeWindowEnd ?? undefined,
        daysOfWeek: r.daysOfWeek ?? undefined,
        content: r.content ?? undefined,
      })),
    }));
  },

  async getById(id: number): Promise<Playlist> {
    const response = await api.get<any>(`/playlists/${id}`);
    const p = response.data;
    return {
      ...p,
      items: (p.items || []).map((r: any) => ({
        id: r.id,
        playlistId: r.playlistId,
        contentId: r.contentId,
        displayDuration: r.displayDuration ?? 0, // Backend now returns displayDuration in ms
        orderIndex: r.orderIndex ?? 0,
        timeWindowStart: r.timeWindowStart ?? undefined,
        timeWindowEnd: r.timeWindowEnd ?? undefined,
        daysOfWeek: r.daysOfWeek ?? undefined,
        content: r.content ?? undefined,
      })),
    } as Playlist;
  },

  async create(data: CreatePlaylistDto): Promise<Playlist> {
    const response = await api.post<Playlist>('/playlists', data);
    return response.data;
  },

  async update(id: number, data: UpdatePlaylistDto): Promise<Playlist> {
    const response = await api.patch<Playlist>(`/playlists/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/playlists/${id}`);
  },

  // Playlist item operations
  async createItem(data: CreatePlaylistItemDto): Promise<PlaylistItem> {
    const response = await api.post<any>('/playlists/items', data);
    const r = response.data;
    return {
      id: r.id,
      playlistId: r.playlistId,
      contentId: r.contentId,
      displayDuration: r.displayDuration ?? 0, // Backend now returns displayDuration in ms
      orderIndex: r.orderIndex ?? 0,
      content: r.content ?? undefined,
    } as PlaylistItem;
  },

  async getPlaylistItems(playlistId: number): Promise<PlaylistItem[]> {
    const response = await api.get<any[]>(`/playlists/${playlistId}/items`);
    return response.data.map((r) => ({
      id: r.id,
      playlistId: r.playlistId,
      contentId: r.contentId,
      displayDuration: r.displayDuration ?? 0, // Backend now returns displayDuration in ms
      orderIndex: r.orderIndex ?? 0,
      timeWindowStart: r.timeWindowStart ?? undefined,
      timeWindowEnd: r.timeWindowEnd ?? undefined,
      daysOfWeek: r.daysOfWeek ?? undefined,
      content: r.content ?? undefined,
    } as PlaylistItem));
  },

  async updateItem(id: number, data: UpdatePlaylistItemDto): Promise<PlaylistItem> {
    const response = await api.patch<any>(`/playlists/items/${id}`, data);
    const r = response.data;
    return {
      id: r.id,
      playlistId: r.playlistId,
      contentId: r.contentId,
      displayDuration: r.displayDuration ?? 0, // Backend now returns displayDuration in ms
      orderIndex: r.orderIndex ?? 0,
      content: r.content ?? undefined,
    } as PlaylistItem;
  },

  async deleteItem(id: number): Promise<void> {
    await api.delete(`/playlists/items/${id}`);
  },

  // Device playlist assignment operations
  async assignToDevice(deviceId: number, playlistId: number): Promise<DevicePlaylistAssignment> {
    const response = await api.post<DevicePlaylistAssignment>('/playlists/assign', {
      deviceId,
      playlistId,
    });
    return response.data;
  },

  async getDevicePlaylists(deviceId: number): Promise<Playlist[]> {
    const response = await api.get<Playlist[]>(`/playlists/device/${deviceId}`);
    return response.data;
  },

  async getPlaylistDevices(playlistId: number): Promise<DevicePlaylistAssignment[]> {
    const response = await api.get<DevicePlaylistAssignment[]>(`/playlists/${playlistId}/devices`);
    return response.data;
  },

  async unassignFromDevice(deviceId: number, playlistId: number): Promise<void> {
    await api.delete(`/playlists/assign/device/${deviceId}/playlist/${playlistId}`);
  },
};

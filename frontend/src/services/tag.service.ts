import api from './api';
import type { Tag, CreateTagDto, UpdateTagDto } from '@theiacast/shared';

export const tagService = {
  async getAll(): Promise<Tag[]> {
    const response = await api.get<Tag[]>('/tags');
    return response.data;
  },

  async getById(id: number): Promise<Tag> {
    const response = await api.get<Tag>(`/tags/${id}`);
    return response.data;
  },

  async create(data: CreateTagDto): Promise<Tag> {
    const response = await api.post<Tag>('/tags', data);
    return response.data;
  },

  async update(id: number, data: UpdateTagDto): Promise<Tag> {
    const response = await api.patch<Tag>(`/tags/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/tags/${id}`);
  },

  // Device-tag association methods
  async assignToDevice(deviceId: number, tagId: number): Promise<void> {
    await api.post(`/devices/${deviceId}/tags/${tagId}`);
  },

  async removeFromDevice(deviceId: number, tagId: number): Promise<void> {
    await api.delete(`/devices/${deviceId}/tags/${tagId}`);
  },

  async getDeviceTags(deviceId: number): Promise<Tag[]> {
    const response = await api.get<Tag[]>(`/devices/${deviceId}/tags`);
    return response.data;
  },
};

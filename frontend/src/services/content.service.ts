import api from './api';
import type { Content, CreateContentDto, UpdateContentDto } from '@theiacast/shared';

export const contentService = {
  async getAll(): Promise<Content[]> {
    const response = await api.get<Content[]>('/content');
    return response.data;
  },

  async getById(id: number): Promise<Content> {
    const response = await api.get<Content>(`/content/${id}`);
    return response.data;
  },

  async create(data: CreateContentDto): Promise<Content> {
    const response = await api.post<Content>('/content', data);
    return response.data;
  },

  async update(id: number, data: UpdateContentDto): Promise<Content> {
    const response = await api.patch<Content>(`/content/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/content/${id}`);
  },

  async uploadPptx(file: File, name: string, durationPerSlide: number): Promise<Content> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('durationPerSlide', durationPerSlide.toString());

    const response = await api.post<Content>('/content/upload/pptx', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 600000, // 10 minute timeout for large file uploads
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return response.data;
  },

  async uploadVideo(file: File, name: string): Promise<Content> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);

    const response = await api.post<Content>('/content/upload/video', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 600000, // 10 minute timeout for large video uploads
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return response.data;
  },

  async uploadImage(file: File, name: string): Promise<Content> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);

    const response = await api.post<Content>('/content/upload/image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 300000, // 5 minute timeout for large image uploads
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return response.data;
  },

  async clearThumbnails(): Promise<{ cleared: number }> {
    const response = await api.post<{ cleared: number }>('/content/thumbnails/clear');
    return response.data;
  },

  async rebuildThumbnails(): Promise<{ total: number; rebuilt: number; failed: number }> {
    const response = await api.post<{ total: number; rebuilt: number; failed: number }>('/content/thumbnails/rebuild', {}, {
      timeout: 600000, // 10 minute timeout for rebuilding all thumbnails
    });
    return response.data;
  },

  async getStorageStats(): Promise<{
    totalSpace: number;
    freeSpace: number;
    usedSpace: number;
    contentUsed: number;
    videoSize: number;
    imageSize: number;
    slideshowSize: number;
    percentUsed: number;
  }> {
    const response = await api.get('/storage/stats');
    return response.data;
  },
};


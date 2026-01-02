import api from './api';
import type { Tag } from '@theiacast/shared';

export const playlistTagService = {
  async assignToPlaylist(playlistId: number, tagId: number): Promise<void> {
    await api.post(`/playlists/${playlistId}/tags/${tagId}`);
  },

  async removeFromPlaylist(playlistId: number, tagId: number): Promise<void> {
    await api.delete(`/playlists/${playlistId}/tags/${tagId}`);
  },

  async getPlaylistTags(playlistId: number): Promise<Tag[]> {
    const response = await api.get<Tag[]>(`/playlists/${playlistId}/tags`);
    return response.data;
  },
};

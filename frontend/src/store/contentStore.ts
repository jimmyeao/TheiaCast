import { create } from 'zustand';
import type { Content } from '@theiacast/shared';
import { contentService } from '../services/content.service';
import { logService } from '../services/log.service';

interface ContentState {
  content: Content[];
  selectedContent: Content | null;
  isLoading: boolean;

  fetchContent: () => Promise<void>;
  fetchContentById: (id: number) => Promise<void>;
  createContent: (data: any) => Promise<void>;
  updateContent: (id: number, data: any) => Promise<void>;
  deleteContent: (id: number) => Promise<void>;
  uploadPptx: (file: File, name: string, durationPerSlide: number) => Promise<void>;
  uploadVideo: (file: File, name: string) => Promise<void>;
  uploadImage: (file: File, name: string) => Promise<void>;
  clearThumbnails: () => Promise<number>;
  rebuildThumbnails: () => Promise<{ total: number; rebuilt: number; failed: number }>;
  setSelectedContent: (content: Content | null) => void;
}

export const useContentStore = create<ContentState>((set) => ({
  content: [],
  selectedContent: null,
  isLoading: false,

  fetchContent: async () => {
    set({ isLoading: true });
    try {
      const content = await contentService.getAll();
      set({ content, isLoading: false });
    } catch (error: any) {
      await logService.logError('Failed to fetch content', 'ContentStore', error);
      set({ isLoading: false });
    }
  },

  fetchContentById: async (id: number) => {
    set({ isLoading: true });
    try {
      const content = await contentService.getById(id);
      set({ selectedContent: content, isLoading: false });
    } catch (error: any) {
      await logService.logError(`Failed to fetch content ${id}`, 'ContentStore', error);
      set({ isLoading: false });
    }
  },

  createContent: async (data) => {
    set({ isLoading: true });
    try {
      await contentService.create(data);
      set({ isLoading: false });
    } catch (error: any) {
      await logService.logError('Failed to create content', 'ContentStore', error);
      set({ isLoading: false });
      throw error;
    }
  },

  updateContent: async (id, data) => {
    set({ isLoading: true });
    try {
      await contentService.update(id, data);
      set({ isLoading: false });
    } catch (error: any) {
      await logService.logError(`Failed to update content ${id}`, 'ContentStore', error);
      set({ isLoading: false });
      throw error;
    }
  },

  deleteContent: async (id) => {
    set({ isLoading: true });
    try {
      await contentService.delete(id);
      set((state) => ({
        content: state.content.filter((c) => c.id !== id),
        isLoading: false,
      }));
    } catch (error: any) {
      await logService.logError(`Failed to delete content ${id}`, 'ContentStore', error);
      set({ isLoading: false });
      throw error;
    }
  },

  uploadPptx: async (file, name, durationPerSlide) => {
    set({ isLoading: true });
    try {
      await contentService.uploadPptx(file, name, durationPerSlide);
      const content = await contentService.getAll();
      set({ content, isLoading: false });
    } catch (error: any) {
      await logService.logError('Failed to upload PPTX', 'ContentStore', error);
      set({ isLoading: false });
      throw error;
    }
  },

  uploadVideo: async (file, name) => {
    set({ isLoading: true });
    try {
      await contentService.uploadVideo(file, name);
      const content = await contentService.getAll();
      set({ content, isLoading: false });
    } catch (error: any) {
      await logService.logError('Failed to upload Video', 'ContentStore', error);
      set({ isLoading: false });
      throw error;
    }
  },

  uploadImage: async (file, name) => {
    set({ isLoading: true });
    try {
      await contentService.uploadImage(file, name);
      const content = await contentService.getAll();
      set({ content, isLoading: false });
    } catch (error: any) {
      await logService.logError('Failed to upload Image', 'ContentStore', error);
      set({ isLoading: false });
      throw error;
    }
  },

  clearThumbnails: async () => {
    set({ isLoading: true });
    try {
      const result = await contentService.clearThumbnails();
      const content = await contentService.getAll();
      set({ content, isLoading: false });
      return result.cleared;
    } catch (error: any) {
      await logService.logError('Failed to clear thumbnails', 'ContentStore', error);
      set({ isLoading: false });
      throw error;
    }
  },

  rebuildThumbnails: async () => {
    set({ isLoading: true });
    try {
      const result = await contentService.rebuildThumbnails();
      const content = await contentService.getAll();
      set({ content, isLoading: false });
      return result;
    } catch (error: any) {
      await logService.logError('Failed to rebuild thumbnails', 'ContentStore', error);
      set({ isLoading: false });
      throw error;
    }
  },

  setSelectedContent: (content) => set({ selectedContent: content }),
}));

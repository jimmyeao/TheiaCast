import type { Tag } from './device.types';

export interface Playlist {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  items?: PlaylistItem[];
  devicePlaylists?: DevicePlaylistAssignment[];
  tags?: Tag[];
}

export interface PlaylistItem {
  id: number;
  playlistId: number;
  contentId: number;
  displayDuration: number; // milliseconds (frontend uses ms; backend field is seconds)
  orderIndex: number;
  timeWindowStart?: string; // HH:MM format
  timeWindowEnd?: string; // HH:MM format
  daysOfWeek?: string; // JSON string of number array from database, or number[] when creating
  content?: {
    id: number;
    name: string;
    url: string;
    requiresInteraction: boolean;
  };
}

export interface CreatePlaylistDto {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdatePlaylistDto {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface CreatePlaylistItemDto {
  playlistId: number;
  contentId: number;
  displayDuration: number;
  orderIndex: number;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  daysOfWeek?: number[];
}

export interface UpdatePlaylistItemDto {
  displayDuration?: number;
  orderIndex?: number;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  daysOfWeek?: number[];
}

export interface DevicePlaylistAssignment {
  id: number;
  deviceId: number;
  playlistId: number;
  assignedAt: Date;
}

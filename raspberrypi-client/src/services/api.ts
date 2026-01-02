import { config } from '../config';
import type { components, paths } from './api-types';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: Json): Promise<T> {
  const url = new URL(path, config.serverUrl);
  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

// Devices
export async function getDevices(): Promise<unknown[]> {
  type R = paths['/devices']['get']['responses'][200]['content']['application/json'];
  return await request<R>('GET', '/devices');
}

export async function createDevice(dto: components['schemas']['CreateDeviceDto']): Promise<unknown> {
  type R = paths['/devices']['post']['responses'][200]['content']['application/json'];
  return await request<R>('POST', '/devices', dto);
}

// Playlists
export async function getPlaylists(): Promise<unknown[]> {
  type R = paths['/playlists']['get']['responses'][200]['content']['application/json'];
  return await request<R>('GET', '/playlists');
}

export async function createPlaylist(dto: components['schemas']['CreatePlaylistDto']): Promise<unknown> {
  type R = paths['/playlists']['post']['responses'][200]['content']['application/json'];
  return await request<R>('POST', '/playlists', dto);
}

export async function getPlaylistItems(playlistId: number): Promise<unknown[]> {
  type R = paths['/playlists/{playlistId}/items']['get']['responses'][200]['content']['application/json'];
  return await request<R>('GET', `/playlists/${playlistId}/items`);
}

export async function createPlaylistItem(dto: components['schemas']['CreatePlaylistItemDto']): Promise<unknown> {
  type R = paths['/playlists/items']['post']['responses'][200]['content']['application/json'];
  return await request<R>('POST', '/playlists/items', dto);
}

// Content
export async function getContent(): Promise<unknown[]> {
  type R = paths['/content']['get']['responses'][200]['content']['application/json'];
  return await request<R>('GET', '/content');
}

export async function createContent(dto: components['schemas']['CreateContentDto']): Promise<unknown> {
  type R = paths['/content']['post']['responses'][200]['content']['application/json'];
  return await request<R>('POST', '/content', dto);
}

// Screenshots
export async function getLatestScreenshot(deviceId: string): Promise<unknown | null> {
  type R = paths['/screenshots/device/{deviceId}/latest']['get']['responses'][200]['content']['application/json'];
  return await request<R>('GET', `/screenshots/device/${deviceId}/latest`);
}

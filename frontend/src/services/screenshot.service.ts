import api from './api';
import type { Screenshot } from '@theiacast/shared';

export const screenshotService = {
  /**
   * Request a new screenshot from a device (triggers backend to request via WebSocket)
   */
  async request(deviceId: string): Promise<void> {
    // For now, this is a placeholder - the backend will need an endpoint to trigger screenshot requests
    // Devices automatically send screenshots every 30 seconds, so this just ensures we have the latest
    console.log(`Screenshot request for device ${deviceId} (auto-capture every 30s)`);
  },

  /**
   * Get the latest screenshot for a device
   */
  async getLatestByDevice(deviceId: string): Promise<Screenshot | null> {
    const response = await api.get<Screenshot | null>(
      `/screenshots/device/${deviceId}/latest`
    );
    return response.data;
  },

  /**
   * Get all screenshots for a device (limited to last 10)
   */
  async getDeviceScreenshots(deviceId: string, limit: number = 10): Promise<Screenshot[]> {
    const response = await api.get<Screenshot[]>(
      `/screenshots/device/${deviceId}`,
      { params: { limit } }
    );
    return response.data;
  },

  /**
   * Get a specific screenshot by ID
   */
  async getScreenshotById(id: number): Promise<Screenshot> {
    const response = await api.get<Screenshot>(`/screenshots/${id}`);
    return response.data;
  },
};

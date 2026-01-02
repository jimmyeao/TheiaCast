import { create } from 'zustand';
import type { Device } from '@theiacast/shared';
import { deviceService } from '../services/device.service';
import { logService } from '../services/log.service';

interface DeviceState {
  devices: Device[];
  selectedDevice: Device | null;
  isLoading: boolean;

  fetchDevices: () => Promise<void>;
  fetchDevice: (id: number) => Promise<void>;
  createDevice: (data: any) => Promise<Device & { token?: string }>;
  updateDevice: (id: number, data: any) => Promise<void>;
  deleteDevice: (id: number) => Promise<void>;
  getDeviceToken: (id: number) => Promise<string>;
  rotateDeviceToken: (id: number) => Promise<string>;
  setSelectedDevice: (device: Device | null) => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  devices: [],
  selectedDevice: null,
  isLoading: false,

  fetchDevices: async () => {
    set({ isLoading: true });
    try {
      const devices = await deviceService.getAll();
      set({ devices, isLoading: false });
    } catch (error: any) {
      await logService.logError('Failed to fetch devices', 'DeviceStore', error);
      set({ isLoading: false });
    }
  },

  fetchDevice: async (id: number) => {
    set({ isLoading: true });
    try {
      const device = await deviceService.getById(id);
      set({ selectedDevice: device, isLoading: false });
    } catch (error: any) {
      await logService.logError(`Failed to fetch device ${id}`, 'DeviceStore', error);
      set({ isLoading: false });
    }
  },

  createDevice: async (data) => {
    set({ isLoading: true });
    try {
      const device = await deviceService.create(data);
      set({ isLoading: false });
      return device;
    } catch (error: any) {
      await logService.logError('Failed to create device', 'DeviceStore', error);
      set({ isLoading: false });
      throw error;
    }
  },

  updateDevice: async (id, data) => {
    set({ isLoading: true });
    try {
      await deviceService.update(id, data);
      set({ isLoading: false });
    } catch (error: any) {
      await logService.logError(`Failed to update device ${id}`, 'DeviceStore', error);
      set({ isLoading: false });
      throw error;
    }
  },

  deleteDevice: async (id) => {
    set({ isLoading: true });
    try {
      await deviceService.delete(id);
      set((state) => ({
        devices: state.devices.filter((d) => d.id !== id),
        isLoading: false,
      }));
    } catch (error: any) {
      await logService.logError(`Failed to delete device ${id}`, 'DeviceStore', error);
      set({ isLoading: false });
      throw error;
    }
  },

  getDeviceToken: async (id: number) => {
    set({ isLoading: true });
    try {
      const res = await deviceService.getToken(id);
      set({ isLoading: false });
      return res.token;
    } catch (error: any) {
      await logService.logError(`Failed to fetch device token for ${id}`, 'DeviceStore', error);
      set({ isLoading: false });
      throw error;
    }
  },

  rotateDeviceToken: async (id: number) => {
    set({ isLoading: true });
    try {
      const res = await deviceService.rotateToken(id);
      set({ isLoading: false });
      return res.token;
    } catch (error: any) {
      await logService.logError(`Failed to rotate device token for ${id}`, 'DeviceStore', error);
      set({ isLoading: false });
      throw error;
    }
  },

  setSelectedDevice: (device) => set({ selectedDevice: device }),
}));

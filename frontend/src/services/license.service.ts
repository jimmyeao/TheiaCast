import axios from 'axios';
import type {
  License,
  LicenseStatus,
  ActivateLicenseDto,
  UpdateLicenseDto,
  InstallationKeyResponse,
  DecodedLicenseResponse,
} from '@theiacast/shared';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const getAuthToken = () => localStorage.getItem('accessToken');

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const licenseService = {
  async getStatus(): Promise<LicenseStatus> {
    const response = await api.get<LicenseStatus>('/license/status');
    return response.data;
  },

  async getAll(): Promise<License[]> {
    const response = await api.get<License[]>('/licenses');
    return response.data;
  },

  async getById(id: number): Promise<License> {
    const response = await api.get<License>(`/licenses/${id}`);
    return response.data;
  },

  async getInstallationKey(): Promise<InstallationKeyResponse> {
    const response = await api.get<InstallationKeyResponse>('/license/installation-key');
    return response.data;
  },

  async update(id: number, data: UpdateLicenseDto): Promise<void> {
    await api.patch(`/licenses/${id}`, data);
  },

  async activate(deviceId: number, data: ActivateLicenseDto): Promise<any> {
    const response = await api.post(`/devices/${deviceId}/activate-license`, data);
    return response.data;
  },

  async revoke(id: number): Promise<void> {
    await api.delete(`/licenses/${id}`);
  },

  async activateGlobal(licenseKey: string): Promise<any> {
    const response = await api.post('/license/activate', { licenseKey });
    return response.data;
  },

  async getDecoded(): Promise<DecodedLicenseResponse> {
    const response = await api.get<DecodedLicenseResponse>('/license/decoded');
    return response.data;
  },
};

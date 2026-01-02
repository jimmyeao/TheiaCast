import api from './api';
import type { AuthResponse, LoginDto, RegisterDto, User, ChangePasswordDto, MfaSetupResponse } from '@theiacast/shared';

export const authService = {
  async login(credentials: LoginDto): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  async changePassword(data: ChangePasswordDto): Promise<void> {
    await api.post('/auth/change-password', data);
  },

  async setupMfa(): Promise<MfaSetupResponse> {
    const response = await api.post<MfaSetupResponse>('/auth/mfa/setup');
    return response.data;
  },

  async enableMfa(code: string): Promise<void> {
    await api.post('/auth/mfa/enable', JSON.stringify(code), {
      headers: { 'Content-Type': 'application/json' }
    });
  },

  async disableMfa(): Promise<void> {
    await api.post('/auth/mfa/disable');
  },

  async register(data: RegisterDto): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/register', data);
    return response.data;
  },

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/refresh', {
      refreshToken,
    });
    return response.data;
  },

  async getCurrentUser(): Promise<User> {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },

  logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  },
};

import { create } from 'zustand';
import type { User, LoginDto } from '@theiacast/shared';
import { authService } from '../services/auth.service';
import { useWebSocketStore } from './websocketStore';
import { logService } from '../services/log.service';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (credentials: LoginDto) => Promise<void>;
  logout: () => void;
  initialize: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login(credentials);

      // Persist tokens first
      localStorage.setItem('accessToken', response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);

      // Fetch current user using the access token
      const user = await authService.getCurrentUser();
      localStorage.setItem('user', JSON.stringify(user));

      set({
        user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        isAuthenticated: true,
        isLoading: false,
      });

      // Connect WebSocket after successful login
      useWebSocketStore.getState().connect(response.accessToken);
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || 'Login failed';
      await logService.logError(`Login failed for user: ${credentials.username}`, 'AuthStore', error);
      set({
        error: errorMsg,
        isLoading: false,
      });
      throw error;
    }
  },

  logout: () => {
    // Disconnect WebSocket before logout
    useWebSocketStore.getState().disconnect();

    authService.logout();
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },

  initialize: async () => {
    const token = localStorage.getItem('accessToken');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({
          user,
          accessToken: token,
          refreshToken: localStorage.getItem('refreshToken'),
          isAuthenticated: true,
        });

        // Reconnect WebSocket on app initialization
        useWebSocketStore.getState().connect(token);
      } catch (error) {
        await logService.logError('Failed to initialize auth from stored credentials', 'AuthStore', error);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
      }
    }
  },

  clearError: () => set({ error: null }),
}));

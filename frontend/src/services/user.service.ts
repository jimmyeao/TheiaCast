import axios from 'axios';
import type { CreateUserDto, UpdateUserDto, UserListDto } from '@theiacast/shared';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const getAuthToken = () => localStorage.getItem('accessToken');

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const userService = {
  async getAll(): Promise<UserListDto[]> {
    const response = await api.get<UserListDto[]>('/users');
    return response.data;
  },

  async getById(id: number): Promise<UserListDto> {
    const response = await api.get<UserListDto>(`/users/${id}`);
    return response.data;
  },

  async create(data: CreateUserDto): Promise<UserListDto> {
    const response = await api.post<UserListDto>('/users', data);
    return response.data;
  },

  async update(id: number, data: UpdateUserDto): Promise<UserListDto> {
    const response = await api.patch<UserListDto>(`/users/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/users/${id}`);
  },
};

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token and tenant header
api.interceptors.request.use((config) => {
  // Get auth state from localStorage
  const authState = localStorage.getItem('dentacrm-auth');
  if (authState) {
    try {
      const { state } = JSON.parse(authState);
      if (state.token) {
        config.headers.Authorization = `Bearer ${state.token}`;
      }
      if (state.tenantId) {
        config.headers['X-Tenant-ID'] = state.tenantId;
      }
    } catch {
      // Invalid auth state
    }
  }
  return config;
});

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Handle 401 - redirect to login
      if (error.response.status === 401) {
        localStorage.removeItem('dentacrm-auth');
        window.location.href = '/login';
        return Promise.reject(new Error('Session expired'));
      }

      // Extract error message
      const message = error.response.data?.error || error.response.data?.message || 'An error occurred';
      return Promise.reject(new Error(message));
    }

    if (error.request) {
      return Promise.reject(new Error('Network error - please check your connection'));
    }

    return Promise.reject(error);
  }
);

export default api;

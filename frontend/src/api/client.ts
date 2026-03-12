import axios, { AxiosError } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * API Error class with extended properties for better error handling
 */
export class ApiError extends Error {
  code: string;
  statusCode: number;
  field?: string;
  details?: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    field?: string,
    details?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.field = field;
    this.details = details;
  }
}

// Prevent requests from hanging indefinitely (e.g. slow server or network)
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  withCredentials: true,
  timeout: REQUEST_TIMEOUT_MS,
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

// Response interceptor - handle errors with proper error structure
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ 
    error: string; 
    message: string; 
    code?: string; 
    field?: string; 
    details?: Array<{ field: string; message: string }> 
  }>) => {
    if (error.response) {
      const { status, data } = error.response;

      // Handle 401 - redirect to login
      if (status === 401) {
        localStorage.removeItem('dentacrm-auth');
        // Only redirect if not already on login page
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(new ApiError(
          'Session expired. Please log in again.',
          'SESSION_EXPIRED',
          401
        ));
      }

      // Handle 403 - permission denied
      if (status === 403) {
        return Promise.reject(new ApiError(
          data?.message || 'You do not have permission to perform this action.',
          data?.code || 'PERMISSION_DENIED',
          403,
          data?.field
        ));
      }

      // Handle 404 - not found
      if (status === 404) {
        return Promise.reject(new ApiError(
          data?.message || 'The requested resource was not found.',
          data?.code || 'NOT_FOUND',
          404
        ));
      }

      // Handle 400 - validation/bad request
      if (status === 400) {
        return Promise.reject(new ApiError(
          data?.message || data?.error || 'Invalid request. Please check your input.',
          data?.code || 'VALIDATION_ERROR',
          400,
          data?.field,
          data?.details
        ));
      }

      // Handle other errors
      const message = data?.message || data?.error || 'An unexpected error occurred.';
      const code = data?.code || `HTTP_${status}`;
      
      return Promise.reject(new ApiError(message, code, status, data?.field, data?.details));
    }

    if (error.request) {
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.toLowerCase().includes('timeout');
      return Promise.reject(new ApiError(
        isTimeout
          ? 'Request timed out. The server is taking too long to respond. Please try again.'
          : 'Network error - please check your connection and try again.',
        isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        0
      ));
    }

    return Promise.reject(new ApiError(
      error.message || 'An unexpected error occurred.',
      error.code === 'ECONNABORTED' ? 'TIMEOUT' : 'UNKNOWN_ERROR',
      0
    ));
  }
);

export default api;

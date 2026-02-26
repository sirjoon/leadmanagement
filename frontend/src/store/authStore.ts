import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/client';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'LEAD_USER' | 'CLINIC_STAFF';

// Role helper functions
export const isAdminRole = (role: Role): boolean => role === 'ADMIN' || role === 'SUPER_ADMIN';
export const isLeadUserRole = (role: Role): boolean => role === 'LEAD_USER';
export const isClinicStaffRole = (role: Role): boolean => role === 'CLINIC_STAFF';

export interface Clinic {
  id: string;
  name: string;
  slug: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  location: string | null;
  clinics: Clinic[];
}

interface AuthState {
  user: User | null;
  token: string | null;
  tenantId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (email: string, password: string, tenantId: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  setTenant: (tenantId: string) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      tenantId: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password, tenantId) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post('/auth/login', {
            email,
            password,
            tenantId,
          });

          const { token, user } = response.data;

          set({
            user,
            token,
            tenantId,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: unknown) {
          const message = error instanceof Error 
            ? error.message 
            : 'Login failed';
          set({ 
            error: message,
            isLoading: false,
          });
          throw error;
        }
      },

      logout: () => {
        api.post('/auth/logout').catch(() => {});
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },

      fetchMe: async () => {
        const { token, tenantId } = get();
        if (!token || !tenantId) return;

        set({ isLoading: true });
        try {
          const response = await api.get('/auth/me');
          set({
            user: response.data,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      setTenant: (tenantId) => {
        set({ tenantId });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'dentacrm-auth',
      partialize: (state) => ({
        token: state.token,
        tenantId: state.tenantId,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

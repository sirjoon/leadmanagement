import { create } from 'zustand';
import { api } from '../api/client';

export type LeadStatus = 
  | 'NEW' 
  | 'ATTEMPTING' 
  | 'CONNECTED' 
  | 'APPOINTMENT_BOOKED' 
  | 'VISITED' 
  | 'TREATMENT_STARTED' 
  | 'RESCHEDULED' 
  | 'LOST' 
  | 'DNC' 
  | 'DNR';

export type Priority = 'HOT' | 'WARM' | 'COLD' | 'NEW' | 'APPOINTMENT' | 'VISITED';

export type LeadSource = 
  | 'META_ADS' 
  | 'GOOGLE_ADS' 
  | 'ORGANIC' 
  | 'WHATSAPP' 
  | 'REFERRAL' 
  | 'WALK_IN' 
  | 'IVR' 
  | 'OTHER';

export interface Clinic {
  id: string;
  name: string;
  slug: string;
}

export interface Note {
  id: string;
  content: string;
  type: string;
  isAdminOnly: boolean;
  createdAt: string;
  author: {
    id: string;
    name: string;
    role: string;
  };
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  age: number | null;
  status: LeadStatus;
  priority: Priority;
  source: LeadSource;
  treatmentInterest: string | null;
  followUpDate: string | null;
  lastContactedAt: string | null;
  nextAction: string | null;
  clinicId: string | null;
  clinic: Clinic | null;
  notes: Note[];
  createdAt: string;
  updatedAt: string;
  _count?: {
    notes: number;
    appointments: number;
  };
}

export interface LeadFilters {
  status?: LeadStatus;
  priority?: Priority;
  clinicId?: string;
  source?: LeadSource;
  search?: string;
  followUpFrom?: string;
  followUpTo?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'followUpDate' | 'updatedAt' | 'name';
  sortOrder?: 'asc' | 'desc';
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface LeadState {
  leads: Lead[];
  currentLead: Lead | null;
  tbdLeads: Lead[];
  pagination: Pagination;
  filters: LeadFilters;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchLeads: (filters?: LeadFilters) => Promise<void>;
  fetchLead: (id: string) => Promise<void>;
  fetchTbdLeads: () => Promise<void>;
  createLead: (data: Partial<Lead>) => Promise<Lead>;
  updateLead: (id: string, data: Partial<Lead>) => Promise<Lead>;
  assignLead: (id: string, clinicId: string) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;
  setFilters: (filters: LeadFilters) => void;
  clearFilters: () => void;
}

const defaultFilters: LeadFilters = {
  page: 1,
  limit: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

export const useLeadStore = create<LeadState>((set, get) => ({
  leads: [],
  currentLead: null,
  tbdLeads: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  filters: defaultFilters,
  isLoading: false,
  error: null,

  fetchLeads: async (filters) => {
    set({ isLoading: true, error: null });
    try {
      const currentFilters = { ...get().filters, ...filters };
      const params = new URLSearchParams();
      
      Object.entries(currentFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });

      const response = await api.get(`/leads?${params}`);
      
      set({
        leads: response.data.leads,
        pagination: response.data.pagination,
        filters: currentFilters,
        isLoading: false,
      });
    } catch (error: unknown) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch leads',
        isLoading: false,
      });
    }
  },

  fetchLead: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get(`/leads/${id}`);
      set({ currentLead: response.data.lead, isLoading: false });
    } catch (error: unknown) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch lead',
        isLoading: false,
      });
    }
  },

  fetchTbdLeads: async () => {
    try {
      const response = await api.get('/leads/tbd');
      set({ tbdLeads: response.data.leads });
    } catch {
      // Silently fail for TBD queue
    }
  },

  createLead: async (data) => {
    const response = await api.post('/leads', data);
    const newLead = response.data.lead;
    set((state) => ({ leads: [newLead, ...state.leads] }));
    return newLead;
  },

  updateLead: async (id, data) => {
    const response = await api.patch(`/leads/${id}`, data);
    const updatedLead = response.data.lead;
    
    set((state) => ({
      leads: state.leads.map((l) => (l.id === id ? updatedLead : l)),
      currentLead: state.currentLead?.id === id ? updatedLead : state.currentLead,
    }));
    
    return updatedLead;
  },

  assignLead: async (id, clinicId) => {
    const response = await api.post(`/leads/${id}/assign`, { clinicId });
    const updatedLead = response.data.lead;
    
    set((state) => ({
      leads: state.leads.map((l) => (l.id === id ? updatedLead : l)),
      tbdLeads: state.tbdLeads.filter((l) => l.id !== id),
    }));
  },

  deleteLead: async (id) => {
    await api.delete(`/leads/${id}`);
    set((state) => ({
      leads: state.leads.filter((l) => l.id !== id),
    }));
  },

  setFilters: (filters) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
  },

  clearFilters: () => {
    set({ filters: defaultFilters });
  },
}));

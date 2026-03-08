import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  AlertCircle,
  PhoneOff,
  Clock,
  Stethoscope,
  Calendar,
} from 'lucide-react';
import { type Lead, type LeadStatus, useLeadStore } from '../store/leadStore';
import { useAuthStore, isAdminRole } from '../store/authStore';
import { api } from '../api/client';
import { clsx } from 'clsx';
import PatientCard, { type PatientAction } from '../components/PatientCard';
import ScheduleAppointmentModal from '../components/ScheduleAppointmentModal';
import LastUpdated from '../components/LastUpdated';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

interface Clinic {
  id: string;
  name: string;
  slug: string;
}

// Actions available on DNR/DNC tab
const dnrDncActions: PatientAction[] = [
  {
    label: 'Move to Treatment',
    status: 'TREATMENT_STARTED' as LeadStatus,
    color: 'bg-teal-500 text-white hover:bg-teal-600',
    icon: <Stethoscope className="h-3.5 w-3.5" />,
  },
  {
    label: 'New Appointment',
    status: 'APPOINTMENT_BOOKED' as LeadStatus,
    color: 'bg-emerald-500 text-white hover:bg-emerald-600',
    icon: <Calendar className="h-3.5 w-3.5" />,
  },
];

export default function DnrDncPage() {
  const {
    leads,
    pagination,
    isLoading,
    error,
    fetchLeads,
  } = useLeadStore();

  const { user } = useAuthStore();
  const isAdmin = user?.role ? isAdminRole(user.role) : false;

  const [searchQuery, setSearchQuery] = useState('');
  const [clinicFilter, setClinicFilter] = useState('');
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [statusFilter, setStatusFilter] = useState<'' | 'DNR' | 'DNC'>('');
  const [sortBy, setSortBy] = useState<'updatedAt' | 'name' | 'createdAt'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // We fetch DNR first, then DNC, and combine — or use a single fetch if status supports comma
  // The leadStore fetches one status at a time, so we'll use DNR as default and allow toggle
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingBoth, setLoadingBoth] = useState(false);

  // Modals
  const [scheduleModal, setScheduleModal] = useState<{ lead: Lead; targetStatus: LeadStatus } | null>(null);

  const fetchBothStatuses = useCallback(async () => {
    setLoadingBoth(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      if (searchQuery) params.set('search', searchQuery);
      if (clinicFilter) params.set('clinicId', clinicFilter);

      if (statusFilter) {
        params.set('status', statusFilter);
        const res = await api.get(`/leads?${params}`);
        setAllLeads(res.data.leads || []);
        setTotalCount(res.data.pagination?.total || 0);
      } else {
        // Fetch both DNR and DNC
        const paramsDnr = new URLSearchParams(params);
        paramsDnr.set('status', 'DNR');
        const paramsDnc = new URLSearchParams(params);
        paramsDnc.set('status', 'DNC');

        const [resDnr, resDnc] = await Promise.all([
          api.get(`/leads?${paramsDnr}`),
          api.get(`/leads?${paramsDnc}`),
        ]);

        const combined = [
          ...(resDnr.data.leads || []),
          ...(resDnc.data.leads || []),
        ];

        // Sort combined
        combined.sort((a: Lead, b: Lead) => {
          const aVal = a[sortBy] || '';
          const bVal = b[sortBy] || '';
          return sortOrder === 'desc'
            ? String(bVal).localeCompare(String(aVal))
            : String(aVal).localeCompare(String(bVal));
        });

        setAllLeads(combined);
        setTotalCount(
          (resDnr.data.pagination?.total || 0) + (resDnc.data.pagination?.total || 0)
        );
      }
    } catch {
      // error handled by store
    } finally {
      setLoadingBoth(false);
    }
  }, [sortBy, sortOrder, searchQuery, clinicFilter, statusFilter]);

  useEffect(() => {
    fetchBothStatuses();
    if (isAdmin) {
      api.get('/clinics').then(res => setClinics(res.data.clinics)).catch(() => {});
    }
  }, []);

  // Re-fetch when filters change
  useEffect(() => {
    fetchBothStatuses();
  }, [statusFilter, sortBy, sortOrder]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchBothStatuses();
  };

  const handleRefresh = () => {
    fetchBothStatuses();
  };

  const { lastUpdatedText, refresh: autoRefresh } = useAutoRefresh(handleRefresh);

  const handleAction = async (lead: Lead, action: PatientAction) => {
    // Move to Treatment → schedule modal
    if (action.label === 'Move to Treatment') {
      setScheduleModal({ lead, targetStatus: 'TREATMENT_STARTED' });
      return;
    }

    // New Appointment → schedule modal
    if (action.label === 'New Appointment') {
      setScheduleModal({ lead, targetStatus: 'APPOINTMENT_BOOKED' });
      return;
    }

    // Toggle DNR ↔ DNC
    if (action.label === 'Switch to DNC' || action.label === 'Switch to DNR') {
      try {
        await useLeadStore.getState().updateLead(lead.id, { status: action.status });
        fetchBothStatuses();
      } catch {
        // handled
      }
      return;
    }
  };

  const handleScheduleSuccess = () => {
    setScheduleModal(null);
    fetchBothStatuses();
  };

  // Build per-lead actions with DNR↔DNC toggle
  const getActionsForLead = (lead: Lead): PatientAction[] => {
    const toggle: PatientAction = lead.status === 'DNR'
      ? { label: 'Switch to DNC', status: 'DNC' as LeadStatus, color: 'bg-gray-400 text-white hover:bg-gray-500', icon: <PhoneOff className="h-3.5 w-3.5" /> }
      : { label: 'Switch to DNR', status: 'DNR' as LeadStatus, color: 'bg-gray-400 text-white hover:bg-gray-500', icon: <PhoneOff className="h-3.5 w-3.5" /> };
    return [...dnrDncActions, toggle];
  };

  // Count by status
  const dnrCount = allLeads.filter(l => l.status === 'DNR').length;
  const dncCount = allLeads.filter(l => l.status === 'DNC').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">DNR / DNC</h1>
          <div className="flex items-center gap-3">
            <p className="text-sm text-slate-500">
              {totalCount} patients ({dnrCount} DNR, {dncCount} DNC)
            </p>
            <LastUpdated text={lastUpdatedText} onRefresh={autoRefresh} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className={clsx('h-5 w-5', (isLoading || loadingBoth) && 'spinner')} />
          </button>

          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [sb, so] = e.target.value.split('-');
              setSortBy(sb as 'updatedAt' | 'name' | 'createdAt');
              setSortOrder(so as 'asc' | 'desc');
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
          >
            <option value="updatedAt-desc">Recent first</option>
            <option value="updatedAt-asc">Oldest first</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
          </select>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <form onSubmit={handleSearch} className="flex flex-1 gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or phone..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
            />
          </div>
        </form>

        {/* DNR / DNC filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | 'DNR' | 'DNC')}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
        >
          <option value="">Both (DNR + DNC)</option>
          <option value="DNR">DNR Only</option>
          <option value="DNC">DNC Only</option>
        </select>

        {isAdmin && clinics.length > 0 && (
          <select
            value={clinicFilter}
            onChange={(e) => {
              setClinicFilter(e.target.value);
              fetchBothStatuses();
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
          >
            <option value="">All Clinics</option>
            {clinics.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg bg-red-50 p-4 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      )}

      {/* Loading */}
      {loadingBoth && allLeads.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full border-4 border-dental-200 border-t-dental-500 spinner" />
            <p className="text-slate-500">Loading DNR/DNC patients...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loadingBoth && allLeads.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-2xl">
            <PhoneOff className="h-8 w-8 text-gray-600" />
          </div>
          <h3 className="mt-4 font-semibold text-slate-900">No DNR/DNC patients</h3>
          <p className="mt-1 text-sm text-slate-500">
            {searchQuery ? 'Try adjusting your search' : 'Patients appear here when marked DNR or DNC'}
          </p>
        </div>
      )}

      {/* Patient cards */}
      <div className="space-y-3">
        {allLeads.map((lead, index) => (
          <PatientCard
            key={lead.id}
            lead={lead}
            index={index}
            actions={getActionsForLead(lead)}
            onAction={handleAction}
            onScheduleAppointment={(lead) => setScheduleModal({ lead, targetStatus: 'APPOINTMENT_BOOKED' })}
          />
        ))}
      </div>

      {/* Schedule Appointment Modal */}
      {scheduleModal && (
        <ScheduleAppointmentModal
          lead={scheduleModal.lead}
          targetStatus={scheduleModal.targetStatus}
          title={scheduleModal.targetStatus === 'TREATMENT_STARTED' ? 'Schedule Treatment' : 'Schedule Appointment'}
          onClose={() => setScheduleModal(null)}
          onSuccess={handleScheduleSuccess}
        />
      )}
    </div>
  );
}

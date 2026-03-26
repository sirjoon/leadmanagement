import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  AlertCircle,
  XCircle,
  Stethoscope,
  Calendar,
  PhoneOff,
  Clock,
} from 'lucide-react';
import { type Lead, type LeadStatus, useLeadStore } from '../store/leadStore';
import { useAuthStore, isAdminRole, isClinicStaffRole } from '../store/authStore';
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

// Actions available on the Treatment Denied tab
const treatmentDeniedActions: PatientAction[] = [
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
  {
    label: 'DNR',
    status: 'DNR',
    color: 'bg-orange-500 text-white hover:bg-orange-600',
    icon: <PhoneOff className="h-3.5 w-3.5" />,
    requiresConfirm: true,
  },
  {
    label: 'Lost',
    status: 'LOST',
    color: 'bg-slate-500 text-white hover:bg-slate-600',
    icon: <Clock className="h-3.5 w-3.5" />,
  },
];

export default function TreatmentDeniedPage() {
  const {
    leads,
    pagination,
    isLoading,
    error,
    fetchLeads,
  } = useLeadStore();

  const { user } = useAuthStore();
  const isAdmin = user?.role ? isAdminRole(user.role) : false;
  const isStaff = user?.role ? isClinicStaffRole(user.role) : false;

  const filteredActions = isStaff
    ? treatmentDeniedActions.filter(a => !['DNR', 'LOST'].includes(a.status))
    : treatmentDeniedActions;

  const [searchQuery, setSearchQuery] = useState('');
  const [clinicFilter, setClinicFilter] = useState('');
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [sortBy, setSortBy] = useState<'updatedAt' | 'name' | 'createdAt'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modals
  const [scheduleModal, setScheduleModal] = useState<{ lead: Lead; targetStatus: LeadStatus } | null>(null);

  const buildFilters = useCallback(() => ({
    status: 'TREATMENT_DENIED' as LeadStatus,
    inTreatment: undefined,
    search: searchQuery || undefined,
    clinicId: clinicFilter || undefined,
    sortBy,
    sortOrder,
    page: 1,
    limit: 20,
  }), [searchQuery, clinicFilter, sortBy, sortOrder]);

  const loadData = useCallback(() => {
    fetchLeads(buildFilters());
  }, [fetchLeads, buildFilters]);

  useEffect(() => {
    loadData();
    if (isAdmin) {
      api.get('/clinics').then(res => setClinics(res.data.clinics)).catch(() => {});
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLeads(buildFilters());
  };

  const handleRefresh = () => {
    fetchLeads(buildFilters());
  };

  const { lastUpdatedText, refresh: autoRefresh } = useAutoRefresh(handleRefresh);

  const handleAction = async (lead: Lead, action: PatientAction) => {
    // Move to Treatment → open schedule modal, target TREATMENT_STARTED
    if (action.label === 'Move to Treatment') {
      setScheduleModal({ lead, targetStatus: 'TREATMENT_STARTED' });
      return;
    }

    // New Appointment → open schedule modal, target APPOINTMENT_BOOKED
    if (action.label === 'New Appointment') {
      setScheduleModal({ lead, targetStatus: 'APPOINTMENT_BOOKED' });
      return;
    }

    // DNR, Lost — direct status update
    try {
      await useLeadStore.getState().updateLead(lead.id, { status: action.status });
      fetchLeads(buildFilters());
    } catch {
      // handled by store
    }
  };

  const handleScheduleSuccess = () => {
    setScheduleModal(null);
    fetchLeads(buildFilters());
  };

  const handlePageChange = (page: number) => {
    fetchLeads({ ...buildFilters(), page });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Treatment Denied</h1>
          <div className="flex items-center gap-3">
            <p className="text-sm text-slate-500">
              {pagination.total} patients • Page {pagination.page} of {pagination.totalPages || 1}
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
            <RefreshCw className={clsx('h-5 w-5', isLoading && 'spinner')} />
          </button>

          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [sb, so] = e.target.value.split('-');
              setSortBy(sb as 'updatedAt' | 'name' | 'createdAt');
              setSortOrder(so as 'asc' | 'desc');
              fetchLeads({ ...buildFilters(), sortBy: sb as 'updatedAt', sortOrder: so as 'asc' | 'desc' });
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

      {/* Search + clinic filter */}
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

        {isAdmin && clinics.length > 0 && (
          <select
            value={clinicFilter}
            onChange={(e) => {
              setClinicFilter(e.target.value);
              fetchLeads({ ...buildFilters(), clinicId: e.target.value || undefined });
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
      {isLoading && leads.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full border-4 border-dental-200 border-t-dental-500 spinner" />
            <p className="text-slate-500">Loading treatment denied patients...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && leads.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-2xl">
            <XCircle className="h-8 w-8 text-rose-600" />
          </div>
          <h3 className="mt-4 font-semibold text-slate-900">No treatment denied patients</h3>
          <p className="mt-1 text-sm text-slate-500">
            {searchQuery ? 'Try adjusting your search' : 'Patients appear here after denying treatment'}
          </p>
        </div>
      )}

      {/* Patient cards */}
      <div className="space-y-3">
        {leads.map((lead, index) => (
          <PatientCard
            key={lead.id}
            lead={lead}
            index={index}
            actions={filteredActions}
            onAction={handleAction}
            onScheduleAppointment={(lead) => setScheduleModal({ lead, targetStatus: 'TREATMENT_STARTED' })}
          />
        ))}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <p className="text-sm text-slate-500">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} patients
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

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

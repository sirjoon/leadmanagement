import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  AlertCircle,
  Clock,
  Calendar,
  XCircle,
  CheckCircle2,
  Stethoscope,
  PhoneOff,
} from 'lucide-react';
import { type Lead, type LeadStatus, useLeadStore } from '../store/leadStore';
import { useAuthStore, isAdminRole, isClinicStaffRole } from '../store/authStore';
import { api } from '../api/client';
import { clsx } from 'clsx';
import PatientCard, { type PatientAction } from '../components/PatientCard';
import ScheduleAppointmentModal from '../components/ScheduleAppointmentModal';
import LastUpdated from '../components/LastUpdated';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { parseISO, isPast, isToday, startOfDay, endOfDay, addDays } from 'date-fns';
import { formatDateIST } from '../utils/formatDate';

interface Clinic {
  id: string;
  name: string;
  slug: string;
}

const statusLabels: Record<string, string> = {
  VISITED: 'Visited',
  TREATMENT_STARTED: 'Treatment',
  TREATMENT_DENIED: 'Tx Denied',
  LOST: 'Lost',
  DNR: 'DNR',
  DNC: 'DNC',
  TWC: 'TWC',
  RESCHEDULED: 'Rescheduled',
  CONNECTED: 'Connected',
  APPOINTMENT_BOOKED: 'Appt Booked',
  NEW: 'New',
};

// Context-dependent actions based on lead's current status
function getActionsForStatus(status: LeadStatus): PatientAction[] {
  switch (status) {
    case 'VISITED':
      return [
        { label: 'Agrees Treatment', status: 'TREATMENT_STARTED', color: 'bg-teal-500 text-white hover:bg-teal-600', icon: <Stethoscope className="h-3.5 w-3.5" /> },
        { label: 'Denies Treatment', status: 'TREATMENT_DENIED', color: 'bg-rose-500 text-white hover:bg-rose-600', icon: <XCircle className="h-3.5 w-3.5" /> },
        { label: 'Lost', status: 'LOST', color: 'bg-slate-500 text-white hover:bg-slate-600', icon: <Clock className="h-3.5 w-3.5" /> },
      ];
    case 'TREATMENT_DENIED':
      return [
        { label: 'Move to Treatment', status: 'TREATMENT_STARTED', color: 'bg-teal-500 text-white hover:bg-teal-600', icon: <Stethoscope className="h-3.5 w-3.5" /> },
        { label: 'New Appointment', status: 'APPOINTMENT_BOOKED', color: 'bg-emerald-500 text-white hover:bg-emerald-600', icon: <Calendar className="h-3.5 w-3.5" /> },
        { label: 'Lost', status: 'LOST', color: 'bg-slate-500 text-white hover:bg-slate-600', icon: <Clock className="h-3.5 w-3.5" /> },
      ];
    case 'DNR':
    case 'DNC':
      return [
        { label: 'Move to Treatment', status: 'TREATMENT_STARTED', color: 'bg-teal-500 text-white hover:bg-teal-600', icon: <Stethoscope className="h-3.5 w-3.5" /> },
        { label: 'New Appointment', status: 'APPOINTMENT_BOOKED', color: 'bg-emerald-500 text-white hover:bg-emerald-600', icon: <Calendar className="h-3.5 w-3.5" /> },
      ];
    case 'LOST':
      return [
        { label: 'New Appointment', status: 'APPOINTMENT_BOOKED', color: 'bg-emerald-500 text-white hover:bg-emerald-600', icon: <Calendar className="h-3.5 w-3.5" /> },
        { label: 'Move to Treatment', status: 'TREATMENT_STARTED', color: 'bg-teal-500 text-white hover:bg-teal-600', icon: <Stethoscope className="h-3.5 w-3.5" /> },
      ];
    default:
      return [
        { label: 'DNR', status: 'DNR', color: 'bg-orange-500 text-white hover:bg-orange-600', icon: <PhoneOff className="h-3.5 w-3.5" />, requiresConfirm: true },
        { label: 'Lost', status: 'LOST', color: 'bg-slate-500 text-white hover:bg-slate-600', icon: <Clock className="h-3.5 w-3.5" /> },
      ];
  }
}

// Remove from follow-ups action (always available)
const removeFollowUpAction: PatientAction = {
  label: 'Remove Follow-up',
  status: 'VISITED' as LeadStatus, // placeholder, handled in onAction
  color: 'bg-slate-200 text-slate-700 hover:bg-slate-300',
  icon: <XCircle className="h-3.5 w-3.5" />,
};

type GroupKey = 'overdue' | 'today' | 'thisWeek' | 'upcoming' | 'noDate';

const groupLabels: Record<GroupKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  thisWeek: 'This Week',
  upcoming: 'Upcoming',
  noDate: 'No Follow-up Date',
};

const groupColors: Record<GroupKey, string> = {
  overdue: 'text-red-600 bg-red-50 border-red-200',
  today: 'text-amber-600 bg-amber-50 border-amber-200',
  thisWeek: 'text-blue-600 bg-blue-50 border-blue-200',
  upcoming: 'text-green-600 bg-green-50 border-green-200',
  noDate: 'text-slate-500 bg-slate-50 border-slate-200',
};

function getGroup(lead: Lead): GroupKey {
  if (!lead.followUpDate) return 'noDate';
  const date = parseISO(lead.followUpDate);
  const now = new Date();
  if (isPast(date) && !isToday(date)) return 'overdue';
  if (isToday(date)) return 'today';
  const weekEnd = endOfDay(addDays(startOfDay(now), 7));
  if (date <= weekEnd) return 'thisWeek';
  return 'upcoming';
}

export default function FollowUpsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role ? isAdminRole(user.role) : false;
  const isStaff = user?.role ? isClinicStaffRole(user.role) : false;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [clinicFilter, setClinicFilter] = useState('');
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [scheduleModal, setScheduleModal] = useState<{ lead: Lead; targetStatus: LeadStatus } | null>(null);

  const fetchFollowUps = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get('/leads/follow-ups');
      setLeads(res.data.leads || []);
    } catch {
      setError('Failed to load follow-ups');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFollowUps();
    if (isAdmin) {
      api.get('/clinics').then(res => setClinics(res.data.clinics)).catch(() => {});
    }
  }, []);

  const handleRefresh = () => {
    fetchFollowUps();
  };

  const { lastUpdatedText, refresh: autoRefresh } = useAutoRefresh(handleRefresh);

  // Filter leads
  const filteredLeads = useMemo(() => {
    let result = leads;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        l.name.toLowerCase().includes(q) || l.phone.includes(q)
      );
    }
    if (clinicFilter) {
      result = result.filter(l => l.clinicId === clinicFilter);
    }
    if (statusFilter) {
      result = result.filter(l => l.status === statusFilter);
    }
    return result;
  }, [leads, searchQuery, clinicFilter, statusFilter]);

  // Group leads
  const groupedLeads = useMemo(() => {
    const groups: Record<GroupKey, Lead[]> = {
      overdue: [],
      today: [],
      thisWeek: [],
      upcoming: [],
      noDate: [],
    };
    for (const lead of filteredLeads) {
      groups[getGroup(lead)].push(lead);
    }
    return groups;
  }, [filteredLeads]);

  const groupOrder: GroupKey[] = ['overdue', 'today', 'thisWeek', 'upcoming', 'noDate'];

  // Unique statuses for filter dropdown
  const uniqueStatuses = useMemo(() => {
    const set = new Set(leads.map(l => l.status));
    return Array.from(set).sort();
  }, [leads]);

  const handleAction = async (lead: Lead, action: PatientAction) => {
    // Remove from follow-ups
    if (action.label === 'Remove Follow-up') {
      try {
        await api.patch(`/leads/${lead.id}/follow-up`, { followUp: false, followUpDate: null });
        fetchFollowUps();
      } catch {
        // handled
      }
      return;
    }

    // Actions that need scheduling
    if (action.label === 'Agrees Treatment' || action.label === 'Move to Treatment') {
      setScheduleModal({ lead, targetStatus: 'TREATMENT_STARTED' });
      return;
    }
    if (action.label === 'New Appointment') {
      setScheduleModal({ lead, targetStatus: 'APPOINTMENT_BOOKED' });
      return;
    }

    // Direct status updates
    try {
      await useLeadStore.getState().updateLead(lead.id, { status: action.status });
      fetchFollowUps();
    } catch {
      // handled by store
    }
  };

  const handleScheduleSuccess = () => {
    setScheduleModal(null);
    fetchFollowUps();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Follow-ups</h1>
          <div className="flex items-center gap-3">
            <p className="text-sm text-slate-500">
              {filteredLeads.length} patients across all tabs
            </p>
            <LastUpdated text={lastUpdatedText} onRefresh={autoRefresh} />
          </div>
        </div>

        <button
          onClick={handleRefresh}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50"
          title="Refresh"
        >
          <RefreshCw className={clsx('h-5 w-5', isLoading && 'spinner')} />
        </button>
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

        {/* Status filter */}
        {uniqueStatuses.length > 1 && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
          >
            <option value="">All Statuses</option>
            {uniqueStatuses.map(s => (
              <option key={s} value={s}>{statusLabels[s] || s}</option>
            ))}
          </select>
        )}

        {isAdmin && clinics.length > 0 && (
          <select
            value={clinicFilter}
            onChange={(e) => setClinicFilter(e.target.value)}
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
            <p className="text-slate-500">Loading follow-ups...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredLeads.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-2xl">
            <Clock className="h-8 w-8 text-amber-600" />
          </div>
          <h3 className="mt-4 font-semibold text-slate-900">No follow-ups</h3>
          <p className="mt-1 text-sm text-slate-500">
            {searchQuery || statusFilter ? 'Try adjusting your filters' : 'Mark patients for follow-up from any tab to see them here'}
          </p>
        </div>
      )}

      {/* Grouped patient cards */}
      {groupOrder.map((groupKey) => {
        const groupLeads = groupedLeads[groupKey];
        if (groupLeads.length === 0) return null;

        return (
          <div key={groupKey} className="space-y-3">
            {/* Group header */}
            <div className={clsx('flex items-center gap-2 rounded-lg border px-4 py-2', groupColors[groupKey])}>
              {groupKey === 'overdue' && <AlertCircle className="h-4 w-4" />}
              {groupKey === 'today' && <Clock className="h-4 w-4" />}
              {groupKey === 'thisWeek' && <Calendar className="h-4 w-4" />}
              {groupKey === 'upcoming' && <CheckCircle2 className="h-4 w-4" />}
              {groupKey === 'noDate' && <Clock className="h-4 w-4" />}
              <span className="text-sm font-semibold">{groupLabels[groupKey]}</span>
              <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-medium">
                {groupLeads.length}
              </span>
            </div>

            {groupLeads.map((lead, index) => (
              <PatientCard
                key={lead.id}
                lead={lead}
                index={index}
                actions={[
                  ...(isStaff
                    ? getActionsForStatus(lead.status).filter(a => !['DNR', 'LOST'].includes(a.status))
                    : getActionsForStatus(lead.status)),
                  removeFollowUpAction,
                ]}
                onAction={handleAction}
                onScheduleAppointment={(lead) => setScheduleModal({ lead, targetStatus: 'TREATMENT_STARTED' })}
              />
            ))}
          </div>
        );
      })}

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

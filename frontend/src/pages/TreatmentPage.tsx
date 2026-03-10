import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  AlertCircle,
  Stethoscope,
  CheckCircle2,
  XCircle,
  PhoneOff,
  Clock,
  Calendar,
  Loader2,
} from 'lucide-react';
import { type Lead, type LeadStatus, useLeadStore } from '../store/leadStore';
import { useAuthStore, isAdminRole, isClinicStaffRole } from '../store/authStore';
import { api } from '../api/client';
import { clsx } from 'clsx';
import PatientCard, { type PatientAction, type NextAppointmentInfo } from '../components/PatientCard';
import ScheduleAppointmentModal from '../components/ScheduleAppointmentModal';
import VisitOutcomeDialog from '../components/VisitOutcomeDialog';
import RescheduleModal from '../components/RescheduleModal';
import LastUpdated from '../components/LastUpdated';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { formatDateIST } from '../utils/formatDate';

interface Clinic {
  id: string;
  name: string;
  slug: string;
}

interface Appointment {
  id: string;
  leadId: string;
  clinicId: string;
  scheduledAt: string;
  status: string;
  duration: number;
  lead?: { id: string; name: string; phone: string; clinic?: { name: string } };
  clinic?: { name: string };
}

// Actions available on the Treatment tab
const treatmentActions: PatientAction[] = [
  {
    label: 'Mark Visited',
    status: 'VISITED' as LeadStatus, // placeholder — handled in onAction
    color: 'bg-emerald-500 text-white hover:bg-emerald-600',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  {
    label: 'Schedule',
    status: 'TREATMENT_STARTED' as LeadStatus, // placeholder — opens schedule modal
    color: 'bg-teal-500 text-white hover:bg-teal-600',
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

export default function TreatmentPage() {
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
    ? treatmentActions.filter(a => !['DNR', 'LOST'].includes(a.status))
    : treatmentActions;

  const [searchQuery, setSearchQuery] = useState('');
  const [clinicFilter, setClinicFilter] = useState('');
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [sortBy, setSortBy] = useState<'updatedAt' | 'name' | 'createdAt'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modals
  const [scheduleModal, setScheduleModal] = useState<Lead | null>(null);
  const [scheduleSkipStatus, setScheduleSkipStatus] = useState(false);
  const [outcomeDialog, setOutcomeDialog] = useState<Lead | null>(null);
  const [rescheduleModal, setRescheduleModal] = useState<{ appointment: Appointment; patientName: string } | null>(null);
  const [markVisitedLoading, setMarkVisitedLoading] = useState<string | null>(null);

  // Upcoming appointments
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);

  // Map of leadId → next appointment
  const [leadAppointments, setLeadAppointments] = useState<Record<string, Appointment>>({});

  const buildFilters = useCallback(() => ({
    status: 'TREATMENT_STARTED' as LeadStatus,
    search: searchQuery || undefined,
    clinicId: clinicFilter || undefined,
    sortBy,
    sortOrder,
    page: 1,
    limit: 20,
  }), [searchQuery, clinicFilter, sortBy, sortOrder]);

  const loadAppointments = useCallback(async () => {
    setAppointmentsLoading(true);
    try {
      const res = await api.get('/appointments', {
        params: {
          status: 'SCHEDULED,CONFIRMED',
          fromDate: new Date().toISOString(),
          limit: 50,
        },
      });
      const appts: Appointment[] = res.data.appointments || [];
      setAppointments(appts);

      // Build leadId → nearest appointment map
      const map: Record<string, Appointment> = {};
      for (const appt of appts) {
        if (!map[appt.leadId] || new Date(appt.scheduledAt) < new Date(map[appt.leadId].scheduledAt)) {
          map[appt.leadId] = appt;
        }
      }
      setLeadAppointments(map);
    } catch {
      // silently fail
    } finally {
      setAppointmentsLoading(false);
    }
  }, []);

  const loadData = useCallback(() => {
    fetchLeads(buildFilters());
    loadAppointments();
  }, [fetchLeads, buildFilters, loadAppointments]);

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
    loadAppointments();
  };

  const { lastUpdatedText, refresh: autoRefresh } = useAutoRefresh(handleRefresh);

  const handleAction = async (lead: Lead, action: PatientAction) => {
    // Mark Visited: find latest SCHEDULED/CONFIRMED appointment → COMPLETED → show outcome dialog
    if (action.label === 'Mark Visited') {
      setMarkVisitedLoading(lead.id);
      try {
        // Find lead's latest scheduled appointment
        const appt = leadAppointments[lead.id];
        if (appt) {
          await api.patch(`/appointments/${appt.id}`, { status: 'COMPLETED' });
        }
        // Show outcome dialog
        setOutcomeDialog(lead);
      } catch {
        // If no appointment, still show outcome dialog
        setOutcomeDialog(lead);
      } finally {
        setMarkVisitedLoading(null);
      }
      return;
    }

    // Schedule: open modal with skipStatusUpdate
    if (action.label === 'Schedule') {
      setScheduleSkipStatus(true);
      setScheduleModal(lead);
      return;
    }

    // DNR, Lost — direct status update
    try {
      await useLeadStore.getState().updateLead(lead.id, { status: action.status });
      fetchLeads(buildFilters());
      loadAppointments();
    } catch {
      // handled by store
    }
  };

  const handleTreatmentAccepted = () => {
    // Lead stays TREATMENT_STARTED — open schedule modal for next appointment
    const lead = outcomeDialog;
    setOutcomeDialog(null);
    if (lead) {
      setScheduleSkipStatus(true);
      setScheduleModal(lead);
    }
  };

  const handleTreatmentDenied = async () => {
    if (!outcomeDialog) return;
    try {
      await useLeadStore.getState().updateLead(outcomeDialog.id, { status: 'TREATMENT_DENIED' as LeadStatus });
      setOutcomeDialog(null);
      fetchLeads(buildFilters());
      loadAppointments();
    } catch {
      setOutcomeDialog(null);
    }
  };

  const handleScheduleSuccess = () => {
    setScheduleModal(null);
    setScheduleSkipStatus(false);
    fetchLeads(buildFilters());
    loadAppointments();
  };

  const handleRescheduleSuccess = () => {
    setRescheduleModal(null);
    loadAppointments();
  };

  const handlePageChange = (page: number) => {
    fetchLeads({ ...buildFilters(), page });
  };

  // Filter upcoming appointments to only TREATMENT_STARTED leads
  const treatmentLeadIds = new Set(leads.map(l => l.id));
  const upcomingAppointments = appointments.filter(a => treatmentLeadIds.has(a.leadId));

  const getApptStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      SCHEDULED: 'bg-blue-100 text-blue-700',
      CONFIRMED: 'bg-green-100 text-green-700',
    };
    return (
      <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', colors[status] || 'bg-slate-100 text-slate-600')}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Treatment</h1>
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
            <p className="text-slate-500">Loading treatment patients...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && leads.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-2xl">
            <Stethoscope className="h-8 w-8 text-teal-600" />
          </div>
          <h3 className="mt-4 font-semibold text-slate-900">No treatment patients</h3>
          <p className="mt-1 text-sm text-slate-500">
            {searchQuery ? 'Try adjusting your search' : 'Patients appear here after agreeing to treatment'}
          </p>
        </div>
      )}

      {/* Patient cards */}
      <div className="space-y-3">
        {leads.map((lead, index) => (
          <div key={lead.id} className="relative">
            {markVisitedLoading === lead.id && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70">
                <Loader2 className="h-6 w-6 text-teal-500 spinner" />
              </div>
            )}
            <PatientCard
              lead={lead}
              index={index}
              actions={filteredActions}
              onAction={handleAction}
              onScheduleAppointment={(lead) => {
                setScheduleSkipStatus(true);
                setScheduleModal(lead);
              }}
              nextAppointment={leadAppointments[lead.id] ? {
                id: leadAppointments[lead.id].id,
                scheduledAt: leadAppointments[lead.id].scheduledAt,
                status: leadAppointments[lead.id].status,
              } : undefined}
              onReschedule={(appt) => {
                const fullAppt = appointments.find(a => a.id === appt.id);
                if (fullAppt) {
                  setRescheduleModal({ appointment: fullAppt, patientName: lead.name });
                }
              }}
            />
          </div>
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

      {/* Upcoming Treatment Schedule */}
      {upcomingAppointments.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-soft">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              <Calendar className="h-5 w-5 text-teal-600" />
              Upcoming Treatment Schedule
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                {upcomingAppointments.length}
              </span>
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2">Date & Time</th>
                  <th className="px-4 py-2">Patient</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Clinic</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {upcomingAppointments
                  .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                  .map((appt) => {
                    const lead = leads.find(l => l.id === appt.leadId);
                    return (
                      <tr key={appt.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          {formatDateIST(appt.scheduledAt, 'MMM d, h:mm a')}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {lead?.name || appt.lead?.name || '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <a href={`tel:${lead?.phone || appt.lead?.phone}`} className="text-dental-600 hover:underline">
                            {lead?.phone || appt.lead?.phone || '—'}
                          </a>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {lead?.clinic?.name || appt.clinic?.name || '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {getApptStatusBadge(appt.status)}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => setRescheduleModal({
                              appointment: appt,
                              patientName: lead?.name || appt.lead?.name || 'Patient',
                            })}
                            className="rounded-lg border border-orange-200 px-2.5 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50"
                          >
                            Reschedule
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {appointmentsLoading && appointments.length === 0 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 text-slate-400 spinner" />
        </div>
      )}

      {/* Schedule Appointment Modal */}
      {scheduleModal && (
        <ScheduleAppointmentModal
          lead={scheduleModal}
          targetStatus="TREATMENT_STARTED"
          title={scheduleSkipStatus ? 'Schedule Next Appointment' : 'Schedule Treatment'}
          skipStatusUpdate={scheduleSkipStatus}
          onClose={() => { setScheduleModal(null); setScheduleSkipStatus(false); }}
          onSuccess={handleScheduleSuccess}
        />
      )}

      {/* Visit Outcome Dialog */}
      {outcomeDialog && (
        <VisitOutcomeDialog
          patientName={outcomeDialog.name}
          onTreatmentAccepted={handleTreatmentAccepted}
          onTreatmentDenied={handleTreatmentDenied}
          onClose={() => setOutcomeDialog(null)}
        />
      )}

      {/* Reschedule Modal */}
      {rescheduleModal && (
        <RescheduleModal
          appointment={rescheduleModal.appointment}
          patientName={rescheduleModal.patientName}
          onClose={() => setRescheduleModal(null)}
          onSuccess={handleRescheduleSuccess}
        />
      )}
    </div>
  );
}

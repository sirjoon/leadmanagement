import { useEffect, useState } from 'react';
import { Calendar, Clock, MapPin, Phone, ChevronLeft, ChevronRight, RefreshCw, Loader2, MessageSquare, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { clsx } from 'clsx';
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay } from 'date-fns';
import { formatDateInputIST } from '../utils/formatDate';
import { formatDateIST } from '../utils/formatDate';
import { useAuthStore, isClinicStaffRole } from '../store/authStore';
import StaffDashboard from '../components/StaffDashboard';
import LastUpdated from '../components/LastUpdated';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

interface Appointment {
  id: string;
  scheduledAt: string;
  duration: number;
  status: string;
  notes: string | null;
  lead: {
    id: string;
    name: string;
    phone: string;
    treatmentInterest: string | null;
  };
  clinic: {
    id: string;
    name: string;
    slug: string;
  };
}

const statusColors: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700 border-blue-200',
  CONFIRMED: 'bg-green-100 text-green-700 border-green-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
  NO_SHOW: 'bg-orange-100 text-orange-700 border-orange-200',
  RESCHEDULED: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

export default function AppointmentsPage() {
  const { user } = useAuthStore();
  const isStaff = user ? isClinicStaffRole(user.role) : false;

  // For clinic staff, show the specialized StaffDashboard
  if (isStaff) {
    return <StaffDashboard />;
  }

  return <AppointmentsCalendar />;
}

const extractRescheduleReason = (notes: string | null): string | null => {
  if (!notes) return null;
  // Get the last reschedule reason (most recent)
  const matches = [...notes.matchAll(/\[Reschedule Reason: (.+?)\]/g)];
  return matches.length > 0 ? matches[matches.length - 1][1] : null;
};

const statusFilterOptions = [
  { value: '', label: 'All' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'RESCHEDULED', label: 'Rescheduled' },
  { value: 'COMPLETED', label: 'Visited' },
  { value: 'NO_SHOW', label: 'Lost' },
  { value: 'DNR', label: 'DNR' },
  { value: 'TWC', label: 'TWC' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function AppointmentsCalendar() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [statusFilter, setStatusFilter] = useState('');

  // Reschedule state
  const [rescheduleModal, setRescheduleModal] = useState<Appointment | null>(null);
  const [rescheduleData, setRescheduleData] = useState({ scheduledAt: '', reason: '' });
  const [updating, setUpdating] = useState<string | null>(null);

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: currentWeekStart, end: weekEnd });

  useEffect(() => {
    fetchAppointments();
  }, [currentWeekStart, statusFilter]);

  const fetchAppointments = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/appointments', {
        params: {
          from: currentWeekStart.toISOString(),
          to: weekEnd.toISOString(),
          ...(statusFilter && { status: statusFilter }),
        },
      });
      setAppointments(response.data.appointments);
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getAppointmentsForDay = (day: Date) => {
    return appointments.filter((apt) =>
      isSameDay(parseISO(apt.scheduledAt), day)
    );
  };

  const { lastUpdatedText, refresh: autoRefresh } = useAutoRefresh(fetchAppointments);

  const goToPreviousWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const goToNextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  const goToToday = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const openRescheduleModal = (apt: Appointment) => {
    setRescheduleModal(apt);
    setRescheduleData({
      scheduledAt: formatDateInputIST(apt.scheduledAt),
      reason: '',
    });
  };

  const handleReschedule = async () => {
    if (!rescheduleModal || !rescheduleData.scheduledAt) return;
    setUpdating(rescheduleModal.id);
    try {
      await api.patch(`/appointments/${rescheduleModal.id}`, {
        scheduledAt: new Date(rescheduleData.scheduledAt).toISOString(),
        rescheduleReason: rescheduleData.reason || undefined,
      });
      await fetchAppointments();
      setRescheduleModal(null);
      setRescheduleData({ scheduledAt: '', reason: '' });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reschedule');
    } finally {
      setUpdating(null);
    }
  };

  const handleCancelAppointment = async (apt: Appointment) => {
    if (!confirm(`Cancel appointment for ${apt.lead.name}? The slot will become available.`)) return;
    setUpdating(apt.id);
    try {
      await api.patch(`/appointments/${apt.id}`, { status: 'CANCELLED' });
      await fetchAppointments();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel appointment');
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Appointments</h1>
          <div className="flex items-center gap-3">
            <p className="text-sm text-slate-500">
              {format(currentWeekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
            </p>
            <LastUpdated text={lastUpdatedText} onRefresh={autoRefresh} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goToPreviousWeek}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
          >
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <button
            onClick={goToToday}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Today
          </button>
          <button
            onClick={goToNextWeek}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
          >
            <ChevronRight className="h-5 w-5 text-slate-600" />
          </button>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {statusFilterOptions.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              statusFilter === s.value
                ? 'bg-dental-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid gap-4 lg:grid-cols-7">
        {weekDays.map((day) => {
          const dayAppointments = getAppointmentsForDay(day);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toISOString()}
              className={clsx(
                'min-h-[200px] rounded-xl border bg-white p-3',
                isToday ? 'border-dental-300 ring-2 ring-dental-100' : 'border-slate-200'
              )}
            >
              <div className="mb-3 text-center">
                <p className="text-xs font-medium uppercase text-slate-400">
                  {format(day, 'EEE')}
                </p>
                <p className={clsx(
                  'text-xl font-bold',
                  isToday ? 'text-dental-600' : 'text-slate-900'
                )}>
                  {format(day, 'd')}
                </p>
              </div>

              <div className="space-y-2">
                {isLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="h-5 w-5 rounded-full border-2 border-dental-200 border-t-dental-500 spinner" />
                  </div>
                ) : dayAppointments.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">No appointments</p>
                ) : (
                  dayAppointments.map((apt) => {
                    const reason = extractRescheduleReason(apt.notes);
                    return (
                      <div
                        key={apt.id}
                        onClick={() => navigate(`/leads?search=${encodeURIComponent(apt.lead.name)}`)}
                        className={clsx(
                          'rounded-lg border p-2 text-xs cursor-pointer transition-all hover:shadow-md hover:ring-2 hover:ring-dental-300',
                          statusColors[apt.status] || 'bg-slate-100 text-slate-700 border-slate-200'
                        )}
                        title={`Click to view ${apt.lead.name}'s details`}
                      >
                        <div className="flex items-center gap-1 font-semibold">
                          <Clock className="h-3 w-3" />
                          {formatDateIST(apt.scheduledAt, 'h:mm a')}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openRescheduleModal(apt);
                            }}
                            className="ml-auto rounded p-0.5 hover:bg-white/50"
                            title="Reschedule"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="mt-1 font-medium truncate">{apt.lead.name}</p>
                        <p className="text-[10px] opacity-75">{apt.clinic.name}</p>
                        {apt.status === 'RESCHEDULED' && reason && (
                          <p className="mt-1 text-[10px] italic opacity-75 truncate" title={reason}>
                            <MessageSquare className="inline h-2.5 w-2.5 mr-0.5" />
                            {reason}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Appointments list */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">
            {statusFilter ? `${statusFilterOptions.find(s => s.value === statusFilter)?.label} Appointments` : 'All Appointments This Week'}
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {appointments.length === 0 ? (
            <div className="py-12 text-center">
              <Calendar className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-4 text-slate-500">
                {statusFilter ? `No ${statusFilter.toLowerCase().replace('_', ' ')} appointments this week` : 'No appointments scheduled this week'}
              </p>
            </div>
          ) : (
            appointments
              .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
              .map((apt) => {
                const reason = extractRescheduleReason(apt.notes);
                return (
                  <div
                    key={apt.id}
                    onClick={() => navigate(`/leads?search=${encodeURIComponent(apt.lead.name)}`)}
                    className="flex items-center gap-4 p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                    title={`Click to view ${apt.lead.name}'s details`}
                  >
                    <div className="flex-shrink-0">
                      <div className={clsx(
                        'rounded-lg px-3 py-2 text-center',
                        statusColors[apt.status] || 'bg-slate-100'
                      )}>
                        <p className="text-xs font-medium">{formatDateIST(apt.scheduledAt, 'EEE')}</p>
                        <p className="text-lg font-bold">{formatDateIST(apt.scheduledAt, 'd')}</p>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900">{apt.lead.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDateIST(apt.scheduledAt, 'h:mm a')} ({apt.duration} min)
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {apt.clinic.name}
                        </span>
                        <a href={`tel:${apt.lead.phone}`} className="flex items-center gap-1 text-base font-semibold text-dental-600 hover:underline">
                          <Phone className="h-4 w-4" />
                          {apt.lead.phone}
                        </a>
                      </div>
                      {apt.status === 'RESCHEDULED' && reason && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 italic">
                          <MessageSquare className="h-3.5 w-3.5" />
                          Reason: {reason}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'].includes(apt.status) && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openRescheduleModal(apt);
                            }}
                            disabled={updating === apt.id}
                            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 hover:text-dental-600 disabled:opacity-50"
                            title="Reschedule appointment"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelAppointment(apt);
                            }}
                            disabled={updating === apt.id}
                            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            title="Cancel appointment"
                          >
                            {updating === apt.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                          </button>
                        </>
                      )}
                      <span className={clsx(
                        'rounded-full px-3 py-1 text-xs font-medium',
                        statusColors[apt.status] || 'bg-slate-100 text-slate-700'
                      )}>
                        {apt.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* Reschedule Modal */}
      {rescheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRescheduleModal(null)} />
          <div className="relative w-full max-w-md animate-scale-in rounded-xl bg-white p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold text-slate-900">Reschedule Appointment</h3>
            <p className="mt-1 text-sm text-slate-500">
              {rescheduleModal.lead.name} &mdash; {rescheduleModal.clinic.name}
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">New Date & Time</label>
                <input
                  type="datetime-local"
                  value={rescheduleData.scheduledAt}
                  onChange={(e) => setRescheduleData((prev) => ({ ...prev, scheduledAt: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Reason (Optional)</label>
                <input
                  type="text"
                  value={rescheduleData.reason}
                  onChange={(e) => setRescheduleData((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g., Patient requested different time"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setRescheduleModal(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReschedule}
                disabled={!rescheduleData.scheduledAt || updating === rescheduleModal.id}
                className="flex items-center gap-2 rounded-lg bg-dental-500 px-4 py-2 text-sm font-medium text-white hover:bg-dental-600 disabled:opacity-50"
              >
                {updating === rescheduleModal.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Reschedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

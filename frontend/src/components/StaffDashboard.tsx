import { useState, useEffect, useCallback } from 'react';
import {
  format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek,
  isToday, isBefore, startOfDay, endOfDay,
} from 'date-fns';
import { formatDateIST, formatDateTimeIST, formatDateInputIST } from '../utils/formatDate';
import {
  Calendar,
  Clock,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  XCircle,
  RefreshCw,
  PhoneOff,
  PhoneCall,
  Loader2,
  AlertCircle,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  X,
  Send,
  MessageSquare,
  FileText,
  Save,
  Edit2,
  ClipboardList,
} from 'lucide-react';
import { api } from '../api/client';
import { clsx } from 'clsx';
import DNRConfirmDialog from './DNRConfirmDialog';
import LastUpdated from './LastUpdated';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  age: number | null;
  patientLocation: string | null;
  treatmentInterest: string | null;
  treatmentPlan: string | null;
  treatmentNotes: string | null;
  enquiryDate: string | null;
  source: string;
  status: string;
}

interface PatientNote {
  id: string;
  content: string;
  type: string;
  isAdminOnly: boolean;
  createdAt: string;
  author: { id: string; name: string; role: string };
}

interface PatientAppointment {
  id: string;
  scheduledAt: string;
  duration: number;
  status: string;
  notes: string | null;
  clinic: { id: string; name: string; slug: string };
}

interface StatusHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  createdAt: string;
  reason: string | null;
}

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
  duration: number;
  status: AppointmentStatus;
  notes: string | null;
  lead: Lead;
  clinic: Clinic;
}

type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'RESCHEDULED' | 'DNR' | 'TWC';

const statusConfig: Record<AppointmentStatus, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  SCHEDULED: { label: 'Scheduled', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Clock },
  CONFIRMED: { label: 'Confirmed', color: 'text-green-700', bgColor: 'bg-green-100', icon: CheckCircle2 },
  COMPLETED: { label: 'Visited', color: 'text-emerald-700', bgColor: 'bg-emerald-100', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', color: 'text-slate-700', bgColor: 'bg-slate-100', icon: XCircle },
  NO_SHOW: { label: 'Lost', color: 'text-red-700', bgColor: 'bg-red-100', icon: XCircle },
  RESCHEDULED: { label: 'Rescheduled', color: 'text-amber-700', bgColor: 'bg-amber-100', icon: RefreshCw },
  DNR: { label: 'DNR', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: PhoneOff },
  TWC: { label: 'TWC', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: PhoneCall },
};

const sourceLabels: Record<string, string> = {
  META_ADS: 'Meta Ads',
  GOOGLE_ADS: 'Google Ads',
  ORGANIC: 'Organic',
  WHATSAPP: 'WhatsApp',
  REFERRAL: 'Referral',
  WALK_IN: 'Walk-in',
  IVR: 'IVR',
  OTHER: 'Other',
};

export default function StaffDashboard() {
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [rescheduleModal, setRescheduleModal] = useState<Appointment | null>(null);
  const [rescheduleData, setRescheduleData] = useState({ scheduledAt: '', reason: '' });
  const [dnrConfirm, setDnrConfirm] = useState<{ appointmentId: string; patientName: string } | null>(null);

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Active tab: 'appointments' or 'visited'
  const [activeTab, setActiveTab] = useState<'appointments' | 'visited'>('appointments');

  // Patient detail drawer state
  const [patientDrawer, setPatientDrawer] = useState<{
    appointment: Appointment;
    notes: PatientNote[];
    appointments: PatientAppointment[];
    statusHistory: StatusHistoryEntry[];
    patient: Lead;
  } | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('GENERAL');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Treatment plan editing in drawer
  const [editingTreatment, setEditingTreatment] = useState(false);
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [treatmentNotes, setTreatmentNotes] = useState('');
  const [savingTreatment, setSavingTreatment] = useState(false);

  // Fetch appointments for the visible month range
  const fetchAppointments = useCallback(async () => {
    try {
      setLoading(true);
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      // Extend range to cover calendar grid edges (prev/next month days shown)
      const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
      const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

      const res = await api.get('/appointments', {
        params: {
          from: calStart.toISOString(),
          to: calEnd.toISOString(),
        },
      });
      setAllAppointments(res.data.appointments);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  const { lastUpdatedText, refresh: autoRefresh } = useAutoRefresh(fetchAppointments);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Appointments for the selected day
  const selectedDayAppointments = allAppointments
    .filter((apt) => isSameDay(parseISO(apt.scheduledAt), selectedDate))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  // Count appointments per day for calendar dots
  const getCountForDay = (day: Date) =>
    allAppointments.filter((apt) => isSameDay(parseISO(apt.scheduledAt), day)).length;

  // Stats for selected day
  const stats = {
    total: selectedDayAppointments.length,
    scheduled: selectedDayAppointments.filter((a) => a.status === 'SCHEDULED').length,
    confirmed: selectedDayAppointments.filter((a) => a.status === 'CONFIRMED').length,
    completed: selectedDayAppointments.filter((a) => a.status === 'COMPLETED').length,
    noShow: selectedDayAppointments.filter((a) => a.status === 'NO_SHOW').length,
    rescheduled: selectedDayAppointments.filter((a) => a.status === 'RESCHEDULED').length,
    dnr: selectedDayAppointments.filter((a) => a.status === 'DNR').length,
    twc: selectedDayAppointments.filter((a) => a.status === 'TWC').length,
  };

  // Calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const goToPrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(new Date());
  };

  const handleStatusUpdate = async (appointmentId: string, newStatus: AppointmentStatus, patientName?: string) => {
    // DNR requires confirmation dialog (Story 3)
    if (newStatus === 'DNR') {
      setDnrConfirm({ appointmentId, patientName: patientName || 'this patient' });
      return;
    }

    setUpdating(appointmentId);
    try {
      await api.patch(`/appointments/${appointmentId}`, { status: newStatus });
      await fetchAppointments();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdating(null);
    }
  };

  const handleDNRConfirm = async () => {
    if (!dnrConfirm) return;
    setDnrConfirm(null);
    setUpdating(dnrConfirm.appointmentId);
    try {
      await api.patch(`/appointments/${dnrConfirm.appointmentId}`, { status: 'DNR' });
      await fetchAppointments();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdating(null);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleModal || !rescheduleData.scheduledAt) return;

    setUpdating(rescheduleModal.id);
    try {
      await api.patch(`/appointments/${rescheduleModal.id}`, {
        scheduledAt: new Date(rescheduleData.scheduledAt).toISOString(),
        rescheduleReason: rescheduleData.reason || undefined,
      });
      // If rescheduled to a different month, the fetchAppointments will pick it up
      await fetchAppointments();
      // Select the new date so user sees the rescheduled appointment
      const newDate = new Date(rescheduleData.scheduledAt);
      if (!isSameMonth(newDate, currentMonth)) {
        setCurrentMonth(newDate);
      }
      setSelectedDate(newDate);
      setRescheduleModal(null);
      setRescheduleData({ scheduledAt: '', reason: '' });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reschedule');
    } finally {
      setUpdating(null);
    }
  };

  const openRescheduleModal = (appointment: Appointment) => {
    setRescheduleModal(appointment);
    setRescheduleData({
      scheduledAt: formatDateInputIST(appointment.scheduledAt),
      reason: '',
    });
  };

  // Open patient detail drawer
  const openPatientDrawer = async (appointment: Appointment) => {
    setDrawerLoading(true);
    try {
      const res = await api.get(`/appointments/${appointment.id}/patient-history`);
      setPatientDrawer({
        appointment,
        notes: res.data.notes,
        appointments: res.data.appointments,
        statusHistory: res.data.statusHistory,
        patient: res.data.patient,
      });
      setTreatmentPlan(res.data.patient.treatmentPlan || '');
      setTreatmentNotes(res.data.patient.treatmentNotes || '');
      setEditingTreatment(false);
    } catch {
      alert('Failed to load patient history');
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!patientDrawer || !newNote.trim()) return;
    setSubmittingNote(true);
    try {
      const res = await api.post('/notes', {
        leadId: patientDrawer.patient.id,
        content: newNote.trim(),
        type: noteType,
      });
      setPatientDrawer({
        ...patientDrawer,
        notes: [res.data.note, ...patientDrawer.notes],
      });
      setNewNote('');
    } catch {
      alert('Failed to add note');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleSaveTreatmentPlan = async () => {
    if (!patientDrawer) return;
    setSavingTreatment(true);
    try {
      await api.patch(`/appointments/${patientDrawer.appointment.id}/treatment-plan`, {
        treatmentPlan: treatmentPlan || undefined,
        treatmentNotes: treatmentNotes || undefined,
      });
      setPatientDrawer({
        ...patientDrawer,
        patient: {
          ...patientDrawer.patient,
          treatmentPlan,
          treatmentNotes,
        },
      });
      setEditingTreatment(false);
      // Refresh appointments to get updated data
      await fetchAppointments();
    } catch {
      alert('Failed to save treatment plan');
    } finally {
      setSavingTreatment(false);
    }
  };

  // Get visited/completed appointments
  const visitedAppointments = allAppointments.filter((apt) => apt.status === 'COMPLETED');

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
        <p className="mt-2 font-medium text-red-700">{error}</p>
        <button
          onClick={fetchAppointments}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            {activeTab === 'appointments' ? 'Appointments' : 'Visited Patients'}
          </h1>
          <p className="text-sm text-slate-500">
            {activeTab === 'appointments' ? (
              <>
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                {isToday(selectedDate) && (
                  <span className="ml-2 rounded-full bg-dental-100 px-2 py-0.5 text-xs font-medium text-dental-700">
                    Today
                  </span>
                )}
              </>
            ) : (
              `${visitedAppointments.length} completed visits this month`
            )}
          </p>
          <LastUpdated text={lastUpdatedText} onRefresh={autoRefresh} />
        </div>
        <button
          onClick={fetchAppointments}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          onClick={() => setActiveTab('appointments')}
          className={clsx(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
            activeTab === 'appointments'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          )}
        >
          <Calendar className="h-4 w-4" />
          Appointments
        </button>
        <button
          onClick={() => setActiveTab('visited')}
          className={clsx(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
            activeTab === 'visited'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
          Visited
          {visitedAppointments.length > 0 && (
            <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
              {visitedAppointments.length}
            </span>
          )}
        </button>
      </div>

      {/* Appointments Tab */}
      {activeTab === 'appointments' && (
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* ── Calendar Panel ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {/* Month navigation */}
          <div className="mb-4 flex items-center justify-between">
            <button onClick={goToPrevMonth} className="rounded-lg p-1.5 hover:bg-slate-100">
              <ChevronLeft className="h-5 w-5 text-slate-600" />
            </button>
            <div className="text-center">
              <h2 className="text-sm font-semibold text-slate-900">
                {format(currentMonth, 'MMMM yyyy')}
              </h2>
              {!isToday(selectedDate) && (
                <button
                  onClick={goToToday}
                  className="mt-0.5 text-xs font-medium text-dental-600 hover:text-dental-700"
                >
                  Go to Today
                </button>
              )}
            </div>
            <button onClick={goToNextMonth} className="rounded-lg p-1.5 hover:bg-slate-100">
              <ChevronRight className="h-5 w-5 text-slate-600" />
            </button>
          </div>

          {/* Day headers */}
          <div className="mb-1 grid grid-cols-7 text-center">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="py-1 text-xs font-medium uppercase text-slate-400">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day) => {
              const count = getCountForDay(day);
              const isSelected = isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isPast = isBefore(endOfDay(day), startOfDay(new Date()));

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={clsx(
                    'relative flex flex-col items-center rounded-lg py-2 text-sm transition-all',
                    isSelected
                      ? 'bg-dental-500 font-bold text-white shadow-sm'
                      : isToday(day)
                        ? 'bg-dental-50 font-semibold text-dental-700 ring-1 ring-dental-200'
                        : isCurrentMonth
                          ? 'text-slate-700 hover:bg-slate-100'
                          : 'text-slate-300',
                    isPast && !isSelected && !isToday(day) && isCurrentMonth && 'text-slate-400'
                  )}
                >
                  <span>{format(day, 'd')}</span>
                  {/* Appointment dots */}
                  {count > 0 && (
                    <span
                      className={clsx(
                        'mt-0.5 min-w-[18px] rounded-full px-1 text-[10px] font-bold leading-[16px]',
                        isSelected
                          ? 'bg-white/30 text-white'
                          : 'bg-dental-100 text-dental-700'
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Day Detail Panel ── */}
        <div className="space-y-4">
          {/* Stats row */}
          {stats.total > 0 && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <StatCard label="Total" value={stats.total} color="bg-slate-100 text-slate-700" />
              <StatCard label="Scheduled" value={stats.scheduled} color="bg-blue-100 text-blue-700" />
              <StatCard label="Confirmed" value={stats.confirmed} color="bg-green-100 text-green-700" />
              <StatCard label="Visited" value={stats.completed} color="bg-emerald-100 text-emerald-700" />
              <StatCard label="Lost" value={stats.noShow} color="bg-red-100 text-red-700" />
              <StatCard label="DNR" value={stats.dnr} color="bg-orange-100 text-orange-700" />
              <StatCard label="TWC" value={stats.twc} color="bg-purple-100 text-purple-700" />
              <StatCard label="Rescheduled" value={stats.rescheduled} color="bg-amber-100 text-amber-700" />
            </div>
          )}

          {/* Appointments list for selected day */}
          {loading ? (
            <div className="flex h-40 items-center justify-center rounded-xl border border-slate-200 bg-white">
              <Loader2 className="h-8 w-8 animate-spin text-dental-500" />
            </div>
          ) : selectedDayAppointments.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
              <Calendar className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 font-display text-lg font-semibold text-slate-900">
                No Appointments
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                No appointments scheduled for {format(selectedDate, 'MMMM d, yyyy')}.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDayAppointments.map((apt) => {
                const config = statusConfig[apt.status];
                const StatusIcon = config.icon;
                const isExpanded = expandedId === apt.id;
                const isUpdating = updating === apt.id;

                return (
                  <div
                    key={apt.id}
                    className={clsx(
                      'rounded-xl border bg-white transition-all',
                      apt.status === 'RESCHEDULED' && 'border-amber-300 bg-amber-50/30',
                      apt.status === 'COMPLETED' && 'border-emerald-300 bg-emerald-50/30',
                      apt.status === 'NO_SHOW' && 'border-red-300 bg-red-50/30',
                      apt.status === 'DNR' && 'border-orange-300 bg-orange-50/30',
                      apt.status === 'TWC' && 'border-purple-300 bg-purple-50/30',
                      apt.status === 'CANCELLED' && 'border-slate-300 bg-slate-50/50',
                      !['RESCHEDULED', 'COMPLETED', 'NO_SHOW', 'DNR', 'TWC', 'CANCELLED'].includes(apt.status) && 'border-slate-200'
                    )}
                  >
                    {/* Main Row */}
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : apt.id)}
                      className="flex cursor-pointer items-center gap-4 p-4"
                      title="Click to expand details"
                    >
                      {/* Time */}
                      <div className="w-20 flex-shrink-0 text-center">
                        <p className="text-lg font-bold text-slate-900">
                          {formatDateIST(apt.scheduledAt, 'hh:mm')}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDateIST(apt.scheduledAt, 'a')} &middot; {apt.duration}m
                        </p>
                      </div>

                      {/* Patient Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{apt.lead.name}</p>
                          {apt.lead.status === 'TREATMENT_STARTED' && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">In Treatment</span>
                          )}
                          {apt.lead.age && (
                            <span className="text-sm text-slate-500">({apt.lead.age} yrs)</span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
                          <a href={`tel:${apt.lead.phone}`} className="flex items-center gap-1 text-base font-semibold text-dental-600 hover:underline">
                            <Phone className="h-4 w-4" />
                            {apt.lead.phone}
                          </a>
                          {apt.lead.treatmentInterest && (
                            <span className="flex items-center gap-1">
                              <Stethoscope className="h-3.5 w-3.5" />
                              {apt.lead.treatmentInterest}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div
                        className={clsx(
                          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
                          config.bgColor,
                          config.color
                        )}
                      >
                        <StatusIcon className="h-3.5 w-3.5" />
                        {config.label}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-4">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          {/* Contact */}
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Contact</p>
                            <div className="mt-2 space-y-1.5 text-sm">
                              <p className="flex items-center gap-2 text-slate-700">
                                <Phone className="h-4 w-4 text-slate-400" />
                                <a href={`tel:${apt.lead.phone}`} className="text-base font-semibold text-dental-600 hover:underline">
                                  {apt.lead.phone}
                                </a>
                              </p>
                              {apt.lead.email && (
                                <p className="flex items-center gap-2 text-slate-700">
                                  <Mail className="h-4 w-4 text-slate-400" />
                                  {apt.lead.email}
                                </p>
                              )}
                              {apt.lead.patientLocation && (
                                <p className="flex items-center gap-2 text-slate-700">
                                  <MapPin className="h-4 w-4 text-slate-400" />
                                  {apt.lead.patientLocation}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Enquiry Info */}
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Enquiry Info</p>
                            <div className="mt-2 space-y-1.5 text-sm">
                              <p className="text-slate-700">
                                <span className="text-slate-500">Source:</span>{' '}
                                {sourceLabels[apt.lead.source] || apt.lead.source}
                              </p>
                              {apt.lead.enquiryDate && (
                                <p className="text-slate-700">
                                  <span className="text-slate-500">Enquiry:</span>{' '}
                                  {formatDateIST(apt.lead.enquiryDate, 'MMM d, yyyy')}
                                </p>
                              )}
                              {apt.lead.treatmentInterest && (
                                <p className="text-slate-700">
                                  <span className="text-slate-500">Treatment:</span>{' '}
                                  {apt.lead.treatmentInterest}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Notes */}
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Notes</p>
                            <p className="mt-2 text-sm text-slate-600">{apt.notes || 'No notes'}</p>
                          </div>

                          {/* Quick Actions */}
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Quick Actions</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'].includes(apt.status) && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openRescheduleModal(apt);
                                    }}
                                    disabled={isUpdating}
                                    className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    Reschedule
                                  </button>
                                  {/* Cancel removed per CRM requirements — use Lost instead */}
                                </>
                              )}
                              <a
                                href={`tel:${apt.lead.phone}`}
                                className="flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                              >
                                <Phone className="h-3.5 w-3.5" />
                                Call
                              </a>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPatientDrawer(apt);
                                }}
                                disabled={drawerLoading}
                                className="flex items-center gap-1 rounded-lg border border-dental-300 bg-dental-50 px-3 py-1.5 text-xs font-medium text-dental-700 hover:bg-dental-100 disabled:opacity-50"
                              >
                                {drawerLoading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <FileText className="h-3.5 w-3.5" />
                                )}
                                Full History
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Status Update Buttons */}
                        <div className="mt-4 border-t border-slate-200 pt-4">
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                            Update Status
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(['CONFIRMED', 'COMPLETED', 'NO_SHOW', 'DNR', 'TWC'] as AppointmentStatus[]).map(
                              (status) => {
                                const cfg = statusConfig[status];
                                return (
                                  <button
                                    key={status}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStatusUpdate(apt.id, status, apt.lead.name);
                                    }}
                                    disabled={isUpdating || apt.status === status}
                                    className={clsx(
                                      'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all disabled:opacity-50',
                                      apt.status === status
                                        ? `${cfg.bgColor} ${cfg.color} ring-2 ring-offset-1`
                                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                    )}
                                  >
                                    {isUpdating ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <cfg.icon className="h-3.5 w-3.5" />
                                    )}
                                    {cfg.label}
                                  </button>
                                );
                              }
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Visited Tab */}
      {activeTab === 'visited' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex h-40 items-center justify-center rounded-xl border border-slate-200 bg-white">
              <Loader2 className="h-8 w-8 animate-spin text-dental-500" />
            </div>
          ) : visitedAppointments.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 font-display text-lg font-semibold text-slate-900">No Visited Patients</h3>
              <p className="mt-1 text-sm text-slate-500">
                No appointments have been marked as completed this month.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visitedAppointments
                .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
                .map((apt) => (
                <div
                  key={apt.id}
                  className="rounded-xl border border-emerald-200 bg-emerald-50/30 transition-all hover:shadow-md"
                >
                  <div className="flex items-center gap-4 p-4">
                    {/* Visit date */}
                    <div className="w-20 flex-shrink-0 text-center">
                      <p className="text-sm font-bold text-emerald-700">
                        {formatDateIST(apt.scheduledAt, 'MMM d')}
                      </p>
                      <p className="text-xs text-emerald-600">
                        {formatDateIST(apt.scheduledAt, 'h:mm a')}
                      </p>
                    </div>

                    {/* Patient info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{apt.lead.name}</p>
                        {apt.lead.age && (
                          <span className="text-sm text-slate-500">({apt.lead.age} yrs)</span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
                        <a href={`tel:${apt.lead.phone}`} className="flex items-center gap-1 text-base font-semibold text-dental-600 hover:underline">
                          <Phone className="h-4 w-4" />
                          {apt.lead.phone}
                        </a>
                        {apt.lead.treatmentInterest && (
                          <span className="flex items-center gap-1">
                            <Stethoscope className="h-3.5 w-3.5" />
                            {apt.lead.treatmentInterest}
                          </span>
                        )}
                      </div>
                      {/* Show treatment plan preview if exists */}
                      {apt.lead.treatmentPlan && (
                        <p className="mt-1.5 text-xs text-emerald-700">
                          <span className="font-medium">Plan:</span> {apt.lead.treatmentPlan.slice(0, 80)}
                          {apt.lead.treatmentPlan.length > 80 && '...'}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {!apt.lead.treatmentPlan && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                          No Plan
                        </span>
                      )}
                      <button
                        onClick={() => openPatientDrawer(apt)}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-600"
                      >
                        <ClipboardList className="h-3.5 w-3.5" />
                        {apt.lead.treatmentPlan ? 'View / Edit' : 'Add Plan'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DNR Confirmation Dialog (Story 3) */}
      {dnrConfirm && (
        <DNRConfirmDialog
          patientName={dnrConfirm.patientName}
          onConfirm={handleDNRConfirm}
          onCancel={() => setDnrConfirm(null)}
        />
      )}

      {/* Reschedule Modal */}
      {rescheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRescheduleModal(null)} />
          <div className="relative w-full max-w-md animate-scale-in rounded-xl bg-white p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold text-slate-900">Reschedule Appointment</h3>
            <p className="mt-1 text-sm text-slate-500">
              {rescheduleModal.lead.name} &mdash; Currently{' '}
              {formatDateTimeIST(rescheduleModal.scheduledAt)}
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
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Reason (Required)</label>
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
                disabled={!rescheduleData.scheduledAt || !rescheduleData.reason.trim() || updating === rescheduleModal.id}
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

      {/* Patient Detail Drawer */}
      {patientDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPatientDrawer(null)} />
          <div className="relative w-full max-w-lg animate-slide-in-right overflow-y-auto bg-white shadow-xl">
            {/* Drawer Header */}
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    {patientDrawer.patient.name}
                  </h2>
                  <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
                    <a href={`tel:${patientDrawer.patient.phone}`} className="flex items-center gap-1 text-base font-semibold text-dental-600 hover:underline">
                      <Phone className="h-4 w-4" />
                      {patientDrawer.patient.phone}
                    </a>
                    {patientDrawer.patient.age && (
                      <span>{patientDrawer.patient.age} yrs</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setPatientDrawer(null)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {/* Patient Info */}
              <div className="p-6">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Patient Details</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {patientDrawer.patient.email && (
                    <div>
                      <p className="text-xs text-slate-400">Email</p>
                      <p className="text-slate-700">{patientDrawer.patient.email}</p>
                    </div>
                  )}
                  {patientDrawer.patient.patientLocation && (
                    <div>
                      <p className="text-xs text-slate-400">Location</p>
                      <p className="text-slate-700">{patientDrawer.patient.patientLocation}</p>
                    </div>
                  )}
                  {patientDrawer.patient.treatmentInterest && (
                    <div>
                      <p className="text-xs text-slate-400">Treatment Interest</p>
                      <p className="text-slate-700">{patientDrawer.patient.treatmentInterest}</p>
                    </div>
                  )}
                  {patientDrawer.patient.enquiryDate && (
                    <div>
                      <p className="text-xs text-slate-400">Enquiry Date</p>
                      <p className="text-slate-700">{formatDateIST(patientDrawer.patient.enquiryDate, 'MMM d, yyyy')}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-400">Source</p>
                    <p className="text-slate-700">{sourceLabels[patientDrawer.patient.source] || patientDrawer.patient.source}</p>
                  </div>
                </div>
              </div>

              {/* Treatment Plan Section */}
              <div className="bg-green-50/50 p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-green-700">
                    <ClipboardList className="h-3.5 w-3.5" />
                    Treatment Plan
                  </h3>
                  {!editingTreatment && (
                    <button
                      onClick={() => setEditingTreatment(true)}
                      className="flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700"
                    >
                      <Edit2 className="h-3 w-3" />
                      {patientDrawer.patient.treatmentPlan ? 'Edit' : 'Add Plan'}
                    </button>
                  )}
                </div>

                {editingTreatment ? (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Treatment Plan</label>
                      <textarea
                        value={treatmentPlan}
                        onChange={(e) => setTreatmentPlan(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                        placeholder="e.g., Full arch implants, braces consultation..."
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
                      <textarea
                        value={treatmentNotes}
                        onChange={(e) => setTreatmentNotes(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                        placeholder="Additional notes..."
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingTreatment(false);
                          setTreatmentPlan(patientDrawer.patient.treatmentPlan || '');
                          setTreatmentNotes(patientDrawer.patient.treatmentNotes || '');
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveTreatmentPlan}
                        disabled={savingTreatment}
                        className={clsx(
                          'flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white',
                          savingTreatment ? 'bg-green-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'
                        )}
                      >
                        <Save className="h-3 w-3" />
                        {savingTreatment ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : patientDrawer.patient.treatmentPlan ? (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{patientDrawer.patient.treatmentPlan}</p>
                    {patientDrawer.patient.treatmentNotes && (
                      <p className="text-xs text-slate-500 whitespace-pre-wrap">{patientDrawer.patient.treatmentNotes}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">No treatment plan entered yet.</p>
                )}
              </div>

              {/* Notes Section */}
              <div className="p-6">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Notes ({patientDrawer.notes.length})
                </h3>

                {/* Add note form */}
                <div className="mb-4 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={noteType}
                      onChange={(e) => setNoteType(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs focus:border-dental-500 focus:outline-none"
                    >
                      <option value="GENERAL">General</option>
                      <option value="CALL_NOTE">Call</option>
                      <option value="VISIT_NOTE">Visit</option>
                      <option value="FOLLOW_UP">Follow-up</option>
                    </select>
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
                        placeholder="Add a note..."
                        className="w-full rounded-lg border border-slate-200 py-2 pl-3 pr-10 text-sm focus:border-dental-500 focus:outline-none"
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={!newNote.trim() || submittingNote}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-dental-500 hover:bg-dental-50 disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Notes list */}
                <div className="max-h-60 space-y-2 overflow-y-auto">
                  {patientDrawer.notes.length === 0 ? (
                    <p className="py-3 text-center text-sm text-slate-400">No notes yet</p>
                  ) : (
                    patientDrawer.notes.map((note) => (
                      <div key={note.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-700">{note.author.name}</span>
                          <span className="text-[10px] text-slate-400">
                            {formatDateIST(note.createdAt, 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600">{note.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Appointment History */}
              <div className="p-6">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <Calendar className="h-3.5 w-3.5" />
                  Appointment History ({patientDrawer.appointments.length})
                </h3>
                <div className="space-y-2">
                  {patientDrawer.appointments.map((apt) => {
                    const cfg = statusConfig[apt.status as AppointmentStatus];
                    return (
                      <div
                        key={apt.id}
                        className={clsx(
                          'flex items-center gap-3 rounded-lg border p-2.5 text-sm',
                          apt.id === patientDrawer.appointment.id
                            ? 'border-dental-300 bg-dental-50 ring-1 ring-dental-200'
                            : 'border-slate-100'
                        )}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 font-medium text-slate-700">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDateIST(apt.scheduledAt, 'MMM d, yyyy')} at {formatDateIST(apt.scheduledAt, 'h:mm a')}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {apt.clinic.name} &middot; {apt.duration} min
                          </p>
                        </div>
                        <span className={clsx(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          cfg?.bgColor || 'bg-slate-100',
                          cfg?.color || 'text-slate-700'
                        )}>
                          {cfg?.label || apt.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={clsx('rounded-lg p-3 text-center', color)}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}

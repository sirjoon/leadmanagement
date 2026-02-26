import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { 
  Calendar, 
  Clock, 
  User, 
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
} from 'lucide-react';
import { api } from '../api/client';
import { clsx } from 'clsx';

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  age: number | null;
  patientLocation: string | null;
  treatmentInterest: string | null;
  enquiryDate: string | null;
  source: string;
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

interface Stats {
  total: number;
  completed: number;
  confirmed: number;
  scheduled: number;
  noShow: number;
  dnr: number;
  twc: number;
  rescheduled: number;
}

const statusConfig: Record<AppointmentStatus, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  SCHEDULED: { label: 'Scheduled', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Clock },
  CONFIRMED: { label: 'Confirmed', color: 'text-green-700', bgColor: 'bg-green-100', icon: CheckCircle2 },
  COMPLETED: { label: 'Completed', color: 'text-emerald-700', bgColor: 'bg-emerald-100', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', color: 'text-slate-700', bgColor: 'bg-slate-100', icon: XCircle },
  NO_SHOW: { label: 'No Show', color: 'text-red-700', bgColor: 'bg-red-100', icon: XCircle },
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
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [rescheduleModal, setRescheduleModal] = useState<Appointment | null>(null);
  const [rescheduleData, setRescheduleData] = useState({ scheduledAt: '', reason: '' });

  const fetchTodayAppointments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/appointments/today');
      setAppointments(res.data.appointments);
      setStats(res.data.stats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodayAppointments();
  }, [fetchTodayAppointments]);

  const handleStatusUpdate = async (appointmentId: string, newStatus: AppointmentStatus) => {
    setUpdating(appointmentId);
    try {
      await api.patch(`/appointments/${appointmentId}`, { status: newStatus });
      await fetchTodayAppointments();
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
      await fetchTodayAppointments();
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
      scheduledAt: format(parseISO(appointment.scheduledAt), "yyyy-MM-dd'T'HH:mm"),
      reason: '',
    });
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-dental-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
        <p className="mt-2 font-medium text-red-700">{error}</p>
        <button 
          onClick={fetchTodayAppointments}
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
            Today's Appointments
          </h1>
          <p className="text-slate-500">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <button
          onClick={fetchTodayAppointments}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          <StatCard label="Total" value={stats.total} color="bg-slate-100 text-slate-700" />
          <StatCard label="Scheduled" value={stats.scheduled} color="bg-blue-100 text-blue-700" />
          <StatCard label="Confirmed" value={stats.confirmed} color="bg-green-100 text-green-700" />
          <StatCard label="Completed" value={stats.completed} color="bg-emerald-100 text-emerald-700" />
          <StatCard label="No Show" value={stats.noShow} color="bg-red-100 text-red-700" />
          <StatCard label="DNR" value={stats.dnr} color="bg-orange-100 text-orange-700" />
          <StatCard label="TWC" value={stats.twc} color="bg-purple-100 text-purple-700" />
          <StatCard label="Rescheduled" value={stats.rescheduled} color="bg-amber-100 text-amber-700" />
        </div>
      )}

      {/* Appointments List */}
      {appointments.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 font-display text-lg font-semibold text-slate-900">
            No Appointments Today
          </h3>
          <p className="mt-1 text-slate-500">
            There are no appointments scheduled for today at your clinic.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {appointments.map((apt) => {
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
                  !['RESCHEDULED', 'COMPLETED', 'NO_SHOW', 'DNR', 'TWC'].includes(apt.status) && 'border-slate-200'
                )}
              >
                {/* Main Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : apt.id)}
                  className="flex cursor-pointer items-center gap-4 p-4"
                >
                  {/* Time */}
                  <div className="w-24 flex-shrink-0 text-center">
                    <p className="text-lg font-bold text-slate-900">
                      {format(parseISO(apt.scheduledAt), 'hh:mm a')}
                    </p>
                    <p className="text-xs text-slate-500">{apt.duration} min</p>
                  </div>

                  {/* Patient Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{apt.lead.name}</p>
                      {apt.lead.age && (
                        <span className="text-sm text-slate-500">({apt.lead.age} yrs)</span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {apt.lead.phone}
                      </span>
                      {apt.lead.treatmentInterest && (
                        <span className="flex items-center gap-1">
                          <Stethoscope className="h-3.5 w-3.5" />
                          {apt.lead.treatmentInterest}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className={clsx(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
                    config.bgColor,
                    config.color
                  )}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {config.label}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {/* Contact Details */}
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          Contact
                        </p>
                        <div className="mt-2 space-y-1.5 text-sm">
                          <p className="flex items-center gap-2 text-slate-700">
                            <Phone className="h-4 w-4 text-slate-400" />
                            <a href={`tel:${apt.lead.phone}`} className="text-dental-600 hover:underline">
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
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          Enquiry Info
                        </p>
                        <div className="mt-2 space-y-1.5 text-sm">
                          <p className="text-slate-700">
                            <span className="text-slate-500">Source:</span>{' '}
                            {sourceLabels[apt.lead.source] || apt.lead.source}
                          </p>
                          {apt.lead.enquiryDate && (
                            <p className="text-slate-700">
                              <span className="text-slate-500">Enquiry:</span>{' '}
                              {format(parseISO(apt.lead.enquiryDate), 'MMM d, yyyy')}
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
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          Notes
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          {apt.notes || 'No notes'}
                        </p>
                      </div>

                      {/* Actions */}
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          Quick Actions
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); openRescheduleModal(apt); }}
                            disabled={isUpdating}
                            className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Reschedule
                          </button>
                          <a
                            href={`tel:${apt.lead.phone}`}
                            className="flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            Call
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Status Update Buttons */}
                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                        Update Status
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(['CONFIRMED', 'COMPLETED', 'NO_SHOW', 'DNR', 'TWC'] as AppointmentStatus[]).map((status) => {
                          const cfg = statusConfig[status];
                          return (
                            <button
                              key={status}
                              onClick={(e) => { e.stopPropagation(); handleStatusUpdate(apt.id, status); }}
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
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setRescheduleModal(null)}
          />
          <div className="relative w-full max-w-md animate-scale-in rounded-xl bg-white p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold text-slate-900">
              Reschedule Appointment
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {rescheduleModal.lead.name} - Currently at{' '}
              {format(parseISO(rescheduleModal.scheduledAt), 'MMM d, yyyy hh:mm a')}
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  New Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={rescheduleData.scheduledAt}
                  onChange={(e) => setRescheduleData(prev => ({ ...prev, scheduledAt: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Reason (Optional)
                </label>
                <input
                  type="text"
                  value={rescheduleData.reason}
                  onChange={(e) => setRescheduleData(prev => ({ ...prev, reason: e.target.value }))}
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

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={clsx('rounded-lg p-3 text-center', color)}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}

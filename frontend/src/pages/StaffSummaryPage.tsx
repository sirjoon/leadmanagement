import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, isToday } from 'date-fns';
import { formatDateIST } from '../utils/formatDate';
import {
  Calendar, Clock, Phone, CheckCircle2, XCircle, RefreshCw,
  PhoneOff, PhoneCall, Loader2, AlertCircle, Stethoscope,
  TrendingUp, Users, ArrowRight,
} from 'lucide-react';
import { api } from '../api/client';
import { clsx } from 'clsx';
import LastUpdated from '../components/LastUpdated';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'RESCHEDULED' | 'DNR' | 'CLINICAL_DNR' | 'TWC';

const statusConfig: Record<AppointmentStatus, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  SCHEDULED: { label: 'Scheduled', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Clock },
  CONFIRMED: { label: 'Confirmed', color: 'text-green-700', bgColor: 'bg-green-100', icon: CheckCircle2 },
  COMPLETED: { label: 'Visited', color: 'text-emerald-700', bgColor: 'bg-emerald-100', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', color: 'text-slate-700', bgColor: 'bg-slate-100', icon: XCircle },
  NO_SHOW: { label: 'Lost', color: 'text-red-700', bgColor: 'bg-red-100', icon: XCircle },
  RESCHEDULED: { label: 'Rescheduled', color: 'text-amber-700', bgColor: 'bg-amber-100', icon: RefreshCw },
  DNR: { label: 'DNR', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: PhoneOff },
  CLINICAL_DNR: { label: 'Clinical DNR', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: PhoneOff },
  TWC: { label: 'TWC', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: PhoneCall },
};

interface Lead {
  id: string;
  name: string;
  phone: string;
  age: number | null;
  treatmentInterest: string | null;
  treatmentPlan: string | null;
  source: string;
  patientLocation: string | null;
}

interface Clinic {
  id: string;
  name: string;
  slug: string;
}

interface Appointment {
  id: string;
  scheduledAt: string;
  duration: number;
  status: AppointmentStatus;
  notes: string | null;
  lead: Lead;
  clinic: Clinic;
}

interface Stats {
  total: number;
  scheduled: number;
  confirmed: number;
  completed: number;
  noShow: number;
  cancelled: number;
  rescheduled: number;
  dnr: number;
  twc: number;
}

interface WeekDay {
  date: string;
  total: number;
  completed: number;
}

interface SummaryData {
  today: { appointments: Appointment[]; stats: Stats };
  week: { stats: Stats; byDay: WeekDay[] };
  month: { stats: Stats };
  upcoming: Appointment[];
}

export default function StaffSummaryPage() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await api.get('/appointments/staff-summary');
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  };

  const { lastUpdatedText, refresh: autoRefresh } = useAutoRefresh(fetchSummary);

  useEffect(() => {
    fetchSummary();
  }, []);

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
        <button onClick={fetchSummary} className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { today, week, month, upcoming } = data;

  const nextAppointment = today.appointments.find(
    (a) => ['SCHEDULED', 'CONFIRMED'].includes(a.status) && new Date(a.scheduledAt) >= new Date()
  );

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Summary</h1>
          <div className="flex items-center gap-3">
            <p className="text-sm text-slate-500">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
            <LastUpdated text={lastUpdatedText} onRefresh={autoRefresh} />
          </div>
        </div>
        <button
          onClick={fetchSummary}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Next Appointment Highlight */}
      {nextAppointment && (
        <div className="rounded-xl border border-dental-200 bg-gradient-to-r from-dental-50 to-white p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-dental-100">
              <Clock className="h-7 w-7 text-dental-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-dental-600">Next Appointment</p>
              <p className="text-lg font-bold text-slate-900">{nextAppointment.lead.name}</p>
              <p className="text-sm text-slate-500">
                {formatDateIST(nextAppointment.scheduledAt, 'h:mm a')} &middot; {nextAppointment.duration}min
                {nextAppointment.lead.treatmentInterest && ` &middot; ${nextAppointment.lead.treatmentInterest}`}
              </p>
            </div>
            <a
              href={`tel:${nextAppointment.lead.phone}`}
              className="flex items-center gap-1.5 rounded-lg bg-dental-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-dental-600"
            >
              <Phone className="h-4 w-4" />
              Call
            </a>
          </div>
        </div>
      )}

      {/* Overview Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{today.stats.total}</p>
              <p className="text-xs font-medium text-slate-500">Today</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{week.stats.total}</p>
              <p className="text-xs font-medium text-slate-500">This Week</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{month.stats.total}</p>
              <p className="text-xs font-medium text-slate-500">This Month</p>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Stats Breakdown + Week Chart */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's Breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-slate-400">Today's Breakdown</h2>
          {today.stats.total === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <Calendar className="h-10 w-10 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">No appointments today</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Scheduled', value: today.stats.scheduled, color: 'text-blue-600 bg-blue-50' },
                { label: 'Confirmed', value: today.stats.confirmed, color: 'text-green-600 bg-green-50' },
                { label: 'Visited', value: today.stats.completed, color: 'text-emerald-600 bg-emerald-50' },
                { label: 'Lost', value: today.stats.noShow, color: 'text-red-600 bg-red-50' },
              ].map((item) => (
                <div key={item.label} className={clsx('rounded-lg p-3 text-center', item.color)}>
                  <p className="text-xl font-bold">{item.value}</p>
                  <p className="text-[11px] font-medium">{item.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Week Overview */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-slate-400">This Week</h2>
          <div className="flex items-end justify-between gap-2">
            {week.byDay.map((day, i) => {
              const maxHeight = 80;
              const maxTotal = Math.max(...week.byDay.map(d => d.total), 1);
              const barHeight = Math.max((day.total / maxTotal) * maxHeight, 4);
              const completedHeight = day.total > 0 ? (day.completed / day.total) * barHeight : 0;
              const isCurrentDay = isToday(parseISO(day.date));

              return (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-medium text-slate-400">{day.total}</span>
                  <div className="relative w-full overflow-hidden rounded-t" style={{ height: barHeight }}>
                    <div className={clsx('absolute inset-0 rounded-t', isCurrentDay ? 'bg-dental-200' : 'bg-slate-200')} />
                    {completedHeight > 0 && (
                      <div
                        className={clsx('absolute bottom-0 left-0 right-0 rounded-t', isCurrentDay ? 'bg-dental-500' : 'bg-emerald-500')}
                        style={{ height: completedHeight }}
                      />
                    )}
                  </div>
                  <span className={clsx(
                    'text-[11px] font-medium',
                    isCurrentDay ? 'font-bold text-dental-600' : 'text-slate-500'
                  )}>
                    {dayNames[i]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-slate-200" /> Total</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-emerald-500" /> Visited</span>
          </div>
        </div>
      </div>

      {/* Monthly Stats */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-slate-400">
          {format(new Date(), 'MMMM')} Overview
        </h2>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {[
            { label: 'Total', value: month.stats.total, color: 'text-slate-700 bg-slate-100' },
            { label: 'Scheduled', value: month.stats.scheduled, color: 'text-blue-700 bg-blue-100' },
            { label: 'Confirmed', value: month.stats.confirmed, color: 'text-green-700 bg-green-100' },
            { label: 'Visited', value: month.stats.completed, color: 'text-emerald-700 bg-emerald-100' },
            { label: 'Lost', value: month.stats.noShow, color: 'text-red-700 bg-red-100' },
            { label: 'Rescheduled', value: month.stats.rescheduled, color: 'text-amber-700 bg-amber-100' },
            { label: 'DNR', value: month.stats.dnr, color: 'text-orange-700 bg-orange-100' },
            { label: 'TWC', value: month.stats.twc, color: 'text-purple-700 bg-purple-100' },
          ].map((item) => (
            <div key={item.label} className={clsx('rounded-lg p-3 text-center', item.color)}>
              <p className="text-xl font-bold">{item.value}</p>
              <p className="text-[10px] font-medium">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Today's Schedule */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-slate-400">
            Today's Schedule ({today.appointments.length})
          </h2>
          <button
            onClick={() => navigate('/appointments')}
            className="flex items-center gap-1 text-xs font-medium text-dental-600 hover:text-dental-700"
          >
            View All <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <div className="max-h-80 divide-y divide-slate-50 overflow-y-auto">
          {today.appointments.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Calendar className="h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">No appointments today</p>
            </div>
          ) : (
            today.appointments.map((apt) => {
              const config = statusConfig[apt.status];
              const StatusIcon = config.icon;
              const isPast = new Date(apt.scheduledAt) < new Date();
              return (
                <div
                  key={apt.id}
                  className={clsx(
                    'flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50',
                    isPast && !['COMPLETED', 'NO_SHOW'].includes(apt.status) && 'opacity-50'
                  )}
                >
                  <div className="w-16 text-right">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatDateIST(apt.scheduledAt, 'h:mm')}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {formatDateIST(apt.scheduledAt, 'a')}
                    </p>
                  </div>
                  <div className="h-8 w-px bg-slate-200" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{apt.lead.name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="flex items-center gap-0.5">
                        <Phone className="h-3 w-3" />
                        {apt.lead.phone}
                      </span>
                      {apt.lead.treatmentInterest && (
                        <span className="flex items-center gap-0.5">
                          <Stethoscope className="h-3 w-3" />
                          {apt.lead.treatmentInterest}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={clsx(
                    'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    config.bgColor, config.color
                  )}>
                    <StatusIcon className="h-3 w-3" />
                    {config.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Upcoming Appointments - Full Width */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-slate-400">
            Upcoming Appointments ({upcoming.length})
          </h2>
          <button
            onClick={() => navigate('/appointments')}
            className="flex items-center gap-1 text-xs font-medium text-dental-600 hover:text-dental-700"
          >
            View All <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Calendar className="h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">No upcoming appointments</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">Date & Time</th>
                  <th className="px-5 py-3">Patient</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Treatment</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {upcoming.map((apt) => {
                  const config = statusConfig[apt.status];
                  const StatusIcon = config.icon;
                  return (
                    <tr key={apt.id} className="transition-colors hover:bg-slate-50">
                      <td className="whitespace-nowrap px-5 py-3">
                        <p className="font-semibold text-slate-900">{format(parseISO(apt.scheduledAt), 'MMM d, yyyy')}</p>
                        <p className="text-[11px] text-slate-400">{formatDateIST(apt.scheduledAt, 'h:mm a')}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{apt.lead.name}</p>
                      </td>
                      <td className="px-5 py-3">
                        <a href={`tel:${apt.lead.phone}`} className="flex items-center gap-1 text-slate-600 hover:text-dental-600">
                          <Phone className="h-3 w-3" />
                          {apt.lead.phone}
                        </a>
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {apt.lead.treatmentInterest || '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={clsx(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          config.bgColor, config.color
                        )}>
                          <StatusIcon className="h-3 w-3" />
                          {config.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

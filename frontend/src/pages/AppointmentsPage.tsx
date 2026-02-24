import { useEffect, useState } from 'react';
import { Calendar, Clock, MapPin, Phone, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { clsx } from 'clsx';
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay } from 'date-fns';

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
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: currentWeekStart, end: weekEnd });

  useEffect(() => {
    fetchAppointments();
  }, [currentWeekStart]);

  const fetchAppointments = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/appointments', {
        params: {
          from: currentWeekStart.toISOString(),
          to: weekEnd.toISOString(),
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

  const goToPreviousWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const goToNextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  const goToToday = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Appointments</h1>
          <p className="text-sm text-slate-500">
            {format(currentWeekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
          </p>
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
                  dayAppointments.map((apt) => (
                    <div
                      key={apt.id}
                      className={clsx(
                        'rounded-lg border p-2 text-xs cursor-pointer transition-all hover:shadow-md',
                        statusColors[apt.status] || 'bg-slate-100 text-slate-700 border-slate-200'
                      )}
                    >
                      <div className="flex items-center gap-1 font-semibold">
                        <Clock className="h-3 w-3" />
                        {format(parseISO(apt.scheduledAt), 'h:mm a')}
                      </div>
                      <p className="mt-1 font-medium truncate">{apt.lead.name}</p>
                      <p className="text-[10px] opacity-75">{apt.clinic.name}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Appointments list */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">All Appointments This Week</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {appointments.length === 0 ? (
            <div className="py-12 text-center">
              <Calendar className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-4 text-slate-500">No appointments scheduled this week</p>
            </div>
          ) : (
            appointments
              .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
              .map((apt) => (
                <div key={apt.id} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                  <div className="flex-shrink-0">
                    <div className={clsx(
                      'rounded-lg px-3 py-2 text-center',
                      statusColors[apt.status] || 'bg-slate-100'
                    )}>
                      <p className="text-xs font-medium">{format(parseISO(apt.scheduledAt), 'EEE')}</p>
                      <p className="text-lg font-bold">{format(parseISO(apt.scheduledAt), 'd')}</p>
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900">{apt.lead.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {format(parseISO(apt.scheduledAt), 'h:mm a')} ({apt.duration} min)
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {apt.clinic.name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {apt.lead.phone}
                      </span>
                    </div>
                  </div>

                  <span className={clsx(
                    'rounded-full px-3 py-1 text-xs font-medium',
                    statusColors[apt.status] || 'bg-slate-100 text-slate-700'
                  )}>
                    {apt.status.replace('_', ' ')}
                  </span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

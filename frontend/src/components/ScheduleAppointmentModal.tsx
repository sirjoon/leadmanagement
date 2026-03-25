import { useState, useEffect } from 'react';
import { X, Calendar, Clock, Loader2, Building2 } from 'lucide-react';
import { type Lead, type LeadStatus, type Clinic, useLeadStore } from '../store/leadStore';
import { useAuthStore, isAdminRole, isLeadUserRole } from '../store/authStore';
import { api } from '../api/client';

interface ScheduleAppointmentModalProps {
  lead: Lead;
  targetStatus: LeadStatus; // status to set on success (e.g. TREATMENT_STARTED)
  title?: string;
  skipStatusUpdate?: boolean; // when true, only create appointment without changing lead status
  onClose: () => void;
  onSuccess: () => void;
}

export default function ScheduleAppointmentModal({
  lead,
  targetStatus,
  title = 'Schedule Appointment',
  skipStatusUpdate,
  onClose,
  onSuccess,
}: ScheduleAppointmentModalProps) {
  const [scheduledAt, setScheduledAt] = useState('');
  const [duration, setDuration] = useState('30');
  const [notes, setNotes] = useState('');
  const [clinicId, setClinicId] = useState<string>(lead.clinicId ?? '');
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuthStore();
  const isAdmin = user?.role ? isAdminRole(user.role) : false;
  const isLeadUser = user?.role ? isLeadUserRole(user.role) : false;
  const { updateLead } = useLeadStore();

  // Sync clinicId when lead changes (e.g. when opening modal for a different lead)
  useEffect(() => {
    setClinicId(lead.clinicId ?? '');
  }, [lead.id, lead.clinicId]);

  // Fetch clinics when admin, or when Lead User and lead has no clinic (they must pick one to schedule)
  useEffect(() => {
    if (isAdmin || (isLeadUser && !lead.clinicId)) {
      api.get('/clinics').then((res) => setClinics(res.data.clinics ?? [])).catch(() => {});
    }
  }, [isAdmin, isLeadUser, lead.clinicId]);

  const effectiveClinicId =
    ((isAdmin && clinicId) || (isLeadUser && !lead.clinicId && clinicId) || lead.clinicId) ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledAt) {
      setError('Please select a date and time');
      return;
    }
    if (!effectiveClinicId) {
      setError('Please select a clinic for the appointment (or assign the lead to a clinic first).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Create appointment at the chosen clinic (admin can pick; others use lead's clinic)
      await api.post('/appointments', {
        leadId: lead.id,
        clinicId: effectiveClinicId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        duration: parseInt(duration, 10),
        notes: notes || undefined,
      });

      // Update lead status (skip if only scheduling without status change)
      if (!skipStatusUpdate) {
        await updateLead(lead.id, { status: targetStatus });
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number; data?: { message?: string } } };
      if (axiosError?.response?.status === 409) {
        setError(axiosError.response.data?.message || 'Appointment conflict at this time.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to schedule appointment');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md animate-scale-in rounded-xl bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
            <Calendar className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500">for {lead.name}</p>
          </div>
        </div>

        {/* Clinic: Admin or Lead User (when lead has no clinic) must choose clinic to schedule at */}
        {(isAdmin || (isLeadUser && !lead.clinicId)) && clinics.length > 0 ? (
          <div className="mt-3">
            <label className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700">
              <Building2 className="h-4 w-4" />
              Schedule at clinic
            </label>
            <select
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
              required
            >
              <option value="">Select clinic (e.g. RS Puram, Ganapathy)</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Choosing the clinic assigns the lead to that clinic; the lead will then move to the clinic&apos;s list.</p>
          </div>
        ) : lead.clinic ? (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Clinic: <strong>{lead.clinic.name}</strong>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700">
              <Calendar className="h-4 w-4" />
              Date & Time
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
              required
            />
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700">
              <Clock className="h-4 w-4" />
              Duration (minutes)
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
            >
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
            </select>
          </div>

          <div>
            <label className="mb-1 text-sm font-medium text-slate-700">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Appointment notes..."
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 spinner" />}
              Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

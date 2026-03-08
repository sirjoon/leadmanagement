import { useState } from 'react';
import { X, Calendar, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { formatDateInputIST } from '../utils/formatDate';

interface RescheduleModalProps {
  appointment: { id: string; scheduledAt: string };
  patientName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RescheduleModal({
  appointment,
  patientName,
  onClose,
  onSuccess,
}: RescheduleModalProps) {
  const [scheduledAt, setScheduledAt] = useState(formatDateInputIST(appointment.scheduledAt));
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledAt) {
      setError('Please select a date and time');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.patch(`/appointments/${appointment.id}`, {
        scheduledAt: new Date(scheduledAt).toISOString(),
        rescheduleReason: reason || undefined,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError?.response?.data?.message || 'Failed to reschedule appointment');
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
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
            <Calendar className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">Reschedule Appointment</h3>
            <p className="text-sm text-slate-500">for {patientName}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700">
              <Calendar className="h-4 w-4" />
              New Date & Time
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
            <label className="mb-1 text-sm font-medium text-slate-700">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for rescheduling..."
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
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 spinner" />}
              Reschedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

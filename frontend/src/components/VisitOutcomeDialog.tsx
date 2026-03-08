import { CheckCircle2, XCircle } from 'lucide-react';

interface VisitOutcomeDialogProps {
  patientName: string;
  onTreatmentAccepted: () => void;
  onTreatmentDenied: () => void;
  onClose: () => void;
}

export default function VisitOutcomeDialog({
  patientName,
  onTreatmentAccepted,
  onTreatmentDenied,
  onClose,
}: VisitOutcomeDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm animate-scale-in rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <h3 className="font-display text-lg font-bold text-slate-900">Visit Completed</h3>
        </div>

        <p className="mt-4 text-sm text-slate-600">
          What was the treatment outcome for{' '}
          <span className="font-semibold text-slate-900">{patientName}</span>?
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={onTreatmentAccepted}
            className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600"
          >
            <CheckCircle2 className="h-4 w-4" />
            Treatment Accepted
          </button>
          <button
            onClick={onTreatmentDenied}
            className="flex items-center justify-center gap-2 rounded-lg bg-rose-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-600"
          >
            <XCircle className="h-4 w-4" />
            Treatment Denied
          </button>
        </div>
      </div>
    </div>
  );
}

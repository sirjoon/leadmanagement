import { PhoneOff, X } from 'lucide-react';

interface DNRConfirmDialogProps {
  patientName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DNRConfirmDialog({ patientName, onConfirm, onCancel }: DNRConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-sm animate-scale-in rounded-xl bg-white p-6 shadow-xl">
        <button
          onClick={onCancel}
          className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
            <PhoneOff className="h-5 w-5 text-orange-600" />
          </div>
          <h3 className="font-display text-lg font-bold text-slate-900">Move to DNR</h3>
        </div>

        <p className="mt-4 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{patientName}</span> will be moved to
          DNR (Do Not Return). Do you want to move now or make some changes first?
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            No, Go Back
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            <PhoneOff className="h-4 w-4" />
            Yes, Move to DNR
          </button>
        </div>
      </div>
    </div>
  );
}

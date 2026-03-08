import { XCircle } from 'lucide-react';

export default function TreatmentDeniedPage() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-2xl">
        <XCircle className="h-8 w-8 text-rose-600" />
      </div>
      <h3 className="mt-4 font-semibold text-slate-900">Treatment Denied</h3>
      <p className="mt-1 text-sm text-slate-500">Coming soon — patients who denied treatment</p>
    </div>
  );
}

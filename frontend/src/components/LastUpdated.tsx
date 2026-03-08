import { RefreshCw } from 'lucide-react';

interface LastUpdatedProps {
  text: string;
  onRefresh: () => void;
}

export default function LastUpdated({ text, onRefresh }: LastUpdatedProps) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-400">
      <span>Updated {text}</span>
      <button
        onClick={onRefresh}
        className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-600"
        title="Refresh now"
      >
        <RefreshCw className="h-3 w-3" />
      </button>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useLeadStore, type LeadStatus, type Priority, type LeadSource } from '../store/leadStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../api/client';
import { clsx } from 'clsx';

interface FilterPanelProps {
  onClose: () => void;
}

interface Clinic {
  id: string;
  name: string;
  slug: string;
}

const statuses: { value: LeadStatus; label: string; icon: string }[] = [
  { value: 'NEW', label: 'New', icon: '📋' },
  { value: 'ATTEMPTING', label: 'Attempting', icon: '📞' },
  { value: 'CONNECTED', label: 'Connected', icon: '✓' },
  { value: 'APPOINTMENT_BOOKED', label: 'Booked', icon: '📅' },
  { value: 'VISITED', label: 'Visited', icon: '🏥' },
  { value: 'TREATMENT_STARTED', label: 'Treatment', icon: '⚕️' },
  { value: 'LOST', label: 'Lost', icon: '❌' },
];

const priorities: { value: Priority; label: string; icon: string }[] = [
  { value: 'HOT', label: 'Hot', icon: '🔥' },
  { value: 'WARM', label: 'Warm', icon: '♨️' },
  { value: 'COLD', label: 'Cold', icon: '🧊' },
  { value: 'NEW', label: 'New', icon: '📋' },
];

const sources: { value: LeadSource; label: string }[] = [
  { value: 'META_ADS', label: 'Meta Ads' },
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
  { value: 'ORGANIC', label: 'Organic' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'IVR', label: 'IVR' },
  { value: 'OTHER', label: 'Other' },
];

export default function FilterPanel({ onClose }: FilterPanelProps) {
  const { filters, setFilters, fetchLeads, clearFilters } = useLeadStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [localFilters, setLocalFilters] = useState(filters);

  useEffect(() => {
    if (isAdmin) {
      api.get('/clinics').then((res) => {
        setClinics(res.data.clinics);
      });
    }
  }, [isAdmin]);

  const handleApply = () => {
    setFilters(localFilters);
    fetchLeads({ ...localFilters, page: 1 });
    onClose();
  };

  const handleClear = () => {
    clearFilters();
    fetchLeads();
    onClose();
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm animate-slide-down">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Filters</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Status */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Status</label>
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <button
                key={status.value}
                onClick={() => setLocalFilters((prev) => ({
                  ...prev,
                  status: prev.status === status.value ? undefined : status.value,
                }))}
                className={clsx(
                  'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  localFilters.status === status.value
                    ? 'bg-dental-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                <span>{status.icon}</span>
                {status.label}
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Priority</label>
          <div className="flex flex-wrap gap-2">
            {priorities.map((priority) => (
              <button
                key={priority.value}
                onClick={() => setLocalFilters((prev) => ({
                  ...prev,
                  priority: prev.priority === priority.value ? undefined : priority.value,
                }))}
                className={clsx(
                  'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  localFilters.priority === priority.value
                    ? 'bg-dental-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                <span>{priority.icon}</span>
                {priority.label}
              </button>
            ))}
          </div>
        </div>

        {/* Source */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Source</label>
          <select
            value={localFilters.source || ''}
            onChange={(e) => setLocalFilters((prev) => ({
              ...prev,
              source: e.target.value as LeadSource || undefined,
            }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none"
          >
            <option value="">All sources</option>
            {sources.map((source) => (
              <option key={source.value} value={source.value}>
                {source.label}
              </option>
            ))}
          </select>
        </div>

        {/* Clinic (Admin only) */}
        {isAdmin && (
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Clinic</label>
            <select
              value={localFilters.clinicId || ''}
              onChange={(e) => setLocalFilters((prev) => ({
                ...prev,
                clinicId: e.target.value || undefined,
              }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none"
            >
              <option value="">All clinics</option>
              {clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>
                  {clinic.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Follow-up Date Range */}
        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">Follow-up Date</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={localFilters.followUpFrom?.split('T')[0] || ''}
              onChange={(e) => setLocalFilters((prev) => ({
                ...prev,
                followUpFrom: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined,
              }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={localFilters.followUpTo?.split('T')[0] || ''}
              onChange={(e) => setLocalFilters((prev) => ({
                ...prev,
                followUpTo: e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined,
              }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Sort */}
        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">Sort By</label>
          <div className="flex gap-2">
            <select
              value={localFilters.sortBy || 'createdAt'}
              onChange={(e) => setLocalFilters((prev) => ({
                ...prev,
                sortBy: e.target.value as typeof filters.sortBy,
              }))}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none"
            >
              <option value="createdAt">Created Date</option>
              <option value="followUpDate">Follow-up Date</option>
              <option value="updatedAt">Last Updated</option>
              <option value="name">Name</option>
            </select>
            <select
              value={localFilters.sortOrder || 'desc'}
              onChange={(e) => setLocalFilters((prev) => ({
                ...prev,
                sortOrder: e.target.value as 'asc' | 'desc',
              }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none"
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={handleClear}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear All
        </button>
        <button
          onClick={handleApply}
          className="rounded-lg bg-dental-500 px-4 py-2 text-sm font-medium text-white hover:bg-dental-600"
        >
          Apply Filters
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useLeadStore, type LeadSource } from '../store/leadStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../api/client';
import { clsx } from 'clsx';

interface CreateLeadModalProps {
  onClose: () => void;
}

interface Clinic {
  id: string;
  name: string;
  slug: string;
}

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

const treatments = [
  'Braces',
  'Aligners',
  'Implants',
  'Whitening',
  'Root Canal',
  'Extraction',
  'Cleaning',
  'Consultation',
  'Pediatric',
  'Other',
];

export default function CreateLeadModal({ onClose }: CreateLeadModalProps) {
  const { createLead, fetchLeads } = useLeadStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    age: '',
    source: 'OTHER' as LeadSource,
    treatmentInterest: '',
    clinicId: '',
    followUpDate: '',
    nextAction: '',
  });

  useEffect(() => {
    // Fetch clinics
    api.get('/clinics').then((res) => {
      setClinics(res.data.clinics);
      // Auto-select first clinic for clinic staff
      if (!isAdmin && res.data.clinics.length > 0) {
        setFormData((prev) => ({ ...prev, clinicId: res.data.clinics[0].id }));
      }
    });
  }, [isAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await createLead({
        name: formData.name,
        phone: formData.phone,
        email: formData.email || undefined,
        age: formData.age ? parseInt(formData.age, 10) : undefined,
        source: formData.source,
        treatmentInterest: formData.treatmentInterest || undefined,
        clinicId: formData.clinicId || undefined,
        followUpDate: formData.followUpDate || undefined,
        nextAction: formData.nextAction || undefined,
      });

      await fetchLeads();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lead');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg animate-scale-in rounded-xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-slate-900">Add New Lead</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Name */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                placeholder="Patient name"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                placeholder="9876543210"
              />
            </div>

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                placeholder="patient@email.com"
              />
            </div>

            {/* Age */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Age
              </label>
              <input
                type="number"
                name="age"
                value={formData.age}
                onChange={handleChange}
                min="1"
                max="120"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                placeholder="25"
              />
            </div>

            {/* Source */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Lead Source
              </label>
              <select
                name="source"
                value={formData.source}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
              >
                {sources.map((source) => (
                  <option key={source.value} value={source.value}>
                    {source.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Treatment Interest */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Treatment Interest
              </label>
              <select
                name="treatmentInterest"
                value={formData.treatmentInterest}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
              >
                <option value="">Select treatment</option>
                {treatments.map((treatment) => (
                  <option key={treatment} value={treatment.toLowerCase()}>
                    {treatment}
                  </option>
                ))}
              </select>
            </div>

            {/* Clinic (Admin only) */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Assign to Clinic
              </label>
              <select
                name="clinicId"
                value={formData.clinicId}
                onChange={handleChange}
                disabled={!isAdmin}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20 disabled:bg-slate-50"
              >
                <option value="">Unassigned (TBD)</option>
                {clinics.map((clinic) => (
                  <option key={clinic.id} value={clinic.id}>
                    {clinic.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Follow-up Date */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Follow-up Date
              </label>
              <input
                type="datetime-local"
                name="followUpDate"
                value={formData.followUpDate}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
              />
            </div>

            {/* Next Action */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Next Action
              </label>
              <input
                type="text"
                name="nextAction"
                value={formData.nextAction}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                placeholder="e.g., Call to confirm appointment"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
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
              className={clsx(
                'rounded-lg px-4 py-2 text-sm font-medium text-white',
                isSubmitting
                  ? 'cursor-not-allowed bg-dental-400'
                  : 'bg-dental-500 hover:bg-dental-600'
              )}
            >
              {isSubmitting ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

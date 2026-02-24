import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, MessageSquare, Calendar, MapPin, Clock, Edit2 } from 'lucide-react';
import { useLeadStore } from '../store/leadStore';
import { format, parseISO } from 'date-fns';
import NoteThread from '../components/NoteThread';

export default function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentLead, fetchLead, isLoading } = useLeadStore();

  useEffect(() => {
    if (id) {
      fetchLead(id);
    }
  }, [id, fetchLead]);

  if (isLoading || !currentLead) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-dental-200 border-t-dental-500 spinner" />
          <p className="text-slate-500">Loading lead...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to leads
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{currentLead.name}</h1>
          <p className="mt-1 text-slate-500">{currentLead.phone}</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Edit2 className="h-4 w-4" />
          Edit
        </button>
      </div>

      {/* Details grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Contact card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 font-semibold text-slate-900">Contact Information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-400 uppercase">Phone</p>
                <p className="mt-1 font-medium text-slate-900">{currentLead.phone}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Email</p>
                <p className="mt-1 font-medium text-slate-900">{currentLead.email || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Age</p>
                <p className="mt-1 font-medium text-slate-900">{currentLead.age || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Treatment Interest</p>
                <p className="mt-1 font-medium text-slate-900 capitalize">
                  {currentLead.treatmentInterest || '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <NoteThread leadId={currentLead.id} notes={currentLead.notes || []} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 font-semibold text-slate-900">Status</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-400 uppercase">Current Status</p>
                <span className="mt-1 inline-flex rounded-full bg-dental-100 px-3 py-1 text-sm font-medium text-dental-700">
                  {currentLead.status.replace('_', ' ')}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Priority</p>
                <span className="mt-1 inline-flex rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-700">
                  {currentLead.priority}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Source</p>
                <p className="mt-1 font-medium text-slate-900">{currentLead.source.replace('_', ' ')}</p>
              </div>
            </div>
          </div>

          {/* Timeline card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 font-semibold text-slate-900">Timeline</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-400 uppercase">Follow-up</p>
                <p className="mt-1 font-medium text-slate-900">
                  {currentLead.followUpDate 
                    ? format(parseISO(currentLead.followUpDate), 'PPP p')
                    : 'Not scheduled'
                  }
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Last Contact</p>
                <p className="mt-1 font-medium text-slate-900">
                  {currentLead.lastContactedAt 
                    ? format(parseISO(currentLead.lastContactedAt), 'PPP')
                    : 'Never'
                  }
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Created</p>
                <p className="mt-1 font-medium text-slate-900">
                  {format(parseISO(currentLead.createdAt), 'PPP')}
                </p>
              </div>
            </div>
          </div>

          {/* Clinic card */}
          {currentLead.clinic && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 font-semibold text-slate-900">Assigned Clinic</h2>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dental-100">
                  <MapPin className="h-5 w-5 text-dental-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">{currentLead.clinic.name}</p>
                  <p className="text-sm text-slate-500">{currentLead.clinic.slug}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

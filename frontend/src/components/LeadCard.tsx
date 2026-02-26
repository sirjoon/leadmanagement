import { useState, useEffect } from 'react';
import {
  Phone,
  MessageSquare,
  Calendar,
  MapPin,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit2,
  Save,
  X,
  Building2,
  CalendarPlus,
  Check,
  Trash2,
} from 'lucide-react';
import { type Lead, type LeadStatus, type Priority, type LeadSource, useLeadStore } from '../store/leadStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../api/client';
import { clsx } from 'clsx';
import { format, parseISO, isToday, isPast } from 'date-fns';
import NoteThread from './NoteThread';

// Status badge colors
const statusColors: Record<LeadStatus, string> = {
  NEW: 'bg-purple-100 text-purple-700 ring-purple-500/20',
  ATTEMPTING: 'bg-yellow-100 text-yellow-700 ring-yellow-500/20',
  CONNECTED: 'bg-blue-100 text-blue-700 ring-blue-500/20',
  APPOINTMENT_BOOKED: 'bg-emerald-100 text-emerald-700 ring-emerald-500/20',
  VISITED: 'bg-green-100 text-green-700 ring-green-500/20',
  TREATMENT_STARTED: 'bg-teal-100 text-teal-700 ring-teal-500/20',
  RESCHEDULED: 'bg-orange-100 text-orange-700 ring-orange-500/20',
  LOST: 'bg-red-100 text-red-700 ring-red-500/20',
  DNC: 'bg-gray-100 text-gray-600 ring-gray-500/20',
  DNR: 'bg-gray-200 text-gray-700 ring-gray-500/20',
};

const statusLabels: Record<LeadStatus, string> = {
  NEW: 'New',
  ATTEMPTING: 'Attempting',
  CONNECTED: 'Connected',
  APPOINTMENT_BOOKED: 'Booked',
  VISITED: 'Visited',
  TREATMENT_STARTED: 'Treatment',
  RESCHEDULED: 'Rescheduled',
  LOST: 'Lost',
  DNC: 'DNC',
  DNR: 'DNR',
};

// All statuses for admin, limited for clinic staff
const adminStatuses: LeadStatus[] = [
  'NEW', 'ATTEMPTING', 'CONNECTED', 'APPOINTMENT_BOOKED', 'VISITED',
  'TREATMENT_STARTED', 'RESCHEDULED', 'LOST', 'DNC', 'DNR',
];

const staffStatuses: LeadStatus[] = [
  'NEW', 'ATTEMPTING', 'CONNECTED', 'APPOINTMENT_BOOKED', 'VISITED',
  'TREATMENT_STARTED', 'RESCHEDULED', 'LOST',
];

// Priority styles
const priorityStyles: Record<Priority, { bg: string; icon: string; label: string }> = {
  HOT: { bg: 'bg-red-500', icon: '🔥', label: 'Hot' },
  WARM: { bg: 'bg-orange-400', icon: '♨️', label: 'Warm' },
  COLD: { bg: 'bg-blue-400', icon: '🧊', label: 'Cold' },
  NEW: { bg: 'bg-purple-500', icon: '📋', label: 'New' },
  APPOINTMENT: { bg: 'bg-emerald-500', icon: '📅', label: 'Appointment' },
  VISITED: { bg: 'bg-green-500', icon: '✅', label: 'Visited' },
};

const allPriorities: Priority[] = ['HOT', 'WARM', 'COLD', 'NEW', 'APPOINTMENT', 'VISITED'];

// Source labels
const sourceLabels: Record<string, string> = {
  META_ADS: 'Meta Ads',
  GOOGLE_ADS: 'Google',
  ORGANIC: 'Organic',
  WHATSAPP: 'WhatsApp',
  REFERRAL: 'Referral',
  WALK_IN: 'Walk-in',
  IVR: 'IVR',
  OTHER: 'Other',
};

const allSources: { value: LeadSource; label: string }[] = [
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
  'braces', 'aligners', 'implants', 'whitening', 'root_canal',
  'extraction', 'cleaning', 'consultation', 'pediatric', 'other',
];

interface Clinic {
  id: string;
  name: string;
  slug: string;
}

interface LeadCardProps {
  lead: Lead;
  index: number;
  onSelect: () => void;
}

export default function LeadCard({ lead, index, onSelect: _onSelect }: LeadCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingData, setBookingData] = useState({
    scheduledAt: '',
    duration: '30',
    notes: '',
  });
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [leadAppointments, setLeadAppointments] = useState<Array<{
    id: string;
    scheduledAt: string;
    duration: number;
    status: string;
    notes: string | null;
    clinic: { name: string };
  }>>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { updateLead, assignLead, deleteLead, fetchLeads } = useLeadStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  // Edit form state
  const [editData, setEditData] = useState({
    name: lead.name,
    phone: lead.phone,
    email: lead.email || '',
    age: lead.age?.toString() || '',
    treatmentInterest: lead.treatmentInterest || '',
    source: lead.source,
    followUpDate: lead.followUpDate
      ? format(parseISO(lead.followUpDate), "yyyy-MM-dd'T'HH:mm")
      : '',
    nextAction: lead.nextAction || '',
    clinicId: lead.clinicId || '',
    priority: lead.priority,
  });

  // Fetch clinics when expanding (for clinic assignment)
  useEffect(() => {
    if (isExpanded && isAdmin && clinics.length === 0) {
      api.get('/clinics').then((res) => {
        setClinics(res.data.clinics);
      }).catch(() => {});
    }
  }, [isExpanded, isAdmin, clinics.length]);

  // Fetch appointments for this lead when expanding
  const fetchLeadAppointments = () => {
    api.get('/appointments', { params: { leadId: lead.id } }).then((res) => {
      setLeadAppointments(res.data.appointments);
    }).catch(() => {});
  };

  useEffect(() => {
    if (isExpanded) {
      fetchLeadAppointments();
    }
  }, [isExpanded]);

  // Reset edit data when lead changes
  useEffect(() => {
    setEditData({
      name: lead.name,
      phone: lead.phone,
      email: lead.email || '',
      age: lead.age?.toString() || '',
      treatmentInterest: lead.treatmentInterest || '',
      source: lead.source,
      followUpDate: lead.followUpDate
        ? format(parseISO(lead.followUpDate), "yyyy-MM-dd'T'HH:mm")
        : '',
      nextAction: lead.nextAction || '',
      clinicId: lead.clinicId || '',
      priority: lead.priority,
    });
  }, [lead]);

  const getFollowUpBadge = () => {
    if (!lead.followUpDate) {
      return null;
    }

    const date = parseISO(lead.followUpDate);
    if (isPast(date) && !isToday(date)) {
      return (
        <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          <Clock className="h-3 w-3" />
          Overdue
        </span>
      );
    }
    if (isToday(date)) {
      return (
        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          <Clock className="h-3 w-3" />
          Today
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs text-slate-500">
        <Calendar className="h-3 w-3" />
        {format(date, 'MMM d')}
      </span>
    );
  };

  const handleQuickCall = () => {
    window.open(`tel:${lead.phone}`, '_self');
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/91${lead.phone.replace(/\D/g, '')}`, '_blank');
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditError(null);
  };

  const handleDeleteLead = async () => {
    setIsDeleting(true);
    try {
      await deleteLead(lead.id);
    } catch {
      setEditError('Failed to delete lead');
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditError(null);
    // Reset form data
    setEditData({
      name: lead.name,
      phone: lead.phone,
      email: lead.email || '',
      age: lead.age?.toString() || '',
      treatmentInterest: lead.treatmentInterest || '',
      source: lead.source,
      followUpDate: lead.followUpDate
        ? format(parseISO(lead.followUpDate), "yyyy-MM-dd'T'HH:mm")
        : '',
      nextAction: lead.nextAction || '',
      clinicId: lead.clinicId || '',
      priority: lead.priority,
    });
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    setEditError(null);

    try {
      const updatePayload: Record<string, unknown> = {};

      // Only send changed fields
      if (editData.name !== lead.name) updatePayload.name = editData.name;
      if (editData.phone !== lead.phone) updatePayload.phone = editData.phone;
      if (editData.email !== (lead.email || '')) updatePayload.email = editData.email || undefined;
      if (editData.age !== (lead.age?.toString() || '')) {
        updatePayload.age = editData.age ? parseInt(editData.age, 10) : undefined;
      }
      if (editData.treatmentInterest !== (lead.treatmentInterest || '')) {
        updatePayload.treatmentInterest = editData.treatmentInterest || undefined;
      }
      if (editData.source !== lead.source) updatePayload.source = editData.source;
      if (editData.priority !== lead.priority) updatePayload.priority = editData.priority;
      if (editData.nextAction !== (lead.nextAction || '')) {
        updatePayload.nextAction = editData.nextAction || undefined;
      }

      // Handle follow-up date
      const currentFollowUp = lead.followUpDate
        ? format(parseISO(lead.followUpDate), "yyyy-MM-dd'T'HH:mm")
        : '';
      if (editData.followUpDate !== currentFollowUp) {
        updatePayload.followUpDate = editData.followUpDate
          ? new Date(editData.followUpDate).toISOString()
          : null;
      }

      // Handle clinic assignment separately
      if (editData.clinicId !== (lead.clinicId || '')) {
        if (editData.clinicId) {
          await assignLead(lead.id, editData.clinicId);
        } else {
          updatePayload.clinicId = null;
        }
      }

      // Only call updateLead if there are changes beyond clinicId
      if (Object.keys(updatePayload).length > 0) {
        await updateLead(lead.id, updatePayload as Partial<Lead>);
      }

      await fetchLeads();
      setIsEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (status: LeadStatus) => {
    try {
      await updateLead(lead.id, { status });
      await fetchLeads();
    } catch {
      // Error handled by store
    }
  };

  const handlePriorityChange = async (priority: Priority) => {
    try {
      await updateLead(lead.id, { priority });
      await fetchLeads();
    } catch {
      // Error handled by store
    }
  };

  const handleClinicAssign = async (clinicId: string) => {
    try {
      if (clinicId) {
        await assignLead(lead.id, clinicId);
      } else {
        await updateLead(lead.id, { clinicId: null } as Partial<Lead>);
      }
      await fetchLeads();
    } catch {
      // Error handled by store
    }
  };

  const handleFollowUpChange = async (dateStr: string) => {
    try {
      await updateLead(lead.id, {
        followUpDate: dateStr ? new Date(dateStr).toISOString() : null
      } as Partial<Lead>);
      await fetchLeads();
    } catch {
      // Error handled by store
    }
  };

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setEditData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleBookAppointment = async () => {
    if (!bookingData.scheduledAt) return;
    setIsBooking(true);
    setEditError(null);

    try {
      const clinicId = lead.clinicId;
      if (!clinicId) {
        setEditError('Lead must be assigned to a clinic before booking');
        setIsBooking(false);
        return;
      }

      await api.post('/appointments', {
        leadId: lead.id,
        clinicId,
        scheduledAt: new Date(bookingData.scheduledAt).toISOString(),
        duration: parseInt(bookingData.duration, 10),
        notes: bookingData.notes || undefined,
      });

      setBookingSuccess(true);
      setShowBooking(false);
      setBookingData({ scheduledAt: '', duration: '30', notes: '' });
      fetchLeadAppointments();
      await fetchLeads();

      // Clear success after 3 seconds
      setTimeout(() => setBookingSuccess(false), 3000);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to book appointment');
    } finally {
      setIsBooking(false);
    }
  };

  const availableStatuses = isAdmin ? adminStatuses : staffStatuses;

  return (
    <div
      className={clsx(
        'group rounded-xl border border-slate-200 bg-white shadow-soft transition-all duration-200 hover:shadow-md',
        'animate-in'
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Main row */}
      <div className="flex items-center gap-4 p-4">
        {/* Priority indicator */}
        <div
          className={clsx(
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-lg',
            priorityStyles[lead.priority]?.bg || 'bg-slate-200'
          )}
          title={lead.priority}
        >
          {priorityStyles[lead.priority]?.icon || '📋'}
        </div>

        {/* Lead info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-slate-900">{lead.name}</h3>
            <span className={clsx(
              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
              statusColors[lead.status]
            )}>
              {statusLabels[lead.status]}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {lead.phone}
            </span>
            {lead.clinic && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {lead.clinic.name}
              </span>
            )}
            {!lead.clinic && isAdmin && (
              <span className="flex items-center gap-1 text-amber-600">
                <Building2 className="h-3.5 w-3.5" />
                Unassigned
              </span>
            )}
            {lead.treatmentInterest && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                {lead.treatmentInterest}
              </span>
            )}
          </div>
        </div>

        {/* Right side - badges and actions */}
        <div className="flex items-center gap-3">
          {/* Source badge */}
          <span className="hidden text-xs text-slate-400 sm:block">
            {sourceLabels[lead.source] || lead.source}
          </span>

          {/* Follow-up badge */}
          {getFollowUpBadge()}

          {/* Notes count */}
          {lead._count?.notes && lead._count.notes > 0 && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <MessageSquare className="h-3.5 w-3.5" />
              {lead._count.notes}
            </span>
          )}

          {/* Quick actions */}
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={handleQuickCall}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Call"
            >
              <Phone className="h-4 w-4" />
            </button>
            <button
              onClick={handleWhatsApp}
              className="rounded-lg p-2 text-slate-400 hover:bg-green-100 hover:text-green-600"
              title="WhatsApp"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>

          {/* Expand button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            {isExpanded ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-slate-100 animate-slide-down">

          {/* Edit error banner */}
          {editError && (
            <div className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {editError}
            </div>
          )}

          {/* Lead details — view or edit mode */}
          {isEditing ? (
            /* ─── EDIT MODE ─── */
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Edit Lead</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancelEdit}
                    className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                    className={clsx(
                      'flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white',
                      isSaving ? 'bg-dental-400 cursor-not-allowed' : 'bg-dental-500 hover:bg-dental-600'
                    )}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {/* Name */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
                  <input
                    type="text"
                    name="name"
                    value={editData.name}
                    onChange={handleEditChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={editData.phone}
                    onChange={handleEditChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={editData.email}
                    onChange={handleEditChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                    placeholder="patient@email.com"
                  />
                </div>

                {/* Age */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Age</label>
                  <input
                    type="number"
                    name="age"
                    value={editData.age}
                    onChange={handleEditChange}
                    min="1"
                    max="120"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                  />
                </div>

                {/* Treatment Interest */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Treatment Interest</label>
                  <select
                    name="treatmentInterest"
                    value={editData.treatmentInterest}
                    onChange={handleEditChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                  >
                    <option value="">Select treatment</option>
                    {treatments.map((t) => (
                      <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>

                {/* Source */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Source</label>
                  <select
                    name="source"
                    value={editData.source}
                    onChange={handleEditChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                  >
                    {allSources.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Follow-up Date */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Follow-up Date</label>
                  <input
                    type="datetime-local"
                    name="followUpDate"
                    value={editData.followUpDate}
                    onChange={handleEditChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                  />
                </div>

                {/* Clinic Assignment (Admin only) */}
                {isAdmin && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Assign to Clinic</label>
                    <select
                      name="clinicId"
                      value={editData.clinicId}
                      onChange={handleEditChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                    >
                      <option value="">Unassigned (TBD)</option>
                      {clinics.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Next Action */}
                <div className={isAdmin ? '' : 'sm:col-span-2'}>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Next Action</label>
                  <input
                    type="text"
                    name="nextAction"
                    value={editData.nextAction}
                    onChange={handleEditChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                    placeholder="e.g., Call to confirm appointment"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* ─── VIEW MODE ─── */
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Lead Details</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleStartEdit}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:border-dental-300 hover:text-dental-600"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Delete confirmation */}
              {showDeleteConfirm && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-700">Delete this lead?</p>
                  <p className="mt-1 text-xs text-red-500">This will remove "{lead.name}" from the system.</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={handleDeleteLead}
                      disabled={isDeleting}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Contact</p>
                  <p className="mt-1 text-sm text-slate-900">{lead.phone}</p>
                  {lead.email && <p className="text-sm text-slate-500">{lead.email}</p>}
                  {lead.age && <p className="text-sm text-slate-500">{lead.age} years old</p>}
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Source</p>
                  <p className="mt-1 text-sm text-slate-900">{sourceLabels[lead.source] || lead.source}</p>
                  {lead.campaignName && (
                    <p className="text-sm text-slate-500">{lead.campaignName}</p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Follow-up</p>
                  <p className="mt-1 text-sm text-slate-900">
                    {lead.followUpDate
                      ? format(parseISO(lead.followUpDate), 'PPP')
                      : 'Not scheduled'
                    }
                  </p>
                  {lead.nextAction && (
                    <p className="text-sm text-slate-500">{lead.nextAction}</p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Last Contact</p>
                  <p className="mt-1 text-sm text-slate-900">
                    {lead.lastContactedAt
                      ? format(parseISO(lead.lastContactedAt), 'PPP')
                      : 'Never'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Quick inline controls (view mode only) */}
          {!isEditing && (
            <div className="border-t border-slate-100 p-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Clinic assignment — Admin only */}
                {isAdmin && (
                  <>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Clinic</p>
                    <select
                      value={lead.clinicId || ''}
                      onChange={(e) => handleClinicAssign(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                    >
                      <option value="">Unassigned (TBD)</option>
                      {clinics.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </>
                )}

                {/* Clinic display — Staff only (read-only) */}
                {!isAdmin && lead.clinic && (
                  <>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Clinic</p>
                    <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
                      <Building2 className="h-3.5 w-3.5 text-dental-500" />
                      {lead.clinic.name}
                    </span>
                  </>
                )}

                <div className="ml-auto flex items-center gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Follow-up</p>
                  <input
                    type="datetime-local"
                    value={lead.followUpDate ? format(parseISO(lead.followUpDate), "yyyy-MM-dd'T'HH:mm") : ''}
                    onChange={(e) => handleFollowUpChange(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Appointments section */}
          {!isEditing && (
            <div className="border-t border-emerald-100 bg-emerald-50/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-emerald-700">
                  <Calendar className="h-3.5 w-3.5" />
                  Appointments
                  {leadAppointments.length > 0 && (
                    <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      {leadAppointments.length}
                    </span>
                  )}
                </p>
                {!showBooking && (
                  <button
                    onClick={() => setShowBooking(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Book Appointment
                  </button>
                )}
              </div>

              {bookingSuccess && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-green-100 px-3 py-2 text-sm text-green-700">
                  <Check className="h-4 w-4" />
                  Appointment booked successfully!
                </div>
              )}

              {/* Existing appointments */}
              {leadAppointments.length > 0 && (
                <div className="mb-3 space-y-2">
                  {leadAppointments.map((apt) => (
                    <div
                      key={apt.id}
                      className={clsx(
                        'flex items-center gap-3 rounded-lg border p-2.5 text-sm',
                        apt.status === 'CANCELLED' || apt.status === 'NO_SHOW'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : apt.status === 'COMPLETED'
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : 'border-emerald-200 bg-white text-slate-700'
                      )}
                    >
                      <div className="flex items-center gap-1.5 font-medium">
                        <Clock className="h-3.5 w-3.5" />
                        {format(parseISO(apt.scheduledAt), 'MMM d, yyyy')}
                        <span className="text-slate-400">at</span>
                        {format(parseISO(apt.scheduledAt), 'h:mm a')}
                      </div>
                      <span className="text-xs text-slate-400">({apt.duration} min)</span>
                      <span className={clsx(
                        'ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                        apt.status === 'SCHEDULED' && 'bg-blue-100 text-blue-700',
                        apt.status === 'CONFIRMED' && 'bg-green-100 text-green-700',
                        apt.status === 'COMPLETED' && 'bg-emerald-100 text-emerald-700',
                        apt.status === 'CANCELLED' && 'bg-red-100 text-red-700',
                        apt.status === 'NO_SHOW' && 'bg-orange-100 text-orange-700',
                        apt.status === 'RESCHEDULED' && 'bg-yellow-100 text-yellow-700',
                      )}>
                        {apt.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {leadAppointments.length === 0 && !showBooking && (
                <p className="text-sm text-slate-400">No appointments booked yet.</p>
              )}

              {/* Booking form */}
              {showBooking && (
                <div className="rounded-lg border border-emerald-200 bg-white p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">New Appointment</p>
                    <button
                      onClick={() => {
                        setShowBooking(false);
                        setBookingData({ scheduledAt: '', duration: '30', notes: '' });
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Appointment Date & Time <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={bookingData.scheduledAt}
                        onChange={(e) => setBookingData((prev) => ({ ...prev, scheduledAt: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Duration</label>
                      <select
                        value={bookingData.duration}
                        onChange={(e) => setBookingData((prev) => ({ ...prev, duration: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="15">15 min</option>
                        <option value="30">30 min</option>
                        <option value="45">45 min</option>
                        <option value="60">1 hour</option>
                        <option value="90">1.5 hours</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Notes</label>
                      <input
                        type="text"
                        value={bookingData.notes}
                        onChange={(e) => setBookingData((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="e.g., Consultation"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setShowBooking(false);
                        setBookingData({ scheduledAt: '', duration: '30', notes: '' });
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBookAppointment}
                      disabled={!bookingData.scheduledAt || isBooking}
                      className={clsx(
                        'flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white',
                        !bookingData.scheduledAt || isBooking
                          ? 'cursor-not-allowed bg-emerald-400'
                          : 'bg-emerald-500 hover:bg-emerald-600'
                      )}
                    >
                      <CalendarPlus className="h-3.5 w-3.5" />
                      {isBooking ? 'Booking...' : 'Book Appointment'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Priority quick change */}
          <div className="border-t border-slate-100 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Priority</p>
            <div className="flex flex-wrap gap-2">
              {allPriorities.map((priority) => (
                <button
                  key={priority}
                  onClick={() => handlePriorityChange(priority)}
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    lead.priority === priority
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {priorityStyles[priority].icon} {priorityStyles[priority].label}
                </button>
              ))}
            </div>
          </div>

          {/* Status quick change */}
          <div className="border-t border-slate-100 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Quick Status Change</p>
            <div className="flex flex-wrap gap-2">
              {availableStatuses.map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    lead.status === status
                      ? statusColors[status] + ' ring-1 ring-inset'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {statusLabels[status]}
                </button>
              ))}
            </div>
          </div>

          {/* Notes thread */}
          <div className="border-t border-slate-100">
            <NoteThread leadId={lead.id} notes={lead.notes || []} />
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import {
  Phone,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  MapPin,
  Clock,
  Calendar,
  FileText,
  Loader2,
} from 'lucide-react';
import { type Lead, type LeadStatus, useLeadStore } from '../store/leadStore';
import { clsx } from 'clsx';
import { parseISO, isPast, isToday } from 'date-fns';
import { formatDateIST, formatDateInputIST } from '../utils/formatDate';
import NoteThread from './NoteThread';
import DNRConfirmDialog from './DNRConfirmDialog';

const statusLabels: Record<string, string> = {
  VISITED: 'Visited',
  TREATMENT_STARTED: 'Treatment',
  TREATMENT_DENIED: 'Tx Denied',
  LOST: 'Lost',
  DNR: 'DNR',
  DNC: 'DNC',
  TWC: 'TWC',
  RESCHEDULED: 'Rescheduled',
};

const statusColors: Record<string, string> = {
  VISITED: 'bg-green-100 text-green-700 ring-green-500/20',
  TREATMENT_STARTED: 'bg-teal-100 text-teal-700 ring-teal-500/20',
  TREATMENT_DENIED: 'bg-rose-100 text-rose-700 ring-rose-500/20',
  LOST: 'bg-red-100 text-red-700 ring-red-500/20',
  DNR: 'bg-gray-200 text-gray-700 ring-gray-500/20',
  DNC: 'bg-gray-100 text-gray-600 ring-gray-500/20',
  TWC: 'bg-cyan-100 text-cyan-700 ring-cyan-500/20',
  RESCHEDULED: 'bg-orange-100 text-orange-700 ring-orange-500/20',
};

export interface PatientAction {
  label: string;
  status: LeadStatus;
  color: string; // tailwind classes for button
  icon?: React.ReactNode;
  requiresConfirm?: boolean;
}

export interface NextAppointmentInfo {
  id: string;
  scheduledAt: string;
  status: string;
}

interface PatientCardProps {
  lead: Lead;
  index: number;
  actions: PatientAction[];
  onAction: (lead: Lead, action: PatientAction) => void;
  onScheduleAppointment?: (lead: Lead) => void;
  nextAppointment?: NextAppointmentInfo;
  onReschedule?: (appt: NextAppointmentInfo) => void;
}

export default function PatientCard({ lead, index, actions, onAction, onScheduleAppointment, nextAppointment, onReschedule }: PatientCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDNRConfirm, setShowDNRConfirm] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState(
    lead.followUpDate ? formatDateInputIST(lead.followUpDate) : ''
  );
  const [treatmentPlan, setTreatmentPlan] = useState(lead.treatmentPlan || '');
  const [treatmentNotes, setTreatmentNotes] = useState(lead.treatmentNotes || '');
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [patientName, setPatientName] = useState(lead.name);
  const [patientPhone, setPatientPhone] = useState(lead.phone);
  const [isSavingPatientInfo, setIsSavingPatientInfo] = useState(false);

  const { updateLead } = useLeadStore();

  // Sync name/phone when lead changes (e.g. after refetch)
  useEffect(() => {
    setPatientName(lead.name);
    setPatientPhone(lead.phone);
  }, [lead.id, lead.name, lead.phone]);

  const handleAction = (action: PatientAction) => {
    if (action.status === 'DNR') {
      setShowDNRConfirm(true);
      return;
    }
    onAction(lead, action);
  };

  const handleDNRConfirm = () => {
    setShowDNRConfirm(false);
    const dnrAction = actions.find(a => a.status === 'DNR');
    if (dnrAction) onAction(lead, dnrAction);
  };

  const handleFollowUpToggle = async () => {
    setActionInProgress('followUp');
    try {
      if (lead.followUp) {
        await updateLead(lead.id, { followUp: false, followUpDate: null } as Partial<Lead>);
      } else {
        await updateLead(lead.id, { followUp: true } as Partial<Lead>);
      }
    } catch {
      // handled by store
    } finally {
      setActionInProgress(null);
    }
  };

  const handleFollowUpDateChange = async (dateStr: string) => {
    setFollowUpDate(dateStr);
    if (!dateStr) return;
    setActionInProgress('followUpDate');
    try {
      await updateLead(lead.id, {
        followUp: true,
        followUpDate: new Date(dateStr).toISOString(),
      } as Partial<Lead>);
    } catch {
      // handled by store
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSavePatientInfo = async () => {
    const nameTrimmed = patientName.trim();
    if (!nameTrimmed || (nameTrimmed === lead.name && patientPhone === lead.phone)) return;
    setIsSavingPatientInfo(true);
    try {
      await updateLead(lead.id, {
        name: nameTrimmed,
        phone: patientPhone.trim(),
      } as Partial<Lead>);
    } catch {
      // handled by store
    } finally {
      setIsSavingPatientInfo(false);
    }
  };

  const handleSaveDetails = async () => {
    setIsSavingDetails(true);
    try {
      const payload: Record<string, unknown> = {};
      if (treatmentPlan !== (lead.treatmentPlan || '')) payload.treatmentPlan = treatmentPlan || null;
      if (treatmentNotes !== (lead.treatmentNotes || '')) payload.treatmentNotes = treatmentNotes || null;
      if (Object.keys(payload).length > 0) {
        await updateLead(lead.id, payload as Partial<Lead>);
      }
    } catch {
      // handled by store
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleMarkContacted = async () => {
    setActionInProgress('lastContact');
    try {
      await updateLead(lead.id, { lastContactedAt: new Date().toISOString() } as Partial<Lead>);
    } catch {
      // handled by store
    } finally {
      setActionInProgress(null);
    }
  };

  const handleQuickCall = () => {
    window.open(`tel:${lead.phone}`, '_self');
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/91${lead.phone.replace(/\D/g, '')}`, '_blank');
  };

  // Follow-up badge
  const getFollowUpBadge = () => {
    if (!lead.followUpDate) return null;
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
      <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
        <Calendar className="h-3 w-3" />
        {formatDateIST(lead.followUpDate!, 'MMM d')}
      </span>
    );
  };

  // Last contact badge
  const getLastContactBadge = () => {
    if (!lead.lastContactedAt) {
      return <span className="text-xs text-slate-400">Never contacted</span>;
    }
    const date = parseISO(lead.lastContactedAt);
    const daysSince = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    let colorClass = 'bg-green-50 text-green-700';
    if (daysSince > 7) colorClass = 'bg-red-50 text-red-700';
    else if (daysSince > 3) colorClass = 'bg-amber-50 text-amber-700';

    return (
      <span className={clsx('flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', colorClass)}>
        <Clock className="h-3 w-3" />
        {formatDateIST(lead.lastContactedAt!, 'MMM d')}
      </span>
    );
  };

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
        {/* Patient initial avatar */}
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
          {lead.name.charAt(0).toUpperCase()}
        </div>

        {/* Patient info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-slate-900">{lead.name}</h3>
            <span className={clsx(
              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
              lead.status === 'APPOINTMENT_BOOKED' && lead.appointments?.[0]?.status === 'CANCELLED'
                ? 'bg-red-100 text-red-700 ring-red-500/20'
                : (statusColors[lead.status] || 'bg-slate-100 text-slate-600')
            )}>
              {lead.status === 'APPOINTMENT_BOOKED' && lead.appointments?.[0]?.status === 'CANCELLED'
                ? 'Cancelled appointment'
                : (statusLabels[lead.status] || lead.status)}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-base font-semibold text-dental-600 hover:underline">
              <Phone className="h-4 w-4" />
              {lead.phone}
            </a>
            {lead.clinic && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {lead.clinic.name}
              </span>
            )}
            {lead.treatmentInterest && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                {lead.treatmentInterest}
              </span>
            )}
          </div>
        </div>

        {/* Right side badges */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleMarkContacted}
            disabled={actionInProgress === 'lastContact'}
            className="hidden sm:flex flex-col items-end gap-0.5 rounded-lg px-2 py-1 transition-colors hover:bg-green-50"
            title="Click to mark as contacted now"
          >
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Last Contact</span>
            {actionInProgress === 'lastContact' ? (
              <Loader2 className="h-3.5 w-3.5 spinner text-slate-400" />
            ) : (
              getLastContactBadge()
            )}
          </button>

          {getFollowUpBadge()}

          {nextAppointment && (
            <button
              onClick={() => onReschedule?.(nextAppointment)}
              className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
              title="Click to reschedule"
            >
              <Calendar className="h-3 w-3" />
              Next: {formatDateIST(nextAppointment.scheduledAt, 'MMM d, h:mm a')}
            </button>
          )}
          {!nextAppointment && onReschedule && (
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
              No appointment
            </span>
          )}

          {lead._count?.notes && lead._count.notes > 0 && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <MessageSquare className="h-3.5 w-3.5" />
              {lead._count.notes}
            </span>
          )}

          {/* Quick actions */}
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button onClick={handleQuickCall} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Call">
              <Phone className="h-4 w-4" />
            </button>
            <button onClick={handleWhatsApp} className="rounded-lg p-2 text-slate-400 hover:bg-green-100 hover:text-green-600" title="WhatsApp">
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Action buttons row */}
      <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => (
            <button
              key={action.status}
              onClick={() => handleAction(action)}
              disabled={actionInProgress === action.status}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                action.color
              )}
            >
              {actionInProgress === action.status ? (
                <Loader2 className="h-3.5 w-3.5 spinner" />
              ) : action.icon ? (
                action.icon
              ) : null}
              {action.label}
            </button>
          ))}

          {/* Follow-up toggle */}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={lead.followUp}
              onChange={handleFollowUpToggle}
              disabled={actionInProgress === 'followUp'}
              className="rounded border-slate-300 text-dental-500 focus:ring-dental-500"
            />
            Follow-up
          </label>
          {lead.followUp && (
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => handleFollowUpDateChange(e.target.value)}
              disabled={actionInProgress === 'followUpDate'}
              className="rounded border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-dental-500 focus:ring-dental-500"
            />
          )}
        </div>
      </div>

      {/* Expanded section */}
      {isExpanded && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          {/* Editable patient name & phone */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Patient name</label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Phone</label>
              <input
                type="tel"
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                placeholder="Phone number"
              />
            </div>
          </div>
          {(patientName.trim() !== lead.name || patientPhone.trim() !== lead.phone) && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSavePatientInfo}
                disabled={isSavingPatientInfo || !patientName.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-dental-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-dental-600 disabled:opacity-50"
              >
                {isSavingPatientInfo ? <Loader2 className="h-3.5 w-3.5 spinner" /> : null}
                Save name &amp; phone
              </button>
            </div>
          )}

          {/* Details grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Treatment Plan */}
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                <FileText className="h-3 w-3" />
                Treatment Plan
              </label>
              <textarea
                value={treatmentPlan}
                onChange={(e) => setTreatmentPlan(e.target.value)}
                placeholder="Enter treatment plan..."
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
              />
            </div>

            {/* Treatment Notes */}
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                <FileText className="h-3 w-3" />
                Treatment Notes
              </label>
              <textarea
                value={treatmentNotes}
                onChange={(e) => setTreatmentNotes(e.target.value)}
                placeholder="Enter treatment notes..."
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
              />
            </div>
          </div>

          {/* Save button for treatment details */}
          {(treatmentPlan !== (lead.treatmentPlan || '') || treatmentNotes !== (lead.treatmentNotes || '')) && (
            <div className="flex justify-end">
              <button
                onClick={handleSaveDetails}
                disabled={isSavingDetails}
                className="flex items-center gap-1.5 rounded-lg bg-dental-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-dental-600 disabled:opacity-50"
              >
                {isSavingDetails ? <Loader2 className="h-3.5 w-3.5 spinner" /> : null}
                Save Details
              </button>
            </div>
          )}

          {/* Info row */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
            {lead.age && <span>Age: <strong className="text-slate-700">{lead.age}</strong></span>}
            {lead.patientLocation && <span>Location: <strong className="text-slate-700">{lead.patientLocation}</strong></span>}
            {lead.source && <span>Source: <strong className="text-slate-700">{lead.source.replace(/_/g, ' ')}</strong></span>}
            {lead.enquiryDate && <span>Enquiry: <strong className="text-slate-700">{formatDateIST(lead.enquiryDate)}</strong></span>}
            {lead.updatedAt && <span>Updated: <strong className="text-slate-700">{formatDateIST(lead.updatedAt, 'MMM d, h:mm a')}</strong></span>}
          </div>

          {/* Notes */}
          <NoteThread leadId={lead.id} notes={lead.notes || []} />
        </div>
      )}

      {/* DNR Confirm */}
      {showDNRConfirm && (
        <DNRConfirmDialog
          patientName={lead.name}
          onConfirm={handleDNRConfirm}
          onCancel={() => setShowDNRConfirm(false)}
        />
      )}
    </div>
  );
}

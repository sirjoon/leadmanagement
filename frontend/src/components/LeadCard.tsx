import { useState } from 'react';
import { 
  Phone, 
  MessageSquare, 
  Calendar, 
  MapPin, 
  ChevronDown, 
  ChevronUp,
  Clock,
  User,
  Edit2,
  MoreHorizontal
} from 'lucide-react';
import { type Lead, type LeadStatus, type Priority, useLeadStore } from '../store/leadStore';
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

// Priority styles
const priorityStyles: Record<Priority, { bg: string; icon: string }> = {
  HOT: { bg: 'bg-red-500', icon: '🔥' },
  WARM: { bg: 'bg-orange-400', icon: '♨️' },
  COLD: { bg: 'bg-blue-400', icon: '🧊' },
  NEW: { bg: 'bg-purple-500', icon: '📋' },
  APPOINTMENT: { bg: 'bg-emerald-500', icon: '📅' },
  VISITED: { bg: 'bg-green-500', icon: '✅' },
};

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

interface LeadCardProps {
  lead: Lead;
  index: number;
  onSelect: () => void;
}

export default function LeadCard({ lead, index, onSelect }: LeadCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { updateLead } = useLeadStore();

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
          {/* Lead details */}
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
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

          {/* Status quick change */}
          <div className="border-t border-slate-100 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Quick Status Change</p>
            <div className="flex flex-wrap gap-2">
              {(['NEW', 'ATTEMPTING', 'CONNECTED', 'APPOINTMENT_BOOKED', 'VISITED'] as LeadStatus[]).map((status) => (
                <button
                  key={status}
                  onClick={() => updateLead(lead.id, { status })}
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    lead.status === status
                      ? statusColors[status]
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

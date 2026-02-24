import { useEffect, useState } from 'react';
import { 
  Search, 
  Plus, 
  Filter, 
  ChevronDown,
  Phone,
  Calendar,
  MapPin,
  MessageSquare,
  MoreVertical,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { useLeadStore, type Lead, type LeadStatus, type Priority } from '../store/leadStore';
import { useAuthStore } from '../store/authStore';
import { clsx } from 'clsx';
import { format, isToday, isPast, isFuture, parseISO } from 'date-fns';
import LeadCard from '../components/LeadCard';
import CreateLeadModal from '../components/CreateLeadModal';
import FilterPanel from '../components/FilterPanel';

// Status badge colors
const statusColors: Record<LeadStatus, string> = {
  NEW: 'bg-purple-100 text-purple-700',
  ATTEMPTING: 'bg-yellow-100 text-yellow-700',
  CONNECTED: 'bg-blue-100 text-blue-700',
  APPOINTMENT_BOOKED: 'bg-emerald-100 text-emerald-700',
  VISITED: 'bg-green-100 text-green-700',
  TREATMENT_STARTED: 'bg-teal-100 text-teal-700',
  RESCHEDULED: 'bg-orange-100 text-orange-700',
  LOST: 'bg-red-100 text-red-700',
  DNC: 'bg-gray-100 text-gray-700',
  DNR: 'bg-gray-200 text-gray-800',
};

// Priority badge styles
const priorityStyles: Record<Priority, { bg: string; text: string; icon: string }> = {
  HOT: { bg: 'bg-red-500', text: 'text-white', icon: '🔥' },
  WARM: { bg: 'bg-orange-400', text: 'text-white', icon: '♨️' },
  COLD: { bg: 'bg-blue-400', text: 'text-white', icon: '🧊' },
  NEW: { bg: 'bg-purple-500', text: 'text-white', icon: '📋' },
  APPOINTMENT: { bg: 'bg-emerald-500', text: 'text-white', icon: '📅' },
  VISITED: { bg: 'bg-green-500', text: 'text-white', icon: '✅' },
};

export default function LeadsPage() {
  const { 
    leads, 
    tbdLeads, 
    pagination, 
    filters, 
    isLoading, 
    error,
    fetchLeads, 
    fetchTbdLeads,
    setFilters 
  } = useLeadStore();
  
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  useEffect(() => {
    fetchLeads();
    if (isAdmin) {
      fetchTbdLeads();
    }
  }, [fetchLeads, fetchTbdLeads, isAdmin]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ search: searchQuery, page: 1 });
    fetchLeads({ search: searchQuery, page: 1 });
  };

  const handleRefresh = () => {
    fetchLeads(filters);
    if (isAdmin) {
      fetchTbdLeads();
    }
  };

  const getFollowUpStatus = (date: string | null) => {
    if (!date) return { label: 'No follow-up', color: 'text-gray-400' };
    
    const followUpDate = parseISO(date);
    if (isPast(followUpDate) && !isToday(followUpDate)) {
      return { label: 'Overdue', color: 'text-red-600 font-semibold' };
    }
    if (isToday(followUpDate)) {
      return { label: 'Due Today', color: 'text-amber-600 font-semibold' };
    }
    if (isFuture(followUpDate)) {
      return { label: format(followUpDate, 'MMM d'), color: 'text-green-600' };
    }
    return { label: format(followUpDate, 'MMM d'), color: 'text-gray-500' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500">
            {pagination.total} total leads • Page {pagination.page} of {pagination.totalPages || 1}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className={clsx('h-5 w-5', isLoading && 'spinner')} />
          </button>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx(
              'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
              showFilters 
                ? 'border-dental-500 bg-dental-50 text-dental-600' 
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            )}
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-lg bg-dental-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-dental-600"
          >
            <Plus className="h-4 w-4" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, or email..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
            />
          </div>
        </form>

        {showFilters && (
          <FilterPanel onClose={() => setShowFilters(false)} />
        )}
      </div>

      {/* TBD Queue - Admin only */}
      {isAdmin && tbdLeads.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <h3 className="font-semibold text-amber-900">
              Unassigned Leads ({tbdLeads.length})
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {tbdLeads.slice(0, 5).map((lead) => (
              <button
                key={lead.id}
                onClick={() => setSelectedLead(lead)}
                className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm shadow-sm transition-colors hover:bg-amber-100"
              >
                <span className="font-medium text-slate-900">{lead.name}</span>
                <span className="text-slate-500">{lead.phone}</span>
              </button>
            ))}
            {tbdLeads.length > 5 && (
              <span className="flex items-center px-3 text-sm text-amber-700">
                +{tbdLeads.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg bg-red-50 p-4 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && leads.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full border-4 border-dental-200 border-t-dental-500 spinner" />
            <p className="text-slate-500">Loading leads...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && leads.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-2xl">
            📋
          </div>
          <h3 className="mt-4 font-semibold text-slate-900">No leads found</h3>
          <p className="mt-1 text-sm text-slate-500">
            {filters.search ? 'Try adjusting your search or filters' : 'Create your first lead to get started'}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 flex items-center gap-2 rounded-lg bg-dental-500 px-4 py-2 text-sm font-medium text-white hover:bg-dental-600"
          >
            <Plus className="h-4 w-4" />
            Add Lead
          </button>
        </div>
      )}

      {/* Lead cards */}
      <div className="space-y-3">
        {leads.map((lead, index) => (
          <LeadCard 
            key={lead.id} 
            lead={lead} 
            index={index}
            onSelect={() => setSelectedLead(lead)}
          />
        ))}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <p className="text-sm text-slate-500">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} leads
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => fetchLeads({ page: pagination.page - 1 })}
              disabled={pagination.page === 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => fetchLeads({ page: pagination.page + 1 })}
              disabled={pagination.page === pagination.totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateLeadModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

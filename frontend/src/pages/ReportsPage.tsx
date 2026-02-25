import { useEffect, useState } from 'react';
import {
  Download,
  FileText,
  PhoneOff,
  VolumeX,
  Building2,
  BarChart3,
  Filter,
  Calendar,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Phone,
  Mail,
} from 'lucide-react';
import { api } from '../api/client';
import { clsx } from 'clsx';
import { format, parseISO, subDays, startOfMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ─── Types ───────────────────────────────────────────────
interface DncDnrLead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: 'DNC' | 'DNR';
  source: string;
  treatmentInterest: string | null;
  createdAt: string;
  updatedAt: string;
  clinic: { id: string; name: string; slug: string } | null;
  notes: { content: string; author: { name: string } }[];
  statusHistory: { createdAt: string }[];
}

interface ClinicDncBreakdown {
  clinicId: string;
  clinicName: string;
  slug: string;
  dncCount: number;
  dnrCount: number;
  totalLeads: number;
  dncRate: number;
  dnrRate: number;
}

interface ClinicLead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  priority: string;
  source: string;
  treatmentInterest: string | null;
  followUpDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ClinicReport {
  clinicId: string;
  clinicName: string;
  slug: string;
  totalLeads: number;
  conversionRate: number;
  byStatus: { status: string; count: number }[];
}

interface FullReport {
  totalLeads: number;
  byStatus: { status: string; count: number }[];
  clinicReports: ClinicReport[];
  generatedAt: string;
}

type ReportTab = 'dnc-dnr' | 'per-clinic' | 'full';

// ─── Constants ───────────────────────────────────────────
const statusLabels: Record<string, string> = {
  NEW: 'New',
  ATTEMPTING: 'Attempting',
  CONNECTED: 'Connected',
  APPOINTMENT_BOOKED: 'Booked',
  VISITED: 'Visited',
  TREATMENT_STARTED: 'Treatment Started',
  RESCHEDULED: 'Rescheduled',
  LOST: 'Lost',
  DNC: 'DNC',
  DNR: 'DNR',
};

const statusColors: Record<string, string> = {
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

const CHART_COLORS = ['#8b5cf6', '#eab308', '#3b82f6', '#10b981', '#22c55e', '#14b8a6', '#f97316', '#ef4444', '#6b7280', '#4b5563'];

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

// ─── Component ───────────────────────────────────────────
export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('dnc-dnr');
  const [isLoading, setIsLoading] = useState(false);

  // Date filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // DNC/DNR report data
  const [dncLeads, setDncLeads] = useState<DncDnrLead[]>([]);
  const [dnrLeads, setDnrLeads] = useState<DncDnrLead[]>([]);
  const [dncDnrTotals, setDncDnrTotals] = useState({ dncCount: 0, dnrCount: 0, total: 0 });
  const [clinicBreakdown, setClinicBreakdown] = useState<ClinicDncBreakdown[]>([]);

  // Full report data
  const [fullReport, setFullReport] = useState<FullReport | null>(null);

  // Expanded rows
  const [expandedClinic, setExpandedClinic] = useState<string | null>(null);
  const [dncDnrFilter, setDncDnrFilter] = useState<'all' | 'DNC' | 'DNR'>('all');

  // Clinic leads data (keyed by clinicId)
  const [clinicLeads, setClinicLeads] = useState<Record<string, ClinicLead[]>>({});
  const [clinicLeadsLoading, setClinicLeadsLoading] = useState<string | null>(null);

  // ─── Fetch DNC/DNR Report ─────────────────────────────
  const fetchDncDnrReport = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append('from', new Date(dateFrom).toISOString());
      if (dateTo) params.append('to', new Date(dateTo).toISOString());

      const res = await api.get(`/reports/dnc-dnr?${params}`);
      setDncLeads(res.data.dncLeads);
      setDnrLeads(res.data.dnrLeads);
      setDncDnrTotals(res.data.totals);
      setClinicBreakdown(res.data.clinicBreakdown);
    } catch (err) {
      console.error('Failed to fetch DNC/DNR report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Fetch Full Report ────────────────────────────────
  const fetchFullReport = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append('from', new Date(dateFrom).toISOString());
      if (dateTo) params.append('to', new Date(dateTo).toISOString());

      const res = await api.get(`/reports/full?${params}`);
      setFullReport(res.data);
    } catch (err) {
      console.error('Failed to fetch full report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Fetch clinic leads when expanded ─────────────────
  const fetchClinicLeads = async (clinicId: string) => {
    if (clinicLeads[clinicId]) return; // already fetched
    setClinicLeadsLoading(clinicId);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append('from', new Date(dateFrom).toISOString());
      if (dateTo) params.append('to', new Date(dateTo).toISOString());

      const res = await api.get(`/reports/clinic/${clinicId}?${params}`);
      setClinicLeads(prev => ({ ...prev, [clinicId]: res.data.leads }));
    } catch (err) {
      console.error('Failed to fetch clinic leads:', err);
    } finally {
      setClinicLeadsLoading(null);
    }
  };

  const handleToggleClinic = (clinicId: string) => {
    if (expandedClinic === clinicId) {
      setExpandedClinic(null);
    } else {
      setExpandedClinic(clinicId);
      fetchClinicLeads(clinicId);
    }
  };

  // ─── Fetch on tab change ──────────────────────────────
  useEffect(() => {
    if (activeTab === 'dnc-dnr') fetchDncDnrReport();
    else if (activeTab === 'per-clinic' || activeTab === 'full') fetchFullReport();
  }, [activeTab]);

  // ─── Export handlers ──────────────────────────────────
  const handleExportDncDnr = () => {
    window.open(`${api.defaults.baseURL}/reports/export/dnc-dnr`, '_blank');
  };

  const handleExportClinic = (clinicId: string) => {
    window.open(`${api.defaults.baseURL}/reports/export/clinic/${clinicId}`, '_blank');
  };

  const handleExportFull = () => {
    window.open(`${api.defaults.baseURL}/reports/export/full`, '_blank');
  };

  const handleApplyDateFilter = () => {
    setClinicLeads({}); // clear cached leads when filter changes
    if (activeTab === 'dnc-dnr') fetchDncDnrReport();
    else fetchFullReport();
  };

  const handleQuickDate = (days: number) => {
    const to = new Date();
    const from = days === 0 ? startOfMonth(to) : subDays(to, days);
    setDateFrom(format(from, 'yyyy-MM-dd'));
    setDateTo(format(to, 'yyyy-MM-dd'));
  };

  // Filtered DNC/DNR leads
  const filteredLeads = dncDnrFilter === 'all'
    ? [...dncLeads, ...dnrLeads]
    : dncDnrFilter === 'DNC' ? dncLeads : dnrLeads;

  // ─── Render ───────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">Generate and export reports for your franchise</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          onClick={() => setActiveTab('dnc-dnr')}
          className={clsx(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'dnc-dnr'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <PhoneOff className="h-4 w-4" />
          DNC / DNR
        </button>
        <button
          onClick={() => setActiveTab('per-clinic')}
          className={clsx(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'per-clinic'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Building2 className="h-4 w-4" />
          Per Clinic
        </button>
        <button
          onClick={() => setActiveTab('full')}
          className={clsx(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'full'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <BarChart3 className="h-4 w-4" />
          Full Report
        </button>
      </div>

      {/* Date Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <Filter className="h-4 w-4 text-slate-400" />
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
          />
        </div>
        <div className="flex gap-1">
          <button onClick={() => handleQuickDate(7)} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200">7d</button>
          <button onClick={() => handleQuickDate(30)} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200">30d</button>
          <button onClick={() => handleQuickDate(90)} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200">90d</button>
          <button onClick={() => handleQuickDate(0)} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200">MTD</button>
        </div>
        <button
          onClick={handleApplyDateFilter}
          className="rounded-lg bg-dental-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-dental-600"
        >
          Apply
        </button>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Clear
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full border-4 border-dental-200 border-t-dental-500 spinner" />
            <p className="text-slate-500">Generating report...</p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          DNC / DNR TAB
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'dnc-dnr' && !isLoading && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                  <PhoneOff className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-slate-900">{dncDnrTotals.dncCount}</p>
                  <p className="text-sm text-slate-500">Do Not Call (DNC)</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200">
                  <VolumeX className="h-6 w-6 text-gray-700" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-slate-900">{dncDnrTotals.dnrCount}</p>
                  <p className="text-sm text-slate-500">Do Not Respond (DNR)</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-slate-900">{dncDnrTotals.total}</p>
                  <p className="text-sm text-slate-500">Total Excluded</p>
                </div>
              </div>
            </div>
          </div>

          {/* DNC/DNR by Clinic Chart */}
          {clinicBreakdown.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-4 font-semibold text-slate-900">DNC/DNR by Clinic</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clinicBreakdown.filter(c => c.dncCount > 0 || c.dnrCount > 0)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="clinicName" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="dncCount" name="DNC" fill="#6b7280" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="dnrCount" name="DNR" fill="#374151" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* DNC/DNR Lead List */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-slate-900">DNC/DNR Leads</h3>
                <div className="flex gap-1">
                  {(['all', 'DNC', 'DNR'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setDncDnrFilter(filter)}
                      className={clsx(
                        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        dncDnrFilter === filter
                          ? 'bg-slate-800 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      )}
                    >
                      {filter === 'all' ? `All (${dncDnrTotals.total})` : `${filter} (${filter === 'DNC' ? dncDnrTotals.dncCount : dncDnrTotals.dnrCount})`}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleExportDncDnr}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            </div>

            {filteredLeads.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No {dncDnrFilter === 'all' ? 'DNC/DNR' : dncDnrFilter} leads found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Phone</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Source</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Clinic</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Flagged</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Last Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-slate-900">{lead.name}</p>
                          {lead.email && (
                            <p className="flex items-center gap-1 text-xs text-slate-400">
                              <Mail className="h-3 w-3" />
                              {lead.email}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1 text-sm text-slate-600">
                            <Phone className="h-3.5 w-3.5" />
                            {lead.phone}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', statusColors[lead.status])}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {sourceLabels[lead.source] || lead.source}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {lead.clinic?.name || <span className="text-slate-400">Unassigned</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {lead.statusHistory?.[0]
                            ? format(parseISO(lead.statusHistory[0].createdAt), 'MMM d, yyyy')
                            : format(parseISO(lead.updatedAt), 'MMM d, yyyy')
                          }
                        </td>
                        <td className="max-w-[200px] px-4 py-3 text-xs text-slate-500">
                          {lead.notes?.[0] ? (
                            <span className="truncate block" title={lead.notes[0].content}>
                              {lead.notes[0].content}
                            </span>
                          ) : (
                            <span className="text-slate-300">No notes</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          PER CLINIC TAB
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'per-clinic' && !isLoading && fullReport && (
        <div className="space-y-4">
          {fullReport.clinicReports.map((clinic) => (
            <div key={clinic.clinicId} className="rounded-xl border border-slate-200 bg-white">
              {/* Clinic Header */}
              <button
                onClick={() => handleToggleClinic(clinic.clinicId)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-dental-500" />
                  <div>
                    <h3 className="font-semibold text-slate-900">{clinic.clinicName}</h3>
                    <p className="text-sm text-slate-500">{clinic.totalLeads} total leads</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900">{clinic.conversionRate}%</p>
                    <p className="text-xs text-slate-500">Conversion</p>
                  </div>

                  {/* Quick DNC/DNR counts */}
                  <div className="flex gap-2">
                    {clinic.byStatus.filter(s => s.status === 'DNC' || s.status === 'DNR').map(s => (
                      s.count > 0 && (
                        <span key={s.status} className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', statusColors[s.status])}>
                          {s.status}: {s.count}
                        </span>
                      )
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleExportClinic(clinic.clinicId); }}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      title="Export CSV"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    {expandedClinic === clinic.clinicId ? (
                      <ChevronDown className="h-5 w-5 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded Clinic Details */}
              {expandedClinic === clinic.clinicId && (
                <div className="border-t border-slate-100 p-4">
                  {/* Status breakdown */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Status chart */}
                    <div>
                      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Status Breakdown</p>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={clinic.byStatus.filter(s => s.count > 0)} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                            <XAxis type="number" allowDecimals={false} />
                            <YAxis type="category" dataKey="status" width={80} tick={{ fontSize: 11 }}
                              tickFormatter={(v) => statusLabels[v] || v}
                            />
                            <Tooltip labelFormatter={(v) => statusLabels[v as string] || v} />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                              {clinic.byStatus.filter(s => s.count > 0).map((entry, i) => (
                                <Cell key={entry.status} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Status pills */}
                    <div>
                      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Counts</p>
                      <div className="flex flex-wrap gap-2">
                        {clinic.byStatus.map((s) => (
                          <div key={s.status} className={clsx(
                            'flex items-center gap-2 rounded-lg border px-3 py-2',
                            s.count > 0 ? 'border-slate-200' : 'border-slate-100 opacity-50'
                          )}>
                            <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', statusColors[s.status])}>
                              {statusLabels[s.status]}
                            </span>
                            <span className="text-sm font-semibold text-slate-900">{s.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Leads Table */}
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">All Leads</p>
                    {clinicLeadsLoading === clinic.clinicId ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="h-6 w-6 rounded-full border-2 border-dental-200 border-t-dental-500 spinner" />
                        <span className="ml-2 text-sm text-slate-500">Loading leads...</span>
                      </div>
                    ) : clinicLeads[clinic.clinicId] && clinicLeads[clinic.clinicId].length > 0 ? (
                      <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Name</th>
                              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Phone</th>
                              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Email</th>
                              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Priority</th>
                              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Source</th>
                              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Treatment</th>
                              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Follow-up</th>
                              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Created</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {clinicLeads[clinic.clinicId].map((lead) => (
                              <tr key={lead.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 text-sm font-medium text-slate-900">{lead.name}</td>
                                <td className="px-3 py-2">
                                  <span className="flex items-center gap-1 text-sm text-slate-600">
                                    <Phone className="h-3 w-3" />
                                    {lead.phone}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-sm text-slate-500">
                                  {lead.email || <span className="text-slate-300">-</span>}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', statusColors[lead.status])}>
                                    {statusLabels[lead.status] || lead.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-600">{lead.priority}</td>
                                <td className="px-3 py-2 text-xs text-slate-600">
                                  {sourceLabels[lead.source] || lead.source}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-600">
                                  {lead.treatmentInterest || <span className="text-slate-300">-</span>}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-500">
                                  {lead.followUpDate
                                    ? format(parseISO(lead.followUpDate), 'MMM d, yyyy')
                                    : <span className="text-slate-300">-</span>
                                  }
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-500">
                                  {format(parseISO(lead.createdAt), 'MMM d, yyyy')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="py-4 text-center text-sm text-slate-400">No leads found for this clinic.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          FULL REPORT TAB
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'full' && !isLoading && fullReport && (
        <div className="space-y-6">
          {/* Overall Summary */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Overall Status Distribution</h3>
              <button
                onClick={handleExportFull}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                Export All Leads CSV
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Status Chart */}
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={fullReport.byStatus.filter(s => s.count > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="status"
                      label={({ status, count }) => `${statusLabels[status]} (${count})`}
                      labelLine={false}
                    >
                      {fullReport.byStatus.filter(s => s.count > 0).map((_, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip labelFormatter={(v) => statusLabels[v as string] || v} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Status Grid */}
              <div className="grid grid-cols-2 gap-3">
                {fullReport.byStatus.map((s) => (
                  <div key={s.status} className={clsx(
                    'flex items-center justify-between rounded-lg border p-3',
                    s.count > 0 ? 'border-slate-200' : 'border-slate-100 opacity-50'
                  )}>
                    <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', statusColors[s.status])}>
                      {statusLabels[s.status]}
                    </span>
                    <span className="text-lg font-bold text-slate-900">{s.count}</span>
                  </div>
                ))}
                <div className="col-span-2 flex items-center justify-between rounded-lg border-2 border-dental-200 bg-dental-50 p-3">
                  <span className="text-sm font-medium text-dental-700">Total Leads</span>
                  <span className="text-2xl font-bold text-dental-700">{fullReport.totalLeads}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Clinic Comparison Table */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">Clinic Comparison</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Clinic</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Total</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">New</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Connected</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Booked</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Visited</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">DNC</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">DNR</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Conv %</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Export</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fullReport.clinicReports.map((clinic) => {
                    const getCount = (status: string) => clinic.byStatus.find(s => s.status === status)?.count || 0;
                    return (
                      <tr key={clinic.clinicId} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{clinic.clinicName}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">{clinic.totalLeads}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-600">{getCount('NEW')}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-600">{getCount('CONNECTED')}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-600">{getCount('APPOINTMENT_BOOKED')}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-600">{getCount('VISITED')}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={clsx('text-sm', getCount('DNC') > 0 ? 'font-medium text-gray-700' : 'text-slate-400')}>
                            {getCount('DNC')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={clsx('text-sm', getCount('DNR') > 0 ? 'font-medium text-gray-700' : 'text-slate-400')}>
                            {getCount('DNR')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={clsx(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            clinic.conversionRate >= 30 ? 'bg-green-100 text-green-700'
                              : clinic.conversionRate >= 15 ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                          )}>
                            {clinic.conversionRate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleExportClinic(clinic.clinicId)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            title="Export CSV"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Generated timestamp */}
          <p className="text-center text-xs text-slate-400">
            Report generated at {format(parseISO(fullReport.generatedAt), 'PPpp')}
          </p>
        </div>
      )}
    </div>
  );
}

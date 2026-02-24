import { useEffect, useState } from 'react';
import { TrendingUp, Users, Calendar, CheckCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { api } from '../api/client';
import { clsx } from 'clsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Funnel, FunnelChart, LabelList } from 'recharts';

interface Summary {
  totalLeads: number;
  newLeads: number;
  connectedLeads: number;
  appointmentBooked: number;
  visited: number;
  treatmentStarted: number;
  lostLeads: number;
  conversionRate: number;
  followUpCompliance: number;
}

interface ClinicStat {
  clinicId: string | null;
  clinicName: string;
  totalLeads: number;
  bookedAppointments: number;
  visitedPatients: number;
  conversionRate: number;
}

interface SourceStat {
  source: string;
  count: number;
  percentage: number;
}

const COLORS = ['#10b99a', '#0b7766', '#2ad4b2', '#5ceaca', '#99f6de', '#ccfbee', '#f97316', '#ef4444'];

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

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clinicStats, setClinicStats] = useState<ClinicStat[]>([]);
  const [sourceStats, setSourceStats] = useState<SourceStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [summaryRes, clinicRes, sourceRes] = await Promise.all([
          api.get('/analytics/summary'),
          api.get('/analytics/by-clinic'),
          api.get('/analytics/by-source'),
        ]);
        
        setSummary(summaryRes.data.summary);
        setClinicStats(clinicRes.data.byClinic);
        setSourceStats(sourceRes.data.bySource);
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-dental-200 border-t-dental-500 spinner" />
          <p className="text-slate-500">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-500">Track your lead performance and conversions</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <span className="flex items-center gap-1 text-sm text-green-600">
              <ArrowUpRight className="h-4 w-4" />
              +12%
            </span>
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-900">{summary?.totalLeads || 0}</p>
          <p className="text-sm text-slate-500">Total Leads</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-900">{summary?.connectedLeads || 0}</p>
          <p className="text-sm text-slate-500">Connected</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Calendar className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-900">{summary?.appointmentBooked || 0}</p>
          <p className="text-sm text-slate-500">Appointments Booked</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold text-dental-600">{summary?.conversionRate || 0}%</p>
          <p className="text-sm text-slate-500">Conversion Rate</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Leads by Clinic */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-900">Leads by Clinic</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clinicStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="clinicName" width={100} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="totalLeads" fill="#10b99a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Leads by Source */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-900">Lead Sources</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sourceStats.filter(s => s.count > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="count"
                  nameKey="source"
                  label={({ source, percentage }) => `${sourceLabels[source] || source} (${percentage}%)`}
                  labelLine={false}
                >
                  {sourceStats.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, sourceLabels[name as string] || name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Clinic Performance Table */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6">
          <h3 className="font-semibold text-slate-900">Clinic Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Clinic
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total Leads
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                  Booked
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                  Visited
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                  Conversion
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clinicStats.map((stat) => (
                <tr key={stat.clinicId || 'tbd'} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    {stat.clinicName}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-slate-600">
                    {stat.totalLeads}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-slate-600">
                    {stat.bookedAppointments}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-slate-600">
                    {stat.visitedPatients}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={clsx(
                      'rounded-full px-2 py-1 text-xs font-medium',
                      stat.conversionRate >= 30 
                        ? 'bg-green-100 text-green-700' 
                        : stat.conversionRate >= 15 
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                    )}>
                      {stat.conversionRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

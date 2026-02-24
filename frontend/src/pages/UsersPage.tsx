import { useEffect, useState } from 'react';
import { Plus, Search, MoreVertical, Mail, UserCircle, Shield, Building2 } from 'lucide-react';
import { api } from '../api/client';
import { clsx } from 'clsx';
import { format, parseISO } from 'date-fns';

interface Clinic {
  id: string;
  name: string;
  slug: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
  clinicAccess: Array<{ clinic: Clinic }>;
}

const roleLabels: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', color: 'bg-purple-100 text-purple-700' },
  ADMIN: { label: 'Admin', color: 'bg-blue-100 text-blue-700' },
  CLINIC_STAFF: { label: 'Clinic Staff', color: 'bg-green-100 text-green-700' },
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data.users);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-dental-200 border-t-dental-500 spinner" />
          <p className="text-slate-500">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">{users.length} team members</p>
        </div>

        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 rounded-lg bg-dental-500 px-4 py-2 text-sm font-medium text-white hover:bg-dental-600"
        >
          <Plus className="h-4 w-4" />
          Invite User
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users..."
          className="w-full max-w-md rounded-lg border border-slate-200 py-2.5 pl-10 pr-4 text-sm focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
        />
      </div>

      {/* Permissions Legend */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-blue-900">Admin</h3>
          </div>
          <ul className="space-y-1 text-sm text-blue-700">
            <li>✓ View all leads across clinics</li>
            <li>✓ Assign leads to clinics</li>
            <li>✓ View DNC/DNR list</li>
            <li>✓ Analytics dashboard</li>
            <li>✓ User management</li>
          </ul>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-green-600" />
            <h3 className="font-semibold text-green-900">Clinic Staff</h3>
          </div>
          <ul className="space-y-1 text-sm text-green-700">
            <li>✓ View leads for assigned clinic only</li>
            <li>✓ Add and edit notes</li>
            <li>✓ Update lead status</li>
            <li>✗ Cannot view DNC/DNR leads</li>
            <li>✗ No analytics access</li>
          </ul>
        </div>
      </div>

      {/* Users table */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Clinics
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Last Login
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dental-100 text-dental-600 font-semibold">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{user.name}</p>
                        <p className="text-sm text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={clsx(
                      'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                      roleLabels[user.role]?.color || 'bg-gray-100 text-gray-700'
                    )}>
                      {roleLabels[user.role]?.label || user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? (
                      <span className="text-sm text-slate-500">All clinics</span>
                    ) : user.clinicAccess.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.clinicAccess.map(({ clinic }) => (
                          <span
                            key={clinic.id}
                            className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                          >
                            {clinic.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">None assigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={clsx(
                      'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                      user.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    )}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {user.lastLogin
                      ? format(parseISO(user.lastLogin), 'MMM d, h:mm a')
                      : 'Never'
                    }
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                      <MoreVertical className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="py-12 text-center">
            <UserCircle className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 text-slate-500">No users found</p>
          </div>
        )}
      </div>
    </div>
  );
}

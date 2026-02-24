import { useState } from 'react';
import { User, Bell, Shield, Palette, Building2, Save } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { clsx } from 'clsx';

export default function SettingsPage() {
  const { user, tenantId } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

  if (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') {
    tabs.push({ id: 'organization', label: 'Organization', icon: Building2 });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Manage your account and preferences</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar */}
        <div className="lg:w-64">
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                    activeTab === tab.id
                      ? 'bg-dental-50 text-dental-600'
                      : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-slate-900">Profile Information</h2>
                
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-dental-100 text-2xl font-bold text-dental-600">
                    {user?.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                      Change Photo
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Name</label>
                    <input
                      type="text"
                      defaultValue={user?.name}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
                    <input
                      type="email"
                      defaultValue={user?.email}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none"
                      disabled
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Role</label>
                    <input
                      type="text"
                      defaultValue={user?.role?.replace('_', ' ')}
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                      disabled
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Organization</label>
                    <input
                      type="text"
                      defaultValue={tenantId || ''}
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm capitalize"
                      disabled
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button className="flex items-center gap-2 rounded-lg bg-dental-500 px-4 py-2 text-sm font-medium text-white hover:bg-dental-600">
                    <Save className="h-4 w-4" />
                    Save Changes
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>
                
                <div className="space-y-4">
                  {[
                    { id: 'new_leads', label: 'New lead notifications', desc: 'Get notified when a new lead is assigned to you' },
                    { id: 'follow_ups', label: 'Follow-up reminders', desc: 'Receive reminders for scheduled follow-ups' },
                    { id: 'appointments', label: 'Appointment updates', desc: 'Get notified about appointment changes' },
                    { id: 'weekly_report', label: 'Weekly report', desc: 'Receive a weekly summary of your leads' },
                  ].map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                      <div>
                        <p className="font-medium text-slate-900">{item.label}</p>
                        <p className="text-sm text-slate-500">{item.desc}</p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input type="checkbox" className="peer sr-only" defaultChecked />
                        <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-dental-500 peer-focus:ring-2 peer-focus:ring-dental-500/20 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-slate-900">Security Settings</h2>
                
                <div>
                  <h3 className="mb-4 font-medium text-slate-900">Change Password</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Current Password</label>
                      <input
                        type="password"
                        className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">New Password</label>
                      <input
                        type="password"
                        className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirm New Password</label>
                      <input
                        type="password"
                        className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-dental-500 focus:outline-none"
                      />
                    </div>
                    <button className="rounded-lg bg-dental-500 px-4 py-2 text-sm font-medium text-white hover:bg-dental-600">
                      Update Password
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-slate-900">Appearance</h2>
                
                <div>
                  <label className="mb-3 block font-medium text-slate-900">Theme</label>
                  <div className="flex gap-4">
                    {['light', 'dark', 'system'].map((theme) => (
                      <button
                        key={theme}
                        className={clsx(
                          'rounded-lg border-2 px-6 py-3 text-sm font-medium capitalize transition-colors',
                          theme === 'light'
                            ? 'border-dental-500 bg-dental-50 text-dental-600'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        )}
                      >
                        {theme}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'organization' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-slate-900">Organization Settings</h2>
                <p className="text-slate-500">Manage your organization's branding and settings.</p>
                
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-700">
                    Organization settings are coming soon. You'll be able to customize your logo, colors, and more.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

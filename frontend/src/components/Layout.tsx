import { Link, useLocation } from 'react-router-dom';
import { 
  Users, 
  Calendar, 
  BarChart3, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  UserCircle,
  ChevronDown,
  Building2
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { clsx } from 'clsx';

// Tooth icon SVG
const ToothIcon = () => (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
    <path d="M12 2C9.5 2 7.5 3 6.5 5C5.5 7 5 9 5 11C5 13 5.5 15 6 17C6.5 19 7 21 8 22C8.5 22.5 9 22.5 9.5 22C10 21.5 10.5 20 11 18C11.5 16 12 14 12 14C12 14 12.5 16 13 18C13.5 20 14 21.5 14.5 22C15 22.5 15.5 22.5 16 22C17 21 17.5 19 18 17C18.5 15 19 13 19 11C19 9 18.5 7 17.5 5C16.5 3 14.5 2 12 2Z"/>
  </svg>
);

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: '/leads', label: 'Leads', icon: Users, adminOnly: false },
  { path: '/appointments', label: 'Appointments', icon: Calendar, adminOnly: false },
  { path: '/analytics', label: 'Analytics', icon: BarChart3, adminOnly: true },
  { path: '/users', label: 'Users', icon: UserCircle, adminOnly: true },
  { path: '/settings', label: 'Settings', icon: Settings, adminOnly: false },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { user, logout, tenantId } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const filteredNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-64 transform bg-gradient-dark transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-6 text-white">
          <div className="text-dental-400">
            <ToothIcon />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold">DentraCRM</h1>
            {tenantId && (
              <p className="text-xs text-slate-400 capitalize">{tenantId.replace(/-/g, ' ')}</p>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-4">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={clsx(
                  'mb-1 flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all',
                  isActive 
                    ? 'bg-dental-500/20 text-dental-400' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Clinic selector (for admin) */}
        {isAdmin && user?.clinics && user.clinics.length > 0 && (
          <div className="absolute bottom-24 left-4 right-4">
            <div className="rounded-lg bg-slate-800 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
                <Building2 className="h-4 w-4" />
                <span>Clinics</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {user.clinics.map((clinic) => (
                  <span
                    key={clinic.id}
                    className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-300"
                  >
                    {clinic.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* User menu */}
        <div className="absolute bottom-4 left-4 right-4">
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-sm lg:px-8">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>

          {/* Page title - could be dynamic based on route */}
          <h2 className="text-lg font-semibold text-slate-900 lg:text-xl">
            {filteredNavItems.find(item => location.pathname.startsWith(item.path))?.label || 'Dashboard'}
          </h2>

          {/* User dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dental-500 text-white">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="hidden text-left sm:block">
                <p className="font-medium text-slate-900">{user?.name}</p>
                <p className="text-xs text-slate-500">{user?.role?.replace('_', ' ')}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>

            {userMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 z-50 mt-2 w-48 origin-top-right animate-scale-in rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5">
                  <div className="border-b border-slate-100 px-4 py-2">
                    <p className="text-sm font-medium text-slate-900">{user?.email}</p>
                  </div>
                  <Link
                    to="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Settings
                  </Link>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

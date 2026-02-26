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
  Building2,
  FileText
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore, isAdminRole, isClinicStaffRole, isLeadUserRole, Role } from '../store/authStore';
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

/**
 * Navigation items with role-based access
 * User Story C4: Clinic staff sees only appointments
 * User Story A1: Admin sees all items
 * User Story L1: Lead users see leads and appointments
 */
type NavItemAccess = 'all' | 'admin' | 'lead_access';

interface NavItem {
  path: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  access: NavItemAccess;
}

const navItems: NavItem[] = [
  { path: '/leads', label: 'Leads', icon: Users, access: 'lead_access' },
  { path: '/appointments', label: 'Appointments', icon: Calendar, access: 'all' },
  { path: '/analytics', label: 'Analytics', icon: BarChart3, access: 'admin' },
  { path: '/reports', label: 'Reports', icon: FileText, access: 'admin' },
  { path: '/users', label: 'Users', icon: UserCircle, access: 'admin' },
  { path: '/settings', label: 'Settings', icon: Settings, access: 'all' },
];

/**
 * Check if a user with given role can access a nav item
 */
const canAccessNavItem = (role: Role, access: NavItemAccess): boolean => {
  if (access === 'all') return true;
  if (access === 'admin') return isAdminRole(role);
  if (access === 'lead_access') return isAdminRole(role) || isLeadUserRole(role);
  return false;
};

/**
 * Get role display label
 */
const getRoleLabel = (role: Role): string => {
  switch (role) {
    case 'SUPER_ADMIN': return 'Super Admin';
    case 'ADMIN': return 'Admin';
    case 'LEAD_USER': return 'Lead User';
    case 'CLINIC_STAFF': return 'Clinic Staff';
    default: return String(role).replace('_', ' ');
  }
};

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { user, logout, tenantId } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isAdmin = user?.role ? isAdminRole(user.role) : false;
  const isStaff = user?.role ? isClinicStaffRole(user.role) : false;

  // Filter nav items based on role
  const filteredNavItems = navItems.filter(item => 
    user?.role ? canAccessNavItem(user.role, item.access) : false
  );

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

        {/* Role indicator and clinic selector */}
        <div className="absolute bottom-24 left-4 right-4 space-y-3">
          {/* Role badge */}
          <div className={clsx(
            'rounded-lg p-3',
            isAdmin ? 'bg-dental-500/20' : isStaff ? 'bg-amber-500/20' : 'bg-blue-500/20'
          )}>
            <div className="flex items-center gap-2">
              <UserCircle className={clsx(
                'h-5 w-5',
                isAdmin ? 'text-dental-400' : isStaff ? 'text-amber-400' : 'text-blue-400'
              )} />
              <div>
                <p className={clsx(
                  'text-sm font-medium',
                  isAdmin ? 'text-dental-400' : isStaff ? 'text-amber-400' : 'text-blue-400'
                )}>
                  {user?.role ? getRoleLabel(user.role) : 'User'}
                </p>
                <p className="text-xs text-slate-400">
                  {isAdmin ? 'Full CRM Access' : isStaff ? 'Appointments Only' : 'Lead Management'}
                </p>
              </div>
            </div>
          </div>

          {/* Clinic selector (for admin) */}
          {isAdmin && user?.clinics && user.clinics.length > 0 && (
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
          )}

          {/* Clinic info for staff (read-only) */}
          {isStaff && user?.location && (
            <div className="rounded-lg bg-slate-800 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Building2 className="h-4 w-4" />
                <span>Your Clinic</span>
              </div>
              <p className="mt-1 text-sm font-medium capitalize text-slate-300">
                {user.location.replace(/-/g, ' ')}
              </p>
            </div>
          )}
        </div>

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
                <p className="text-xs text-slate-500">{user?.role ? getRoleLabel(user.role) : ''}</p>
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

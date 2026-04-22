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
  FileText,
  LayoutDashboard,
  CheckCircle2,
  Stethoscope,
  XCircle,
  Clock,
  PhoneOff,
  UserX,
  Inbox,
  Phone,
  PhoneCall,
  ClipboardCheck,
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
 * - 'all': visible to all roles
 * - 'admin': admin only
 * - 'lead_access': admin + lead user (not clinic staff)
 * - 'staff': clinic staff only
 * - 'no_staff': admin + lead user (hide from clinic staff)
 */
type NavItemAccess = 'all' | 'admin' | 'lead_access' | 'staff' | 'no_staff';

interface NavItem {
  path: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  access: NavItemAccess;
  section?: 'main' | 'patient' | 'admin';
  /** For Lead User status tabs: link to same path with this query string */
  search?: string;
}

const navItems: NavItem[] = [
  // Staff-only summary
  { path: '/summary', label: 'Summary', icon: LayoutDashboard, access: 'staff', section: 'main' },
  // Patient journey tabs (all roles)
  { path: '/leads', label: 'Leads', icon: Users, access: 'lead_access', section: 'patient' },
  { path: '/appointments', label: 'Appointments', icon: Calendar, access: 'all', section: 'patient' },
  { path: '/visited', label: 'Visited', icon: CheckCircle2, access: 'all', section: 'patient' },
  { path: '/treatment', label: 'Treatment', icon: Stethoscope, access: 'all', section: 'patient' },
  { path: '/treatment-denied', label: 'Tx Denied', icon: XCircle, access: 'all', section: 'patient' },
  { path: '/treatment-completed', label: 'Tx Completed', icon: ClipboardCheck, access: 'all', section: 'patient' },
  { path: '/follow-ups', label: 'Follow-ups', icon: Clock, access: 'all', section: 'patient' },
  { path: '/clinical-dnr', label: 'Clinical DNR', icon: PhoneOff, access: 'all', section: 'patient' },
  { path: '/dnr-dnc', label: 'DNR/DNC', icon: PhoneOff, access: 'no_staff', section: 'patient' },
  { path: '/lost', label: 'Lost', icon: UserX, access: 'all', section: 'patient' },
  // Admin tools
  { path: '/reports', label: 'Reports', icon: FileText, access: 'no_staff', section: 'admin' },
  { path: '/analytics', label: 'Analytics', icon: BarChart3, access: 'admin', section: 'admin' },
  { path: '/users', label: 'Users', icon: UserCircle, access: 'admin', section: 'admin' },
  { path: '/settings', label: 'Settings', icon: Settings, access: 'all', section: 'admin' },
];

/** Lead User only: sidebar tabs that open Leads with status filter */
const LEAD_USER_STATUS_TABS: NavItem[] = [
  { path: '/leads', search: '?status=NEW', label: 'New', icon: Inbox, access: 'lead_access', section: 'patient' },
  { path: '/leads', search: '?status=CONNECTED', label: 'Connected', icon: Phone, access: 'lead_access', section: 'patient' },
  { path: '/leads', search: '?status=TWC', label: 'TWC', icon: PhoneCall, access: 'lead_access', section: 'patient' },
];

/**
 * Check if a user with given role can access a nav item
 */
const canAccessNavItem = (role: Role, access: NavItemAccess): boolean => {
  if (access === 'all') return true;
  if (access === 'admin') return isAdminRole(role);
  if (access === 'lead_access') return isAdminRole(role) || isLeadUserRole(role);
  if (access === 'staff') return isClinicStaffRole(role);
  if (access === 'no_staff') return !isClinicStaffRole(role);
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

  // Lead User (Telecaller): Leads, New, Connected, TWC (status tabs), Appointments, DNR/DNC, Settings
  const LEAD_USER_NAV_PATHS = ['/leads', '/appointments', '/dnr-dnc', '/settings'];
  const filteredNavItems = (() => {
    if (!user?.role) return [];
    if (user.role === 'LEAD_USER') {
      const leads = navItems.find(i => i.path === '/leads');
      const appointments = navItems.find(i => i.path === '/appointments');
      const dnrDnc = navItems.find(i => i.path === '/dnr-dnc');
      const settings = navItems.find(i => i.path === '/settings');
      return [leads, ...LEAD_USER_STATUS_TABS, appointments, dnrDnc, settings].filter(Boolean) as NavItem[];
    }
    return navItems.filter(item => canAccessNavItem(user.role!, item.access));
  })();

  // Group items by section
  const patientItems = filteredNavItems.filter(i => i.section === 'patient');
  const adminItems = filteredNavItems.filter(i => i.section === 'admin');
  const mainItems = filteredNavItems.filter(i => i.section === 'main');

  const renderNavLink = (item: NavItem) => {
    const Icon = item.icon;
    const to = item.search ? { pathname: item.path, search: item.search } : item.path;
    const isActive = item.search
      ? location.pathname === item.path && location.search === item.search
      : (location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path + '/')));

    return (
      <Link
        key={item.path + (item.search ?? '')}
        to={to}
        onClick={() => setSidebarOpen(false)}
        className={clsx(
          'mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
          isActive
            ? 'bg-dental-500/20 text-dental-400'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        )}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

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
          'fixed inset-y-0 left-0 z-50 w-56 transform bg-gradient-dark transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 px-4 text-white">
          <div className="text-dental-400">
            <ToothIcon />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold">DentraCRM</h1>
            {tenantId && (
              <p className="text-[10px] text-slate-400 capitalize">{tenantId.replace(/-/g, ' ')}</p>
            )}
          </div>
        </div>

        {/* Navigation - scrollable */}
        <nav className="flex flex-col overflow-y-auto px-3" style={{ height: 'calc(100vh - 56px - 60px)' }}>
          {/* Staff summary */}
          {mainItems.length > 0 && (
            <div className="mb-2">
              {mainItems.map(renderNavLink)}
            </div>
          )}

          {/* Patient journey section */}
          {patientItems.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Patient Journey
              </p>
              {patientItems.map(renderNavLink)}
            </div>
          )}

          {/* Admin / tools section */}
          {adminItems.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Tools
              </p>
              {adminItems.map(renderNavLink)}
            </div>
          )}

          {/* Role badge */}
          <div className="mt-auto pb-2">
            <div className={clsx(
              'rounded-lg p-2',
              isAdmin ? 'bg-dental-500/20' : isStaff ? 'bg-amber-500/20' : 'bg-blue-500/20'
            )}>
              <div className="flex items-center gap-2">
                <UserCircle className={clsx(
                  'h-4 w-4',
                  isAdmin ? 'text-dental-400' : isStaff ? 'text-amber-400' : 'text-blue-400'
                )} />
                <div>
                  <p className={clsx(
                    'text-xs font-medium',
                    isAdmin ? 'text-dental-400' : isStaff ? 'text-amber-400' : 'text-blue-400'
                  )}>
                    {user?.role ? getRoleLabel(user.role) : 'User'}
                  </p>
                </div>
              </div>
            </div>

            {/* Clinic info for staff */}
            {isStaff && user?.location && (
              <div className="mt-2 rounded-lg bg-slate-800 p-2">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <Building2 className="h-3 w-3" />
                  <span className="capitalize">{user.location.replace(/-/g, ' ')}</span>
                </div>
              </div>
            )}

            {/* Clinic selector (for admin) */}
            {isAdmin && user?.clinics && user.clinics.length > 0 && (
              <div className="mt-2 rounded-lg bg-slate-800 p-2">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <Building2 className="h-3 w-3" />
                  <span>Clinics</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {user.clinics.map((clinic) => (
                    <span
                      key={clinic.id}
                      className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300"
                    >
                      {clinic.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Sign out */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-700 px-3 py-2">
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-56">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-sm lg:px-8">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>

          {/* Page title */}
          <h2 className="text-lg font-semibold text-slate-900">
            {filteredNavItems.find(item =>
              location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path + '/'))
            )?.label || 'Dashboard'}
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

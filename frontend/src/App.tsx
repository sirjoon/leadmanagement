import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore, isAdminRole, isClinicStaffRole } from './store/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import LeadsPage from './pages/LeadsPage';
import LeadDetailPage from './pages/LeadDetailPage';
import AnalyticsPage from './pages/AnalyticsPage';
import UsersPage from './pages/UsersPage';
import AppointmentsPage from './pages/AppointmentsPage';
import SettingsPage from './pages/SettingsPage';
import ReportsPage from './pages/ReportsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-pattern">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-dental-200 border-t-dental-500 spinner" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/**
 * Role-based route protection
 * User Story C4: Clinic staff cannot access leads, analytics, or reports
 * User Story A3: Only Admin can access analytics dashboard
 */
function AdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  
  if (!user || !isAdminRole(user.role)) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mb-4 text-6xl">🔒</div>
          <h2 className="mb-2 text-xl font-semibold text-slate-900">Access Restricted</h2>
          <p className="text-slate-600">
            This section is only available to administrators. 
            Please contact your admin if you need access.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Leads route - accessible to Admin and Lead Users, NOT Clinic Staff
 * User Story C4: Clinic staff cannot view or manage leads
 */
function LeadAccessRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  
  if (!user || isClinicStaffRole(user.role)) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mb-4 text-6xl">📋</div>
          <h2 className="mb-2 text-xl font-semibold text-slate-900">Lead Management</h2>
          <p className="text-slate-600">
            Lead management is not available for clinic staff. 
            Please use the Appointments section to manage patient visits.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  const { user } = useAuthStore();
  const isStaff = user ? isClinicStaffRole(user.role) : false;
  
  // Determine default route based on role (User Story C1, C4)
  const defaultRoute = isStaff ? '/appointments' : '/leads';

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/:tenantId/login" element={<LoginPage />} />

      {/* Protected routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                {/* Default redirect based on role */}
                <Route path="/" element={<Navigate to={defaultRoute} replace />} />
                
                {/* Leads - Admin and Lead Users only (User Story C4) */}
                <Route path="/leads" element={
                  <LeadAccessRoute>
                    <LeadsPage />
                  </LeadAccessRoute>
                } />
                <Route path="/leads/:id" element={
                  <LeadAccessRoute>
                    <LeadDetailPage />
                  </LeadAccessRoute>
                } />
                
                {/* Appointments - All roles (User Story C1) */}
                <Route path="/appointments" element={<AppointmentsPage />} />
                
                {/* Analytics - Admin only (User Story A3) */}
                <Route path="/analytics" element={
                  <AdminOnlyRoute>
                    <AnalyticsPage />
                  </AdminOnlyRoute>
                } />
                
                {/* Users - Admin only (User Story A1) */}
                <Route path="/users" element={
                  <AdminOnlyRoute>
                    <UsersPage />
                  </AdminOnlyRoute>
                } />
                
                {/* Reports - Admin only (User Story A3) */}
                <Route path="/reports" element={
                  <AdminOnlyRoute>
                    <ReportsPage />
                  </AdminOnlyRoute>
                } />
                
                {/* Settings - All roles */}
                <Route path="/settings" element={<SettingsPage />} />

                {/* Catch-all: redirect unknown paths to default route */}
                <Route path="*" element={<Navigate to={defaultRoute} replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;

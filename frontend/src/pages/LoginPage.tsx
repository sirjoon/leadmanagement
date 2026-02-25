import { useState, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { clsx } from 'clsx';

// Tooth icon SVG
const ToothIcon = () => (
  <svg viewBox="0 0 24 24" className="h-16 w-16" fill="currentColor">
    <path d="M12 2C9.5 2 7.5 3 6.5 5C5.5 7 5 9 5 11C5 13 5.5 15 6 17C6.5 19 7 21 8 22C8.5 22.5 9 22.5 9.5 22C10 21.5 10.5 20 11 18C11.5 16 12 14 12 14C12 14 12.5 16 13 18C13.5 20 14 21.5 14.5 22C15 22.5 15.5 22.5 16 22C17 21 17.5 19 18 17C18.5 15 19 13 19 11C19 9 18.5 7 17.5 5C16.5 3 14.5 2 12 2Z"/>
  </svg>
);

export default function LoginPage() {
  const navigate = useNavigate();
  const { tenantId: urlTenantId } = useParams();
  const { login, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState(urlTenantId || '');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      await login(email, password, tenantId);
      navigate('/leads');
    } catch {
      // Error is handled by the store
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden w-1/2 bg-gradient-dental p-12 lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-3 text-white">
            <ToothIcon />
            <div>
              <h1 className="font-display text-3xl font-bold">DentraCRM</h1>
              <p className="text-dental-200">Lead Management for Dental Clinics</p>
            </div>
          </div>
        </div>

        <div className="space-y-8 text-white">
          <div className="animate-in delay-75">
            <h2 className="font-display text-4xl font-bold leading-tight">
              Transform Your Patient Pipeline
            </h2>
            <p className="mt-4 text-lg text-dental-100">
              Track every lead from first contact to treatment. 
              Never lose a patient to spreadsheet chaos again.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 animate-in delay-150">
            <div className="rounded-lg bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-3xl font-bold">167+</p>
              <p className="text-sm text-dental-200">Leads Managed</p>
            </div>
            <div className="rounded-lg bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-3xl font-bold">6</p>
              <p className="text-sm text-dental-200">Clinic Locations</p>
            </div>
            <div className="rounded-lg bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-3xl font-bold">45%</p>
              <p className="text-sm text-dental-200">Conversion Rate</p>
            </div>
          </div>
        </div>

        <p className="text-sm text-dental-200 animate-in delay-225">
          © 2026 DentraCRM. Built for dental excellence.
        </p>
      </div>

      {/* Right panel - login form */}
      <div className="flex w-full flex-col justify-center px-8 lg:w-1/2 lg:px-24">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-3 text-dental-600 lg:hidden">
          <ToothIcon />
          <div>
            <h1 className="font-display text-2xl font-bold">DentraCRM</h1>
            <p className="text-sm text-slate-500">Lead Management</p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <h2 className="font-display text-3xl font-bold text-slate-900">
            Welcome back
          </h2>
          <p className="mt-2 text-slate-600">
            Sign in to your account to continue
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-600 animate-slide-down">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Tenant ID */}
            {!urlTenantId && (
              <div>
                <label htmlFor="tenant" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Organization ID
                </label>
                <input
                  id="tenant"
                  type="text"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="e.g., avmsmiles"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 transition-colors placeholder:text-slate-400 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                  required
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 transition-colors placeholder:text-slate-400 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 pr-12 text-slate-900 transition-colors placeholder:text-slate-400 focus:border-dental-500 focus:outline-none focus:ring-2 focus:ring-dental-500/20"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className={clsx(
                'group flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white transition-all',
                isLoading
                  ? 'cursor-not-allowed bg-dental-400'
                  : 'bg-dental-500 hover:bg-dental-600 active:bg-dental-700'
              )}
            >
              {isLoading ? (
                <>
                  <div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white spinner" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            Don't have an account?{' '}
            <a href="#" className="font-medium text-dental-600 hover:text-dental-700">
              Contact your admin
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

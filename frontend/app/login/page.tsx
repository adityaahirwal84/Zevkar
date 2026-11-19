'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, LayoutDashboard, LogOut } from 'lucide-react';
import { api, getDashboardRouteForRole, setStoredToken } from '@/lib/api-client';
import { DoctorBrandMark } from '@/components/NextMarketingShell';
import { useAuth } from '@/components/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, user, orgName, onboardingCompleted, onboardingStep, dashboardRoute, refreshSession, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.auth.login({ email, password });
      setStoredToken(res.access_token, res.refresh_token);
      const me = await refreshSession();
      const params = new URLSearchParams(window.location.search);
      const nextParam = params.get('next');
      if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')) {
        router.push(nextParam);
      } else if (me?.onboarding_completed === false) {
        router.push('/onboarding');
      } else {
        router.push(getDashboardRouteForRole(me?.role));
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#211D10] text-[#F0E9D9] flex flex-col justify-center items-center px-6 py-12">
      <div className="w-full max-w-md rounded-xl border border-[#363125] bg-[#171A1B] p-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link href={isAuthenticated ? dashboardRoute : '/'} aria-label={isAuthenticated ? 'Zevkar dashboard' : 'Zevkar home'} className="inline-flex items-center">
            <DoctorBrandMark />
          </Link>
          <Link href="/" className="text-xs font-medium text-[#B8AE9B] hover:text-[#F0E9D9]">
            Back to Website
          </Link>
        </div>

        {isAuthenticated ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-[#8CC59B]">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Active Workspace Session</span>
              </div>
              <h1 className="text-2xl font-bold text-[#F0E9D9]">You are already signed in</h1>
              <p className="text-xs text-[#B8AE9B]">
                Your Zevkar session is active. Continue directly to your console or sign out to switch accounts.
              </p>
            </div>

            <div className="rounded-lg border border-[#363125] bg-[#211D10] p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#B8AE9B]">Account</span>
                <span className="font-semibold text-[#F0E9D9]">{user?.name || 'Workspace User'}</span>
              </div>
              {user?.email && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#B8AE9B]">Email</span>
                  <span className="font-mono text-[#F0E9D9]">{user.email}</span>
                </div>
              )}
              {orgName && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#B8AE9B]">Organization</span>
                  <span className="font-medium text-[#F0E9D9]">{orgName}</span>
                </div>
              )}
              {user?.role && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#B8AE9B]">Role</span>
                  <span className="font-mono text-[11px] text-[#F0E9D9]">{user.role}</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {onboardingCompleted === false && (
                <Link
                  href="/onboarding"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[#544021] bg-[#211D10] hover:border-[#C52A18] py-2.5 text-sm font-semibold text-[#E2B066]"
                >
                  <span>Resume Onboarding (Step {onboardingStep}/8)</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
              <Link
                href={dashboardRoute}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-sm font-semibold text-[#F0E9D9]"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                <span>Go to Dashboard</span>
              </Link>
              <button
                type="button"
                onClick={() => logout()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[#363125] bg-[#211D10] hover:border-[#B8AE9B] py-2.5 text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9]"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign Out &amp; Switch Account</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-[#F0E9D9]">Sign in to Zevkar</h1>
            {error && <div role="alert" className="rounded-md border border-[#61231C] bg-[#2B1513] p-3 text-xs text-[#E88A7E]">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Work Email</label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Password</label>
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                />
              </div>
              <div className="text-right">
                <Link href="/forgot-password" className="text-xs text-[#B8AE9B] hover:text-[#F0E9D9]">
                  Forgot password?
                </Link>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-sm font-semibold text-[#F0E9D9]"
              >
                <span>{loading ? 'Signing in...' : 'Sign In'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
            <p className="text-xs text-center text-[#B8AE9B]">
              Need an account? <Link href="/signup" className="text-[#F0E9D9] font-semibold">Start Free</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

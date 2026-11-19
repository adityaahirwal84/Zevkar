'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, LayoutDashboard, LogOut } from 'lucide-react';
import { api, setStoredToken } from '@/lib/api-client';
import { DoctorBrandMark } from '@/components/NextMarketingShell';
import { useAuth } from '@/components/AuthProvider';

export default function SignupPage() {
  const router = useRouter();
  const { isAuthenticated, user, orgName, dashboardRoute, refreshSession, logout } = useAuth();
  const [name, setName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.auth.signup({ email, name, password, agency_name: agencyName });
      setStoredToken(res.access_token, res.refresh_token);
      await refreshSession();
      router.push('/onboarding');
    } catch (err: any) {
      setError(err?.message || 'Unable to create workspace');
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
                Your Zevkar session is active. Continue to onboarding or your dashboard, or sign out to create another workspace.
              </p>
            </div>

            <div className="rounded-lg border border-[#363125] bg-[#211D10] p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#B8AE9B]">Account</span>
                <span className="font-semibold text-[#F0E9D9]">{user?.name || 'Workspace User'}</span>
              </div>
              {orgName && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#B8AE9B]">Organization</span>
                  <span className="font-medium text-[#F0E9D9]">{orgName}</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
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
            <h1 className="text-2xl font-bold text-[#F0E9D9]">Create your Zevkar workspace</h1>
            {error && <div role="alert" className="rounded-md border border-[#61231C] bg-[#2B1513] p-3 text-xs text-[#E88A7E]">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="signup-name" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Full Name</label>
                <input
                  id="signup-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                />
              </div>
              <div>
                <label htmlFor="signup-org" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Workspace or Organization Name</label>
                <input
                  id="signup-org"
                  type="text"
                  required
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  placeholder="Northstar Automations"
                  className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                />
              </div>
              <div>
                <label htmlFor="signup-email" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Work Email</label>
                <input
                  id="signup-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@company.com"
                  className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                />
              </div>
              <div>
                <label htmlFor="signup-password" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Password (min 8 characters)</label>
                <input
                  id="signup-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-sm font-semibold text-[#F0E9D9]"
              >
                <span>{loading ? 'Creating...' : 'Create Workspace'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
            <p className="text-xs text-center text-[#B8AE9B]">
              Already registered? <Link href="/login" className="text-[#F0E9D9] font-semibold">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

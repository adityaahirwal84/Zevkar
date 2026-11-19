'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle2, MailCheck } from 'lucide-react';
import { api, setStoredToken } from '@/lib/api-client';
import { useAuth } from '@/components/AuthProvider';
import { DoctorBrandMark } from '@/components/NextMarketingShell';

export default function AcceptInvitePage() {
  const router = useRouter();
  const { isAuthenticated, user, refreshSession, logout } = useAuth();
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get('token') || '';
    setToken(tok);
    if (!tok) {
      setPreview({ valid: false, status: 'INVALID' });
      setLoading(false);
      return;
    }
    api.orgs
      .getInvitation(tok)
      .then((data) => {
        setPreview(data);
        if (data?.email) {
          setFullName((prev) => prev || data.email.split('@')[0]);
        }
      })
      .catch((err) => setError(err?.message || 'Invalid or expired invitation link.'))
      .finally(() => setLoading(false));
  }, []);

  const handleAcceptAuthenticated = async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.orgs.acceptInvitation(token);
      if (res.access_token) {
        setStoredToken(res.access_token, res.refresh_token);
      }
      await refreshSession();
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Unable to accept invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptNewAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (fullName.trim().length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.orgs.acceptInvitation(token, {
        name: fullName.trim(),
        password,
      });
      if (res.access_token) {
        setStoredToken(res.access_token, res.refresh_token);
      }
      await refreshSession();
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Unable to activate account and accept invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const loginHref = token
    ? `/login?next=${encodeURIComponent(`/accept-invite?token=${token}`)}`
    : '/login';

  return (
    <div className="min-h-screen bg-[#211D10] text-[#F0E9D9] flex flex-col items-center justify-center px-6 py-12">
      <div className="mb-8">
        <Link href="/">
          <DoctorBrandMark />
        </Link>
      </div>
      <div className="w-full max-w-md rounded-xl border border-[#363125] bg-[#171A1B] p-8 space-y-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
            <MailCheck className="w-4 h-4" />
            <span>Workspace Invitation</span>
          </div>
          <h1 className="text-2xl font-bold">Accept Team Invitation</h1>
        </div>

        {loading && <p className="text-xs text-[#B8AE9B]">Validating invitation...</p>}
        {error && (
          <div role="alert" className="rounded-lg border border-[#61231C] bg-[#2B1513] p-3 text-xs text-[#E88A7E] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {preview && !preview.valid && (
          <div className="rounded-lg border border-[#61231C] bg-[#2B1513] p-4 text-xs text-[#E88A7E]">
            This invitation is {String(preview.status || 'invalid').toLowerCase()} and cannot be accepted.
          </div>
        )}
        {preview?.valid && (
          <div className="space-y-4 text-xs">
            <div className="rounded-lg border border-[#363125] bg-[#211D10] p-4 space-y-2">
              <div className="flex justify-between gap-2">
                <span className="text-[#B8AE9B]">Organization</span>
                <span className="font-semibold text-right">{preview.agency_name}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#B8AE9B]">Invited Email</span>
                <span className="font-mono text-right break-all">{preview.email}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#B8AE9B]">Assigned Role</span>
                <span className="text-[#8CC59B] font-semibold">{preview.role}</span>
              </div>
            </div>

            {isAuthenticated ? (
              user?.email?.toLowerCase() !== preview.email?.toLowerCase() ? (
                <div className="space-y-3">
                  <p className="text-[#E2B066]">
                    You are currently signed in as {user?.email}, which does not match {preview.email}.
                  </p>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="w-full rounded-md border border-[#363125] bg-[#211D10] hover:border-[#B8AE9B] py-2.5 font-semibold"
                  >
                    Sign Out &amp; Switch Account
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleAcceptAuthenticated}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] disabled:opacity-50 py-2.5 text-sm font-semibold text-[#F0E9D9]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{submitting ? 'Accepting...' : 'Accept & Open Workspace'}</span>
                </button>
              )
            ) : preview.account_exists ? (
              <div className="space-y-3">
                <p className="text-[#B8AE9B]">
                  An existing Zevkar account matches {preview.email}. Sign in to accept your workspace invitation.
                </p>
                <Link
                  href={loginHref}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-sm font-semibold text-[#F0E9D9]"
                >
                  <span>Sign In to Accept</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <form onSubmit={handleAcceptNewAccount} className="space-y-3">
                <div>
                  <label htmlFor="invite-name" className="block font-semibold text-[#F0E9D9] mb-1">
                    Full Name
                  </label>
                  <input
                    id="invite-name"
                    type="text"
                    required
                    minLength={2}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jordan Lee"
                    className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3 py-2 text-sm text-[#F0E9D9]"
                  />
                </div>
                <div>
                  <label htmlFor="invite-password" className="block font-semibold text-[#F0E9D9] mb-1">
                    Set Password (min 8 characters)
                  </label>
                  <input
                    id="invite-password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Choose a strong password"
                    className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3 py-2 text-sm text-[#F0E9D9]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] disabled:opacity-50 py-2.5 text-sm font-semibold text-[#F0E9D9]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{submitting ? 'Activating Account...' : 'Accept Invitation & Enter Dashboard'}</span>
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

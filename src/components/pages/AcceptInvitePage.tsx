import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, MailCheck, ShieldCheck } from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { useAuth } from '../../context/AuthContext';
import { ZevkarLogo } from '../marketing/ZevkarLogo';

interface AcceptInvitePageProps {
  onNavigate: (route: AppRoute) => void;
  onAuthSuccess: (authData: {
    token?: string;
    refreshToken?: string;
    user?: any;
    agency?: any;
  }) => Promise<void> | void;
}

interface InvitationPreview {
  valid: boolean;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED' | 'INVALID';
  email?: string;
  name?: string;
  role?: string;
  expiresAt?: string;
  agencyName?: string;
  error?: string;
}

export const AcceptInvitePage: React.FC<AcceptInvitePageProps> = ({
  onNavigate,
  onAuthSuccess,
}) => {
  const { isAuthenticated, user, logout } = useAuth();
  const [token, setToken] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('token') || '';
    }
    return '';
  });
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const inspectToken = async (tok: string) => {
    const cleaned = tok.trim();
    if (!cleaned) {
      setPreview({
        valid: false,
        status: 'INVALID',
        error: 'No invitation token provided in this URL.',
      });
      return;
    }
    setLoadingPreview(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/team/invitations/${encodeURIComponent(cleaned)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPreview({
          valid: false,
          status: data.status || 'INVALID',
          error: data.error || 'Invitation link is invalid or was not found.',
        });
        return;
      }
      setPreview(data);
      if (data.name && !fullName) {
        setFullName(data.name);
      }
    } catch {
      setPreview({
        valid: false,
        status: 'INVALID',
        error: 'Unable to validate invitation link with the server.',
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    void inspectToken(token);
  }, []);

  const emailMismatch =
    Boolean(isAuthenticated && user?.email && preview?.email) &&
    user!.email.toLowerCase() !== preview!.email!.toLowerCase();

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanedToken = token.trim();
    if (!cleanedToken) {
      setError('Enter a valid invitation token.');
      return;
    }
    if (!isAuthenticated && password && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/team/invitations/${encodeURIComponent(cleanedToken)}/accept`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim() || undefined,
          password: password || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || data.detail || 'Unable to accept workspace invitation.');
        return;
      }
      setSuccessMsg(`Joined ${data.agency?.name || preview?.agencyName || 'workspace'} as ${data.user?.role || preview?.role || 'MEMBER'}. Redirecting...`);
      await onAuthSuccess(data);
    } catch (err: any) {
      setError(err?.message || 'Unable to reach workspace invitation service.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#211D10] text-[#F0E9D9]">
      <header className="border-b border-[#363125] bg-[#211D10]">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between px-6">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            aria-label="Zevkar home"
            className="group flex items-center text-[#F0E9D9]"
          >
            <ZevkarLogo size="sm" />
          </a>

          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B8AE9B] hover:text-[#F0E9D9]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Website</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-xl border border-[#363125] bg-[#171A1B] p-7 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
              <MailCheck className="h-4 w-4" aria-hidden="true" />
              <span>Workspace Invitation</span>
            </div>
            <h1 className="font-[var(--font-display)] text-2xl font-bold text-[#F0E9D9]">
              Accept Team Invitation
            </h1>
            <p className="text-xs sm:text-sm text-[#B8AE9B]">
              Validate your organization invite and enter your Zevkar control console.
            </p>
          </div>

          {loadingPreview ? (
            <div className="rounded-lg border border-[#363125] bg-[#211D10] p-4 text-xs text-[#B8AE9B]">
              Validating invitation token...
            </div>
          ) : preview && !preview.valid ? (
            <div role="alert" className="rounded-lg border border-[#61231C] bg-[#2B1513] p-4 space-y-2 text-xs text-[#E88A7E]">
              <div className="flex items-start gap-2 font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  {preview.status === 'ACCEPTED'
                    ? 'Invitation Already Accepted'
                    : preview.status === 'REVOKED'
                    ? 'Invitation Revoked'
                    : preview.status === 'EXPIRED'
                    ? 'Invitation Expired'
                    : 'Invalid Invitation'}
                </span>
              </div>
              <p>{preview.error || 'This invitation cannot be used. Ask a workspace administrator to send a fresh invite.'}</p>
            </div>
          ) : preview?.valid ? (
            <div className="rounded-lg border border-[#363125] bg-[#211D10] p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#B8AE9B]">Organization</span>
                <span className="font-semibold text-[#F0E9D9]">{preview.agencyName}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#B8AE9B]">Invited Email</span>
                <span className="font-mono text-[#F0E9D9]">{preview.email}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#B8AE9B]">Assigned Role</span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#8CC59B]">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {preview.role}
                </span>
              </div>
              {preview.expiresAt && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#B8AE9B]">Expires</span>
                  <span className="font-mono text-[#B8AE9B] tabular-nums">
                    {new Date(preview.expiresAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {error && (
            <div role="alert" className="rounded-lg border border-[#61231C] bg-[#2B1513] p-3 flex items-start gap-2 text-xs text-[#E88A7E]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div role="status" className="rounded-lg border border-[#2E4A36] bg-[#1C2A20] p-3 flex items-start gap-2 text-xs text-[#8CC59B]">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{successMsg}</span>
            </div>
          )}

          {emailMismatch && (
            <div className="rounded-lg border border-[#544021] bg-[#292114] p-4 space-y-3 text-xs text-[#E2B066]">
              <p>
                Signed in as <span className="font-mono font-semibold">{user?.email}</span>, which does not match{' '}
                <span className="font-mono font-semibold">{preview?.email}</span>.
              </p>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-md border border-[#544021] bg-[#211D10] px-3 py-1.5 font-semibold text-[#F0E9D9]"
              >
                Sign Out to Accept with {preview?.email}
              </button>
            </div>
          )}

          {(!preview || preview.valid) && !emailMismatch && (
            <form onSubmit={handleAccept} className="space-y-4 text-xs">
              <div>
                <label htmlFor="invite-token" className="block font-semibold text-[#F0E9D9] mb-1">
                  Invitation Token
                </label>
                <div className="flex gap-2">
                  <input
                    id="invite-token"
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="inv_..."
                    className="flex-1 rounded-md border border-[#363125] bg-[#211D10] px-3 py-2 font-mono text-[#F0E9D9]"
                  />
                  <button
                    type="button"
                    onClick={() => void inspectToken(token)}
                    className="rounded-md border border-[#363125] bg-[#211D10] hover:border-[#B8AE9B] px-3 py-2 font-semibold text-[#F0E9D9]"
                  >
                    Validate
                  </button>
                </div>
              </div>

              {preview?.valid && (
                <>
                  <div>
                    <label htmlFor="invite-fullname" className="block font-semibold text-[#F0E9D9] mb-1">
                      Your Full Name
                    </label>
                    <input
                      id="invite-fullname"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Alex Rivera"
                      className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3 py-2 text-sm text-[#F0E9D9]"
                    />
                  </div>

                  {!isAuthenticated && (
                    <div>
                      <label htmlFor="invite-password" className="block font-semibold text-[#F0E9D9] mb-1">
                        Set Account Password (optional if joining directly)
                      </label>
                      <input
                        id="invite-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3 py-2 text-sm text-[#F0E9D9]"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] disabled:opacity-50 py-2.5 text-sm font-semibold text-[#F0E9D9]"
                  >
                    <span>{submitting ? 'Joining Workspace...' : 'Accept Invitation & Enter Dashboard'}</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              )}
            </form>
          )}

          <div className="pt-4 border-t border-[#363125] text-center text-xs text-[#B8AE9B]">
            Already an existing member?{' '}
            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="font-semibold text-[#F0E9D9] hover:text-[#C52A18]"
            >
              Sign in here
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

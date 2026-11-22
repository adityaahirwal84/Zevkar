import React, { useState } from 'react';
import { ArrowRight, AlertCircle, CheckCircle2, ArrowLeft, LayoutDashboard, LogOut } from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { useAuth } from '../../context/AuthContext';
import { ZevkarLogo } from '../marketing/ZevkarLogo';
import { apiJson, AuthTokenResponse } from '../../lib/api';

interface AuthPageProps {
  mode: 'login' | 'signup' | 'forgot-password' | 'reset-password' | 'verify-email';
  onNavigate: (route: AppRoute) => void;
  onAuthSuccess: (
    authData: AuthTokenResponse,
    options?: { isNewSignup?: boolean }
  ) => Promise<void> | void;
}

export const AuthPages: React.FC<AuthPageProps> = ({
  mode,
  onNavigate,
  onAuthSuccess,
}) => {
  const { isAuthenticated, user, agency, dashboardRoute, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [tokenInput, setTokenInput] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('token') || '';
    }
    return '';
  });
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [devPreviewToken, setDevPreviewToken] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (mode === 'forgot-password') {
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError('Enter a valid work email address.');
        return;
      }
      setSubmitting(true);
      try {
        const data = await apiJson<{ message?: string; dev_reset_token?: string | null }>(
          '/api/v1/auth/forgot-password',
          {
            method: 'POST',
            body: JSON.stringify({ email: email.trim() }),
          }
        );
        setDevPreviewToken(data.dev_reset_token || null);
        setSuccessMessage(data.message || 'Password reset instructions prepared.');
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Unable to process password reset request.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (mode === 'reset-password') {
      if (!tokenInput.trim()) {
        setError('Enter your password reset token.');
        return;
      }
      if (newPassword.trim().length < 8) {
        setError('New password must be at least 8 characters.');
        return;
      }
      setSubmitting(true);
      try {
        const data = await apiJson<{ message?: string }>('/api/v1/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: tokenInput.trim(), new_password: newPassword }),
        });
        setSuccessMessage(data.message || 'Password updated successfully. You can now sign in.');
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Invalid or expired reset token.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (mode === 'verify-email') {
      if (!tokenInput.trim()) {
        setError('Enter your email verification token.');
        return;
      }
      setSubmitting(true);
      try {
        const data = await apiJson<{ message?: string }>('/api/v1/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ token: tokenInput.trim() }),
        });
        setSuccessMessage(data.message || 'Email verified successfully.');
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Invalid verification token.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid work email address.');
      return;
    }
    if (mode === 'signup' ? password.length < 8 : !password) {
      setError(mode === 'signup' ? 'Password must be at least 8 characters.' : 'Enter your password.');
      return;
    }
    if (mode === 'signup' && (!fullName.trim() || !agencyName.trim())) {
      setError('Full name and organization name are required.');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = mode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/signup';
      const payload: Record<string, string> =
        mode === 'login'
          ? { email: email.trim(), password }
          : {
              email: email.trim(),
              password,
              name: fullName.trim(),
              agency_name: agencyName.trim(),
            };

      const data = await apiJson<AuthTokenResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      await onAuthSuccess(data, { isNewSignup: mode === 'signup' });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to reach authentication service.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestDemoVerifyToken = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    try {
      const data = await apiJson<{ message?: string; dev_verification_token?: string | null }>(
        '/api/v1/auth/resend-verification',
        {
          method: 'POST',
          body: JSON.stringify({ email: email.trim() }),
        }
      );
      if (data.dev_verification_token) {
        setTokenInput(data.dev_verification_token);
        setDevPreviewToken(data.dev_verification_token);
      }
      setSuccessMessage(data.message || 'Verification instructions prepared.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to request verification instructions.');
    }
  };

  const handleLogout = async () => {
    setError(null);
    try {
      await logout();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to complete server logout.');
    }
  };

  const logoDestination: AppRoute = isAuthenticated ? dashboardRoute : '/';
  const showActiveSessionCard = isAuthenticated && (mode === 'login' || mode === 'signup');

  return (
    <div className="min-h-screen flex flex-col bg-[#211D10] text-[#F0E9D9]">
      <header className="border-b border-[#363125] bg-[#211D10]">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between px-6">
          <a
            href={logoDestination}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(logoDestination);
            }}
            aria-label={isAuthenticated ? 'Zevkar dashboard' : 'Zevkar home'}
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
        {showActiveSessionCard ? (
          <div className="w-full max-w-md rounded-xl border border-[#363125] bg-[#171A1B] p-7 sm:p-8 space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#8CC59B]">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Active Workspace Session</span>
              </div>
              <h1 className="font-[var(--font-display)] text-2xl font-bold text-[#F0E9D9]">
                You are already signed in
              </h1>
              <p className="text-xs sm:text-sm text-[#B8AE9B]">
                Continue to your control console or sign out to switch workspaces.
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
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#B8AE9B]">Organization</span>
                <span className="font-medium text-[#F0E9D9]">{agency.name}</span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => onNavigate(dashboardRoute)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-sm font-semibold text-[#F0E9D9] transition-colors"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                <span>Go to Dashboard</span>
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[#363125] bg-[#211D10] hover:border-[#B8AE9B] py-2.5 text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9] transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign Out &amp; Switch Account</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-md rounded-xl border border-[#363125] bg-[#171A1B] p-7 sm:p-8 space-y-6">
            <div className="space-y-2">
              <h1 className="font-[var(--font-display)] text-2xl font-bold text-[#F0E9D9]">
                {mode === 'login'
                  ? 'Sign in to Zevkar'
                  : mode === 'signup'
                  ? 'Create your Zevkar workspace'
                  : mode === 'forgot-password'
                  ? 'Forgot your password?'
                  : mode === 'reset-password'
                  ? 'Set a new password'
                  : 'Verify your email address'}
              </h1>
              <p className="text-xs sm:text-sm text-[#B8AE9B]">
                {mode === 'login'
                  ? 'Monitor workflows, inspect diagnoses, and authorize recoveries.'
                  : mode === 'signup'
                  ? 'Step 1 of onboarding: provision your workspace before connecting platforms.'
                  : mode === 'forgot-password'
                  ? 'Enter your account email to generate reset instructions.'
                  : mode === 'reset-password'
                  ? 'Paste your reset token and enter a new password (min 8 chars).'
                  : 'Confirm your email token to mark your workspace account verified.'}
              </p>
            </div>

            {error && (
              <div role="alert" className="rounded-lg border border-[#61231C] bg-[#2B1513] p-3 flex items-start gap-2.5 text-xs text-[#E88A7E]">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="rounded-lg border border-[#2E4A36] bg-[#1C2A20] p-4 space-y-3 text-xs text-[#8CC59B]">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{successMessage}</span>
                </div>
                {devPreviewToken && mode === 'forgot-password' && (
                  <div className="rounded border border-[#363125] bg-[#211D10] p-3 space-y-2 text-[#F0E9D9]">
                    <div className="text-[11px] text-[#B8AE9B]">Development Reset Token:</div>
                    <div className="font-mono text-xs break-all text-[#E2B066]">{devPreviewToken}</div>
                    <button
                      type="button"
                      onClick={() => {
                        setTokenInput(devPreviewToken);
                        onNavigate('/reset-password');
                      }}
                      className="rounded bg-[#A51D0B] hover:bg-[#C52A18] px-3 py-1.5 text-xs font-semibold text-[#F0E9D9]"
                    >
                      Continue to Reset Password
                    </button>
                  </div>
                )}
                {mode === 'reset-password' && (
                  <button
                    type="button"
                    onClick={() => onNavigate('/login')}
                    className="w-full rounded bg-[#A51D0B] hover:bg-[#C52A18] py-2 text-xs font-semibold text-[#F0E9D9]"
                  >
                    Return to Sign In
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {mode === 'signup' && (
                <>
                  <div>
                    <label htmlFor="auth-fullname" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
                      Full Name
                    </label>
                    <input
                      id="auth-fullname"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Alex Rivera"
                      className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9] placeholder:text-[#B8AE9B]/50"
                    />
                  </div>

                  <div>
                    <label htmlFor="auth-agency" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
                      Organization Name
                    </label>
                    <input
                      id="auth-agency"
                      type="text"
                      value={agencyName}
                      onChange={(e) => setAgencyName(e.target.value)}
                      placeholder="Northstar Automation Labs"
                      className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9] placeholder:text-[#B8AE9B]/50"
                    />
                  </div>
                </>
              )}

              {(mode === 'login' || mode === 'signup' || mode === 'forgot-password') && (
                <div>
                  <label htmlFor="auth-email" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
                    Work Email
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ops@company.com"
                    className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9] placeholder:text-[#B8AE9B]/50"
                  />
                </div>
              )}

              {(mode === 'login' || mode === 'signup') && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="auth-password" className="block text-xs font-semibold text-[#F0E9D9]">
                      Password
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => onNavigate('/forgot-password')}
                        className="text-xs text-[#B8AE9B] hover:text-[#F0E9D9]"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    minLength={mode === 'signup' ? 8 : undefined}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9] placeholder:text-[#B8AE9B]/50"
                  />
                </div>
              )}

              {(mode === 'reset-password' || mode === 'verify-email') && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="auth-token" className="block text-xs font-semibold text-[#F0E9D9]">
                      {mode === 'reset-password' ? 'Reset Token' : 'Verification Token'}
                    </label>
                    {mode === 'verify-email' && (
                      <button
                        type="button"
                        onClick={handleRequestDemoVerifyToken}
                        className="text-xs text-[#C52A18] hover:underline"
                      >
                        Generate dev token
                      </button>
                    )}
                  </div>
                  <input
                    id="auth-token"
                    type="text"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder={mode === 'reset-password' ? 'rst_...' : 'vrf_...'}
                    className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 font-mono text-xs text-[#F0E9D9] placeholder:text-[#B8AE9B]/50"
                  />
                </div>
              )}

              {mode === 'reset-password' && (
                <div>
                  <label htmlFor="auth-new-password" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
                    New Password
                  </label>
                  <input
                    id="auth-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9] placeholder:text-[#B8AE9B]/50"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] disabled:opacity-50 py-2.5 text-sm font-semibold text-[#F0E9D9] transition-colors"
              >
                <span>
                  {submitting
                    ? 'Processing...'
                    : mode === 'login'
                    ? 'Sign In & Open Console'
                    : mode === 'signup'
                    ? 'Create Organization & Continue'
                    : mode === 'forgot-password'
                    ? 'Request Reset Token'
                    : mode === 'reset-password'
                    ? 'Update Password'
                    : 'Verify Email'}
                </span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>

            <div className="pt-4 border-t border-[#363125] text-center text-xs text-[#B8AE9B] space-y-2">
              {mode === 'login' ? (
                <div>
                  New to Zevkar?{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('/signup')}
                    className="font-semibold text-[#F0E9D9] hover:text-[#C52A18]"
                  >
                    Create an account
                  </button>
                </div>
              ) : (
                <div>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('/login')}
                    className="font-semibold text-[#F0E9D9] hover:text-[#C52A18]"
                  >
                    Sign in
                  </button>
                </div>
              )}
              <div className="flex items-center justify-center gap-3 text-[11px]">
                <button
                  type="button"
                  onClick={() => onNavigate('/verify-email')}
                  className="hover:text-[#F0E9D9]"
                >
                  Verify email token
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => onNavigate('/reset-password')}
                  className="hover:text-[#F0E9D9]"
                >
                  Have a reset token?
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

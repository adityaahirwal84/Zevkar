'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { DoctorBrandMark } from '@/components/NextMarketingShell';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('token');
      if (q) setToken(q);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token.trim()) {
      setError('Reset token is required.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await api.auth.resetPassword({ token: token.trim(), new_password: newPassword });
      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'Unable to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#211D10] text-[#F0E9D9] flex flex-col justify-center items-center px-6 py-12">
      <div className="w-full max-w-md rounded-xl border border-[#363125] bg-[#171A1B] p-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center">
            <DoctorBrandMark />
          </Link>
          <Link href="/login" className="text-xs font-medium text-[#B8AE9B] hover:text-[#F0E9D9]">
            Sign In
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-[#F0E9D9]">Set a new password</h1>

        {done ? (
          <div className="rounded-lg border border-[#2E4A36] bg-[#1C2A20] p-4 space-y-4 text-xs text-[#F0E9D9]">
            <div className="flex items-center gap-2 font-semibold text-[#8CC59B]">
              <CheckCircle2 className="h-4 w-4" />
              <span>Password Updated</span>
            </div>
            <p>Your password has been updated cleanly. Sign in with your new credentials.</p>
            <Link href="/login" className="block text-center rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-sm font-semibold text-[#F0E9D9]">
              Go to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div role="alert" className="rounded-md border border-[#61231C] bg-[#2B1513] p-3 text-xs text-[#E88A7E]">{error}</div>}
            <div>
              <label htmlFor="reset-token" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Reset Token</label>
              <input
                id="reset-token"
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste reset token"
                className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm font-mono text-[#F0E9D9]"
              />
            </div>
            <div>
              <label htmlFor="reset-password" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">New Password</label>
              <input
                id="reset-password"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-sm font-semibold text-[#F0E9D9]"
            >
              {loading ? 'Updating...' : 'Confirm Password Reset'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

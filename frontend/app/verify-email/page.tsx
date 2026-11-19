'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { DoctorBrandMark } from '@/components/NextMarketingShell';

export default function VerifyEmailPage() {
  const [token, setToken] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
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
      setError('Verification token is required.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.auth.verifyEmail(token.trim());
      setVerifiedEmail(res.email || 'Account email');
    } catch (err: any) {
      setError(err?.message || 'Unable to verify email token');
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
          <Link href="/dashboard" className="text-xs font-medium text-[#B8AE9B] hover:text-[#F0E9D9]">
            Dashboard
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-[#F0E9D9]">Verify your email</h1>

        {verifiedEmail ? (
          <div className="rounded-lg border border-[#2E4A36] bg-[#1C2A20] p-4 space-y-4 text-xs text-[#F0E9D9]">
            <div className="flex items-center gap-2 font-semibold text-[#8CC59B]">
              <CheckCircle2 className="h-4 w-4" />
              <span>Email Verified</span>
            </div>
            <p>{verifiedEmail} is confirmed. Continue into your Zevkar workspace.</p>
            <Link href="/dashboard" className="block text-center rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-sm font-semibold text-[#F0E9D9]">
              Open Dashboard
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div role="alert" className="rounded-md border border-[#61231C] bg-[#2B1513] p-3 text-xs text-[#E88A7E]">{error}</div>}
            <div>
              <label htmlFor="verify-token" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Verification Token</label>
              <input
                id="verify-token"
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste verification token"
                className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm font-mono text-[#F0E9D9]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-sm font-semibold text-[#F0E9D9]"
            >
              {loading ? 'Verifying...' : 'Verify Email'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

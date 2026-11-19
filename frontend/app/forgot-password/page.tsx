'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api-client';
import { DoctorBrandMark } from '@/components/NextMarketingShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<{ message: string; token?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.auth.forgotPassword(email.trim());
      setResult({ message: res.message, token: res.dev_reset_token || res.reset_token });
    } catch (err: any) {
      setError(err?.message || 'Failed to generate reset token');
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

        <h1 className="text-2xl font-bold text-[#F0E9D9]">Reset your password</h1>

        {result ? (
          <div className="rounded-md border border-[#363125] bg-[#202326] p-4 text-xs text-[#B8AE9B] space-y-3">
            <p className="text-[#F0E9D9]">{result.message}</p>
            {result.token && (
              <div className="rounded border border-[#363125] bg-[#211D10] p-2.5 font-mono text-[11px] text-[#F0E9D9] break-all">
                Reset Token: {result.token}
              </div>
            )}
            <Link
              href={result.token ? `/reset-password?token=${encodeURIComponent(result.token)}` : '/reset-password'}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-sm font-semibold text-[#F0E9D9]"
            >
              <span>Continue to Reset Password</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div role="alert" className="rounded-md border border-[#61231C] bg-[#2B1513] p-3 text-xs text-[#E88A7E]">{error}</div>}
            <div>
              <label htmlFor="forgot-email" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Work Email</label>
              <input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-sm font-semibold text-[#F0E9D9]"
            >
              {loading ? 'Processing...' : 'Request Password Reset'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

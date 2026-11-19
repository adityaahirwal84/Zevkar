'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { DoctorBrandMark } from '@/components/NextMarketingShell';
import { AlertsSlaConsole } from '@/components/AlertsSlaConsole';

export default function AlertsSlaDashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, orgName, dashboardRoute } = useAuth();
  const [timezone, setTimezone] = useState<string>('UTC');

  useEffect(() => {
    try {
      setTimezone((user as any)?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    } catch {
      setTimezone('UTC');
    }
  }, [user]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login?next=/dashboard/alerts');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#1B180D] text-[#E8E3D8] flex items-center justify-center text-xs text-[#B5AA99]">
        Verifying workspace session...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1B180D] text-[#E8E3D8] flex flex-col">
      <header className="border-b border-[#2E2D26] bg-[#1B180D] px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={dashboardRoute} aria-label="Zevkar dashboard home" className="flex items-center">
            <DoctorBrandMark />
          </Link>
          <Link
            href={dashboardRoute}
            className="inline-flex items-center gap-1.5 text-xs text-[#B5AA99] hover:text-[#E9E5DC]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Overview</span>
          </Link>
          {orgName && (
            <span className="hidden md:inline-flex items-center rounded-md border border-[#383838] bg-[#202020] px-2.5 py-1 text-xs font-medium text-[#E9E5DC]">
              {orgName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden xl:inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] px-2.5 py-1 text-[11px] font-mono text-[#B5AA99]">
            <Clock className="w-3 h-3 text-[#C52A18]" />
            {timezone}
          </span>
          <Link
            href="/dashboard/recovery"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#544021] bg-[#211D10] hover:border-[#C52A18] px-3 py-1.5 text-xs font-medium text-[#E9E5DC] transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#C52A18]" aria-hidden="true" />
            <span>Recovery Engine</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        <AlertsSlaConsole timezone={timezone} userRole={user?.role} />
      </main>
    </div>
  );
}

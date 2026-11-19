'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Cpu } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { DoctorBrandMark } from '@/components/NextMarketingShell';
import { ControlCenterConsole } from '@/components/ControlCenterConsole';

export default function ControlCenterPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, orgName, dashboardRoute } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="min-h-screen bg-[#1B180D] text-[#E8E3D8] flex flex-col">
      <header className="border-b border-[#2E2D26] bg-[#1B180D] px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={dashboardRoute} className="flex items-center">
            <DoctorBrandMark />
          </Link>
          {orgName && (
            <span className="hidden md:inline-flex items-center rounded-md border border-[#383838] bg-[#202020] px-2.5 py-1 text-xs font-medium text-[#E9E5DC]">
              {orgName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono text-[#E2B066]">
            <Cpu className="w-3.5 h-3.5 text-[#C52A18]" />
            Central Automation Control Center
          </span>
          <Link
            href={dashboardRoute}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] px-3 py-1.5 text-xs font-medium text-[#E9E5DC]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Console</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        <ControlCenterConsole />
      </main>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { resolveCtaHref } from '@/lib/api-client';
import { useAuth } from '@/components/AuthProvider';

export function HomeHeroActions() {
  const { isAuthenticated, user } = useAuth();
  const primaryHref = resolveCtaHref(isAuthenticated, user?.role, '/signup');

  return (
    <div className="pt-2 flex flex-wrap items-center gap-4">
      <Link
        href={primaryHref}
        className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-6 py-3 text-sm font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap"
      >
        <span>{isAuthenticated ? 'Go to Dashboard' : 'Start Free'}</span>
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
      <Link
        href="/product"
        className="inline-flex items-center rounded-md border border-[#363125] bg-[#171A1B] hover:border-[#B8AE9B] px-6 py-3 text-sm font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap"
      >
        Explore Product
      </Link>
    </div>
  );
}

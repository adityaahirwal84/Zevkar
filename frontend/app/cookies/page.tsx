import type { Metadata } from 'next';
import Link from 'next/link';
import { NextMarketingShell } from '@/components/NextMarketingShell';

export const metadata: Metadata = {
  title: 'Cookie Policy (Draft) — Zevkar AI',
  description: 'Draft cookie and browser storage notice for Zevkar AI.',
};

export default function CookiesPage() {
  return (
    <NextMarketingShell activePath="/cookies">
      <section className="mx-auto max-w-[960px] px-6 py-16 md:py-20 space-y-8">
        <div className="space-y-3">
          <div className="text-xs font-semibold tracking-wide text-[#C52A18]">Draft Legal Notice</div>
          <h1 className="text-4xl font-extrabold text-[#F0E9D9]">Zevkar AI Cookie Policy</h1>
          <p className="text-sm text-[#B8AE9B]">
            Draft disclosure explaining strictly necessary browser storage used for authentication and workspace timezone preferences.
          </p>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2">
            <h2 className="text-lg font-bold text-[#F0E9D9]">1. Essential Authentication Storage</h2>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              Session tokens (`access_token`, `refresh_token`) and display role state are persisted strictly to maintain authenticated dashboard access across reloads.
            </p>
          </div>
          <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2">
            <h2 className="text-lg font-bold text-[#F0E9D9]">2. Preference Storage &amp; Zero Ad Trackers</h2>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              Timezone display settings (`ai_doctor_timezone`) keep dashboard timestamps readable in your local zone. Zevkar AI does not run third-party advertising trackers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <Link href="/privacy" className="text-xs font-semibold text-[#F0E9D9] hover:text-[#C52A18]">
            Privacy Policy →
          </Link>
          <Link href="/terms" className="text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9]">
            Terms of Service →
          </Link>
        </div>
      </section>
    </NextMarketingShell>
  );
}

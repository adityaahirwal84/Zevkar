import type { Metadata } from 'next';
import Link from 'next/link';
import { NextMarketingShell } from '@/components/NextMarketingShell';

export const metadata: Metadata = {
  title: 'Terms of Service (Draft) — Zevkar AI',
  description: 'Draft operational terms governing Zevkar AI runtime modes, human approval guardrails, and configurable tiers.',
};

export default function TermsPage() {
  return (
    <NextMarketingShell activePath="/terms">
      <section className="mx-auto max-w-[960px] px-6 py-16 md:py-20 space-y-8">
        <div className="space-y-3">
          <div className="text-xs font-semibold tracking-wide text-[#C52A18]">Draft Legal Notice</div>
          <h1 className="text-4xl font-extrabold text-[#F0E9D9]">Zevkar AI Terms of Service</h1>
          <p className="text-sm text-[#B8AE9B]">
            Draft operational terms governing access to Zevkar AI and recovery guardrails. Finalize with counsel prior to commercial launch.
          </p>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2">
            <h2 className="text-lg font-bold text-[#F0E9D9]">1. Supported Runtime Modes</h2>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              Zevkar AI supports self-hosted development/demo mode and configured deployments with PostgreSQL, Redis, and Gemini credentials.
            </p>
          </div>
          <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2">
            <h2 className="text-lg font-bold text-[#F0E9D9]">2. Human Approval Guardrails</h2>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              High-impact financial or customer-facing retries stay quarantined behind explicit human approval gates. Operators verify upstream state before authorizing execution.
            </p>
          </div>
          <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2">
            <h2 className="text-lg font-bold text-[#F0E9D9]">3. Configurable Tiers &amp; Roadmap</h2>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              Starter, Professional, Business, and Enterprise plans represent configurable workspace limits. Integrations labeled In Development or Planned represent active or future roadmap capabilities.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <Link href="/privacy" className="text-xs font-semibold text-[#F0E9D9] hover:text-[#C52A18]">
            Privacy Policy →
          </Link>
          <Link href="/cookies" className="text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9]">
            Cookie Policy →
          </Link>
        </div>
      </section>
    </NextMarketingShell>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { NextMarketingShell } from '@/components/NextMarketingShell';

export const metadata: Metadata = {
  title: 'About — Zevkar AI',
  description:
    'Learn why Zevkar AI was built to monitor business workflows, diagnose failures, and enable safe human-gated recovery.',
};

export default function AboutPage() {
  return (
    <NextMarketingShell activePath="/about">
      <section className="mx-auto max-w-[1320px] px-6 py-16 md:py-24 space-y-12">
        <div className="max-w-3xl space-y-4">
          <div className="text-xs font-medium tracking-wide text-[#C52A18]">About Zevkar AI</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#F0E9D9]">
            Built so business automations never fail invisibly.
          </h1>
          <p className="text-base text-[#B8AE9B] leading-relaxed">
            Modern companies run billing, lead routing, onboarding, and accounting across dozens of connected scripts and workflow nodes. When a credential expires or an upstream API times out, operations often discover the breakage hours or days later.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2">
            <h2 className="text-lg font-bold text-[#F0E9D9]">Observability Without Noise</h2>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              Every failed execution is deduplicated via SHA-256 incident fingerprinting and tied to persistent workflow watermarks.
            </p>
          </div>
          <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2">
            <h2 className="text-lg font-bold text-[#F0E9D9]">Transparent AI Diagnosis</h2>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              Gemini translates raw HTTP traces into engineering root causes while deterministic classifiers enforce safety fallbacks.
            </p>
          </div>
          <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2">
            <h2 className="text-lg font-bold text-[#F0E9D9]">Human-Gated Recovery</h2>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              Risky replays require explicit human sign-off and idempotency keys before re-executing against live customer workflows.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <Link
            href="/contact"
            className="inline-flex items-center rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]"
          >
            Contact the Founder
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center rounded-md border border-[#363125] bg-[#171A1B] hover:border-[#B8AE9B] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]"
          >
            Read Technical Docs
          </Link>
        </div>
      </section>
    </NextMarketingShell>
  );
}

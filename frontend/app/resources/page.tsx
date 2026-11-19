import type { Metadata } from 'next';
import Link from 'next/link';
import { NextMarketingShell } from '@/components/NextMarketingShell';

export const metadata: Metadata = {
  title: 'Resources — Zevkar AI',
  description:
    'Zevkar AI reliability playbooks, n8n error trigger guides, and FAQs for preventing silent workflow failures.',
};

export default function ResourcesPage() {
  return (
    <NextMarketingShell activePath="/resources">
      <section className="mx-auto max-w-[1320px] px-6 py-16 md:py-24 space-y-10">
        <div className="max-w-3xl space-y-4">
          <div className="text-xs font-medium tracking-wide text-[#C52A18]">Resources</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#F0E9D9]">
            Engineering guides &amp; reliability playbooks.
          </h1>
          <p className="text-sm text-[#B8AE9B]">
            Read full technical articles on the <Link href="/blog" className="text-[#F0E9D9] underline">Engineering Blog</Link>.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/blog/idempotent-workflow-recovery-sha256" className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2 hover:border-[#B8AE9B]">
            <h2 className="text-lg font-bold text-[#F0E9D9]">SHA-256 Recovery Idempotency Keys</h2>
            <p className="text-sm text-[#B8AE9B]">How deterministic execution hashes prevent duplicate charges during webhook retries.</p>
          </Link>
          <Link href="/blog/watermark-based-n8n-execution-sync" className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2 hover:border-[#B8AE9B]">
            <h2 className="text-lg font-bold text-[#F0E9D9]">Watermark-Based n8n Execution Polling</h2>
            <p className="text-sm text-[#B8AE9B]">How cursor pagination and overlap checkpoints catch late RUNNING to FAILED runs.</p>
          </Link>
        </div>
      </section>
    </NextMarketingShell>
  );
}

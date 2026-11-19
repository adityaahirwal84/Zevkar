import type { Metadata } from 'next';
import Link from 'next/link';
import { NextMarketingShell } from '@/components/NextMarketingShell';

export const metadata: Metadata = {
  title: 'Product — Zevkar AI',
  description:
    'Explore Zevkar AI monitoring, AI failure diagnosis, idempotent recovery engine, approval gates, multi-client isolation, and audit logs.',
};

const MODULES = [
  { num: '01', title: 'Real-Time Monitoring', desc: 'Track workflow health states, execution latency, and stuck runs across n8n, webhooks, and Python services.' },
  { num: '02', title: 'AI Failure Diagnosis', desc: 'Server-side Gemini analysis paired with deterministic classification delivers root causes and clear summaries.' },
  { num: '03', title: 'Idempotent Recovery Engine', desc: 'Execute safe retries protected by SHA-256 idempotency hashes, retry limits, and outcome verification.' },
  { num: '04', title: 'Human Approval Gates', desc: 'Quarantine financial, billing, auth, and high-risk workflows behind explicit admin sign-off.' },
  { num: '05', title: 'Execution & Watermark Sync', desc: 'Cursor-paginated n8n polling with overlap checkpoints prevents missing late RUNNING to FAILED transitions.' },
  { num: '06', title: 'Multi-Client Isolation', desc: 'Isolate client accounts, contacts, active incidents, and computed health scores per tenant.' },
  { num: '07', title: 'Analytics & Telemetry', desc: 'Inspect fleet health rates, active incident counts, and Prometheus /metrics telemetry.' },
  { num: '08', title: 'Immutable Audit Logs', desc: 'Chronological operational trail across webhooks, diagnoses, approvals, and recovery executions.' },
];

export default function ProductPage() {
  return (
    <NextMarketingShell activePath="/product">
      <section className="mx-auto max-w-[1320px] px-6 py-16 md:py-24 space-y-12">
        <div className="max-w-3xl space-y-4">
          <div className="text-xs font-medium tracking-wide text-[#C52A18]">Platform Architecture</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#F0E9D9]">
            Eight subsystems built for dependable business automations.
          </h1>
          <p className="text-base text-[#B8AE9B] leading-relaxed">
            Unify monitoring, diagnosis, approval governance, and verified recovery inside a single workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {MODULES.map((m) => (
            <div key={m.num} className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2">
              <div className="font-mono text-xs text-[#C52A18] tabular-nums">{m.num}.</div>
              <h2 className="text-xl font-bold text-[#F0E9D9]">{m.title}</h2>
              <p className="text-sm text-[#B8AE9B] leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]"
          >
            Start Free
          </Link>
          <Link
            href="/how-it-works"
            className="inline-flex items-center rounded-md border border-[#363125] bg-[#171A1B] hover:border-[#B8AE9B] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]"
          >
            View 7-Stage Pipeline
          </Link>
        </div>
      </section>
    </NextMarketingShell>
  );
}

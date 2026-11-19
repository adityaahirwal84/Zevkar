import type { Metadata } from 'next';
import Link from 'next/link';
import { NextMarketingShell } from '@/components/NextMarketingShell';

export const metadata: Metadata = {
  title: 'How It Works — Zevkar AI',
  description:
    'Follow the 7-stage lifecycle from workflow monitoring and failure detection through AI diagnosis, approval gating, and verified recovery.',
};

const STAGES = [
  { num: '01', title: 'Monitor & Poll Executions', desc: 'n8n REST connectors and webhook listeners continuously ingest workflow execution results using overlap watermarks.' },
  { num: '02', title: 'Detect & Deduplicate Incidents', desc: 'Failed or stuck runs are fingerprinted with SHA-256 hashes so recurring errors increment existing incident counters.' },
  { num: '03', title: 'Diagnose Root Cause', desc: 'Gemini AI and deterministic rules inspect stack context to output category, risk level, and remediation guidance.' },
  { num: '04', title: 'Recommend Safe Strategy', desc: 'The Recovery Engine selects a strategy such as RETRY_EXPONENTIAL_BACKOFF, MANUAL_RECOVERY, or ESCALATE_HUMAN.' },
  { num: '05', title: 'Enforce Risk & Approval Gate', desc: 'Financial, billing, database, and CRITICAL incidents pause for explicit Owner or Admin sign-off.' },
  { num: '06', title: 'Execute with Idempotency Lock', desc: 'Approved requests execute under SHA-256 idempotency locks, concurrency checks, and cooldown windows.' },
  { num: '07', title: 'Verify Upstream Outcome & Audit', desc: 'Execution status is verified remotely before recording immutable audit logs and updating workflow health scores.' },
];

export default function HowItWorksPage() {
  return (
    <NextMarketingShell activePath="/how-it-works">
      <section className="mx-auto max-w-[1320px] px-6 py-16 md:py-24 space-y-12">
        <div className="max-w-3xl space-y-4">
          <div className="text-xs font-medium tracking-wide text-[#C52A18]">7-Stage Lifecycle</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#F0E9D9]">
            From silent breakage to verified recovery.
          </h1>
          <p className="text-base text-[#B8AE9B] leading-relaxed">
            Every failure flows through an observable, auditable state machine designed to keep customer and billing workflows safe.
          </p>
        </div>

        <div className="space-y-4">
          {STAGES.map((stage) => (
            <div key={stage.num} className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-2 font-mono text-sm font-bold text-[#C52A18] tabular-nums">
                Stage {stage.num}
              </div>
              <div className="md:col-span-4 text-lg font-bold text-[#F0E9D9]">{stage.title}</div>
              <div className="md:col-span-6 text-sm text-[#B8AE9B] leading-relaxed">{stage.desc}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-4">
          <Link href="/signup" className="rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]">
            Start Free
          </Link>
          <Link href="/docs" className="rounded-md border border-[#363125] bg-[#171A1B] hover:border-[#B8AE9B] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]">
            Read Documentation
          </Link>
        </div>
      </section>
    </NextMarketingShell>
  );
}

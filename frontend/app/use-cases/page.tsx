import type { Metadata } from 'next';
import Link from 'next/link';
import { NextMarketingShell } from '@/components/NextMarketingShell';

export const metadata: Metadata = {
  title: 'Use Cases — Zevkar AI',
  description:
    'Discover how automation agencies, SaaS operations, e-commerce teams, finance workflows, and FastAPI engineers protect business automations.',
};

const USE_CASES = [
  { segment: 'Automation Agencies', title: 'Isolate multi-client fleets in one console', desc: 'Assign isolated client workspaces, track per-client health scores, and share plain-English diagnosis updates.' },
  { segment: 'SaaS Operations', title: 'Stop silent onboarding & CRM failures', desc: 'Catch trial provisioning errors, webhook drops, and CRM field mismatches before customer teams escalate.' },
  { segment: 'E-Commerce Ops', title: 'Protect Shopify & ERP order syncs', desc: 'Handle HTTP 429 rate limits during peak traffic with controlled backoff and duplicate-safe idempotency hashes.' },
  { segment: 'Finance & Billing Teams', title: 'Quarantine invoice & payout replays', desc: 'Enforce mandatory Owner or Admin approval gates on Stripe, NetSuite, and accounting workflows.' },
  { segment: 'Python & FastAPI Teams', title: 'Unify background worker exceptions', desc: 'Route Celery, cron, and FastAPI background failures into the same incident queue as your n8n pipelines.' },
  { segment: 'RevOps & Data Pipelines', title: 'Catch stalled ETL & enrichment runs', desc: 'Flag workflows stuck in RUNNING beyond expected execution thresholds before stale data spreads.' },
];

export default function UseCasesPage() {
  return (
    <NextMarketingShell activePath="/use-cases">
      <section className="mx-auto max-w-[1320px] px-6 py-16 md:py-24 space-y-12">
        <div className="max-w-3xl space-y-4">
          <div className="text-xs font-medium tracking-wide text-[#C52A18]">Use Cases</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#F0E9D9]">
            Where Zevkar AI protects daily operations.
          </h1>
          <p className="text-base text-[#B8AE9B] leading-relaxed">
            Built for teams running revenue, customer onboarding, billing, and internal infrastructure workflows across no-code and custom code tools.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {USE_CASES.map((item) => (
            <div key={item.segment} className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-3">
              <div className="text-xs font-semibold text-[#C52A18]">{item.segment}</div>
              <h2 className="text-xl font-bold text-[#F0E9D9]">{item.title}</h2>
              <p className="text-sm text-[#B8AE9B] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        <div>
          <Link href="/signup" className="inline-flex rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]">
            Configure Your Workspace
          </Link>
        </div>
      </section>
    </NextMarketingShell>
  );
}

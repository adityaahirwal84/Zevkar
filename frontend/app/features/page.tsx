import type { Metadata } from 'next';
import Link from 'next/link';
import { NextMarketingShell } from '@/components/NextMarketingShell';

export const metadata: Metadata = {
  title: 'Features — Zevkar AI',
  description:
    'Explore all 12 capabilities of Zevkar AI across monitoring, Gemini AI diagnosis, idempotent recovery, approvals, and RBAC.',
};

const FEATURES = [
  { num: '01', name: 'Execution & Failure Ingestion', status: 'Available', desc: 'Webhook listener and n8n REST API poller capture workflow failures in real time.' },
  { num: '02', name: 'SHA-256 Incident Deduplication', status: 'Available', desc: 'Identical execution crashes aggregate cleanly by occurrence count without duplicate alert storms.' },
  { num: '03', name: 'Persistent Polling Watermarks', status: 'Available', desc: 'Cursor pagination and overlap windows catch late RUNNING to FAILED transitions reliably.' },
  { num: '04', name: 'Stuck Execution Detection', status: 'Available', desc: 'Detects runs exceeding configurable standard (900s) or long-running (14,400s) thresholds.' },
  { num: '05', name: 'Gemini AI Root-Cause Diagnosis', status: 'Available', desc: 'Translates raw stack traces into engineering causes, plain-English summaries, and strategy plans.' },
  { num: '06', name: 'Deterministic Classifier Fallback', status: 'Available', desc: 'Guarantees structured AUTH, RATE_LIMIT, DATABASE, and TIMEOUT classification when AI keys are absent.' },
  { num: '07', name: '9-Stage Idempotent Recovery Engine', status: 'Available', desc: 'Protects workflow replays with deterministic SHA-256 idempotency hashes, retry caps, and cooldowns.' },
  { num: '08', name: 'Human Approval Risk Gates', status: 'Available', desc: 'Quarantines financial, billing, auth, and CRITICAL workflows until an Owner or Admin approves.' },
  { num: '09', name: 'Live Post-Retry Outcome Verification', status: 'Available', desc: 'Verifies n8n execution outcomes via GET /executions/{newId} instead of blindly marking retries resolved.' },
  { num: '10', name: 'Multi-Client Workspace Isolation', status: 'Available', desc: 'Tenant-isolated client portfolios, incident views, and computed health scores.' },
  { num: '11', name: 'Immutable Organization Audit Logs', status: 'Available', desc: 'Records chronological state changes across webhooks, diagnoses, approvals, and recovery executions.' },
  { num: '12', name: 'RBAC & JSON Archive Export', status: 'Available', desc: 'Enforces Owner/Admin/Developer/Viewer permissions alongside workspace configuration exports.' },
];

export default function FeaturesPage() {
  return (
    <NextMarketingShell activePath="/features">
      <section className="mx-auto max-w-[1320px] px-6 py-16 md:py-24 space-y-12">
        <div className="max-w-3xl space-y-4">
          <div className="text-xs font-medium tracking-wide text-[#C52A18]">Platform Capabilities</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#F0E9D9]">
            Twelve production capabilities engineered for reliable automations.
          </h1>
          <p className="text-base text-[#B8AE9B] leading-relaxed">
            Built directly on top of our Phase 6/7 monitoring and recovery architecture with deterministic fallbacks and strict approval guardrails.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.num} className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#C52A18] tabular-nums">{f.num}.</span>
                <span className="text-[#8CC59B]">{f.status}</span>
              </div>
              <h2 className="text-lg font-bold text-[#F0E9D9]">{f.name}</h2>
              <p className="text-sm text-[#B8AE9B] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-4">
          <Link href="/signup" className="rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]">
            Start Free
          </Link>
          <Link href="/how-it-works" className="rounded-md border border-[#363125] bg-[#171A1B] hover:border-[#B8AE9B] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]">
            Explore Pipeline
          </Link>
        </div>
      </section>
    </NextMarketingShell>
  );
}

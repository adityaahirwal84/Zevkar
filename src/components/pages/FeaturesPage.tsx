import React from 'react';
import {
  Activity,
  AlertOctagon,
  Clock,
  Cpu,
  Database,
  FileText,
  GitBranch,
  History,
  Layers,
  ShieldCheck,
  Terminal,
  Users,
} from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { MarketingShell } from './MarketingShell';
import { StatusBadge } from '../marketing/StatusBadge';
import { CTASection } from '../marketing/CTASection';

interface FeaturesPageProps {
  onNavigate: (route: AppRoute) => void;
}

const TWELVE_FEATURES = [
  {
    id: '01',
    title: 'Workflow Monitoring',
    status: 'Available' as const,
    summary:
      'Continuous health scoring, latency tracking, and execution status history across connected workflows.',
    icon: Activity,
  },
  {
    id: '02',
    title: 'Real n8n Execution Sync',
    status: 'Available' as const,
    summary:
      'Cursor-paginated polling against GET /api/v1/workflows and /executions with persistent watermarks and overlap windows.',
    icon: GitBranch,
  },
  {
    id: '03',
    title: 'Stuck Execution Detection',
    status: 'Available' as const,
    summary:
      'Identifies executions stalled in RUNNING state past configurable thresholds (900s default; 14,400s for long-running jobs).',
    icon: Clock,
  },
  {
    id: '04',
    title: 'Incident Deduplication & Grouping',
    status: 'Available' as const,
    summary:
      'SHA-256 incident fingerprinting groups identical execution failures with occurrence counters instead of alert floods.',
    icon: AlertOctagon,
  },
  {
    id: '05',
    title: 'AI Root-Cause Diagnosis',
    status: 'Available' as const,
    summary:
      'Server-side Google Gemini reasoning generates technical root-cause breakdowns, plain-language summaries, and action checklists.',
    icon: Cpu,
  },
  {
    id: '06',
    title: 'Deterministic Rules Fallback',
    status: 'Available' as const,
    summary:
      'Pattern-based classifier handles AUTH_FAILURE, RATE_LIMIT, TIMEOUT, SCHEMA_MISMATCH, and DATABASE_FAILURE even without AI keys.',
    icon: Terminal,
  },
  {
    id: '07',
    title: 'Intelligent Recovery Engine',
    status: 'Available' as const,
    summary:
      'Supports RETRY_EXECUTION, RETRY_AFTER_DELAY, RETRY_EXPONENTIAL_BACKOFF, MANUAL_RECOVERY, MARK_NON_RECOVERABLE, and ESCALATE_HUMAN.',
    icon: Database,
  },
  {
    id: '08',
    title: 'Human Approval Gates',
    status: 'Available' as const,
    summary:
      'Blocks unapproved execution on financial, auth, database, or CRITICAL incidents until OWNER or ADMIN signs off.',
    icon: ShieldCheck,
  },
  {
    id: '09',
    title: 'Verified Recovery Outcomes',
    status: 'Available' as const,
    summary:
      'Verifies external n8n retries against GET /executions/{newId} and enforces SHA-256 idempotency keys and cooldown windows.',
    icon: History,
  },
  {
    id: '10',
    title: 'Multi-Client Workspace Isolation',
    status: 'Available' as const,
    summary:
      'Isolates clients, workflows, credentials, and health scores per tenant organization with RBAC permissions.',
    icon: Layers,
  },
  {
    id: '11',
    title: 'Role-Based Access & Team Management',
    status: 'Available' as const,
    summary:
      'Granular OWNER, ADMIN, MEMBER, and VIEWER access controls governing team invites, policy updates, and approval decisions.',
    icon: Users,
  },
  {
    id: '12',
    title: 'Immutable Audit Logs & Notifications',
    status: 'Available' as const,
    summary:
      'Chronological append-only audit trail and deduplicated in-app notification feed scoped to your workspace timezone.',
    icon: FileText,
  },
];

export const FeaturesPage: React.FC<FeaturesPageProps> = ({ onNavigate }) => {
  return (
    <MarketingShell currentRoute="/features" onNavigate={onNavigate}>
      <section className="border-b border-[#363125] bg-[#211D10] py-16 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6 space-y-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
            Platform Features
          </div>
          <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#F0E9D9] max-w-3xl">
            Twelve production capabilities engineered for reliability.
          </h1>
          <p className="text-base sm:text-lg text-[#B8AE9B] max-w-2xl leading-relaxed">
            Every feature listed below reflects verified Phase 6 and Phase 7 backend and console modules—no speculative buzzwords or mock telemetry.
          </p>
        </div>
      </section>

      <section className="bg-[#171A1B] py-20">
        <div className="mx-auto max-w-[1320px] px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TWELVE_FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.id}
                className="rounded-xl border border-[#363125] bg-[#211D10] p-6 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#363125] bg-[#171A1B]">
                        <Icon className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                      </div>
                      <span className="font-mono text-xs text-[#B8AE9B] tabular-nums">{feat.id}</span>
                    </div>
                    <StatusBadge label={feat.status} tone="success" />
                  </div>
                  <h2 className="font-[var(--font-display)] text-lg font-bold text-[#F0E9D9]">
                    {feat.title}
                  </h2>
                  <p className="text-sm text-[#B8AE9B] leading-relaxed">{feat.summary}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <CTASection onNavigate={onNavigate} />
    </MarketingShell>
  );
};

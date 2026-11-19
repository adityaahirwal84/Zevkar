import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Cable,
  FileSearch,
  Lock,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { MarketingShell } from './MarketingShell';
import { ProductPreview } from '../marketing/ProductPreview';
import { CTASection } from '../marketing/CTASection';

interface ProductPageProps {
  onNavigate: (route: AppRoute) => void;
}

const ARCHITECTURE_LAYERS = [
  {
    stage: '01 · Ingestion & Sync',
    title: 'Paginated Polling + Signed Webhooks',
    description:
      'Pulls n8n workflows and executions using persistent checkpoints with overlap windows, alongside HMAC-verified JSON webhook ingestion at POST /api/v1/webhooks/listener.',
    icon: Cable,
  },
  {
    stage: '02 · Stuck & Anomaly Detection',
    title: 'Timeout & Consecutive-Failure Rules',
    description:
      'Flags workflows hung in RUNNING state beyond 900s (or 14,400s for long-running jobs) and tracks consecutive failures across every client workspace.',
    icon: AlertTriangle,
  },
  {
    stage: '03 · Incident Fingerprinting',
    title: 'SHA-256 Deduplication & Triage',
    description:
      'Groups repeat execution failures under a single incident record with occurrence counts, severity tiers, and time-series frequency.',
    icon: FileSearch,
  },
  {
    stage: '04 · AI & Deterministic Diagnosis',
    title: 'Dual-Engine Root-Cause Reasoning',
    description:
      'Invokes server-side Google Gemini for deep stack analysis while maintaining deterministic fallback classification when AI credentials are absent.',
    icon: Stethoscope,
  },
  {
    stage: '05 · Risk Assessment & Policy',
    title: 'Rule-Based Blast Radius Scoring',
    description:
      'Inspects incident severity, category (auth, billing, database), and organizational recovery policies before recommending any retry strategy.',
    icon: Lock,
  },
  {
    stage: '06 · Human Approval Gate',
    title: 'Explicit OWNER / ADMIN Authorization',
    description:
      'Prevents automatic retries on sensitive or high-risk workflows until an authorized operator approves or rejects the recovery request.',
    icon: ShieldCheck,
  },
  {
    stage: '07 · Verified Recovery Execution',
    title: 'Idempotent Retry + Outcome Check',
    description:
      'Dispatches verified n8n retries with SHA-256 idempotency keys and confirms the resulting execution outcome (VERIFIED_SUCCESS vs VERIFIED_FAILED).',
    icon: RotateCcw,
  },
  {
    stage: '08 · Telemetry & Audit Export',
    title: 'Prometheus Metrics & Immutable Logs',
    description:
      'Surfaces health scores, MTTR, audit history, and tenant-scoped configuration exports with full UTC/local timezone support.',
    icon: Activity,
  },
];

export const ProductPage: React.FC<ProductPageProps> = ({ onNavigate }) => {
  return (
    <MarketingShell currentRoute="/product" onNavigate={onNavigate}>
      <section className="border-b border-[#363125] bg-[#211D10] py-16 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6 space-y-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
            Product Architecture
          </div>
          <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#F0E9D9] max-w-3xl leading-[1.1]">
            An end-to-end control plane for automation observability and safe recovery.
          </h1>
          <p className="text-base sm:text-lg text-[#B8AE9B] max-w-2xl leading-relaxed">
            Zevkar AI pairs workflow monitoring with structured root-cause diagnosis, risk assessment, and approval-gated retries so teams never recover blind.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('/features')}
              className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9] transition-colors"
            >
              <span>Inspect All 12 Features</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/how-it-works')}
              className="inline-flex items-center gap-2 rounded-md border border-[#363125] bg-[#171A1B] hover:border-[#B8AE9B] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9] transition-colors"
            >
              <span>See 7-Stage Pipeline</span>
            </button>
          </div>
        </div>
      </section>

      <section className="border-b border-[#363125] bg-[#171A1B] py-20">
        <div className="mx-auto max-w-[1320px] px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {ARCHITECTURE_LAYERS.map((layer) => {
              const Icon = layer.icon;
              return (
                <div
                  key={layer.stage}
                  className="rounded-xl border border-[#363125] bg-[#211D10] p-6 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-semibold text-[#C52A18]">
                      {layer.stage}
                    </span>
                    <Icon className="h-4 w-4 text-[#B8AE9B]" aria-hidden="true" />
                  </div>
                  <h2 className="font-[var(--font-display)] text-lg font-bold text-[#F0E9D9]">
                    {layer.title}
                  </h2>
                  <p className="text-sm text-[#B8AE9B] leading-relaxed">{layer.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <ProductPreview onNavigate={onNavigate} />
      <CTASection onNavigate={onNavigate} />
    </MarketingShell>
  );
};

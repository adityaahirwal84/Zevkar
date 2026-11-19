import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  Cable,
  ClipboardCheck,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { MarketingShell } from './MarketingShell';
import { CTASection } from '../marketing/CTASection';

interface HowItWorksPageProps {
  onNavigate: (route: AppRoute) => void;
}

const SEVEN_STAGES = [
  {
    stage: '01',
    title: 'Connect Platforms & Webhooks',
    detail:
      'Add n8n clusters via URL + encrypted API key (validated against GET /api/v1/workflows) or connect FastAPI/Python workers and webhook sources to POST /api/v1/webhooks/listener.',
    output: 'Encrypted credential vault + verified connection health',
    icon: Cable,
  },
  {
    stage: '02',
    title: 'Continuous Execution Sync & Monitoring',
    detail:
      'Paginated sync workers retrieve recent runs using overlap-window watermarks so long-running executions and late failures are never skipped.',
    output: 'Upserted Workflow & Execution timeline in UTC',
    icon: Activity,
  },
  {
    stage: '03',
    title: 'Failure & Stuck Run Detection',
    detail:
      'Failed runs and workflows hung in RUNNING beyond configured timeout thresholds create deduplicated incidents keyed by SHA-256 hash.',
    output: 'Prioritized Incident with severity + occurrence counter',
    icon: AlertTriangle,
  },
  {
    stage: '04',
    title: 'AI Root-Cause Diagnosis & Strategy',
    detail:
      'Google Gemini (or deterministic fallback classifier) inspects the stack trace and payload to classify error category, explain root cause, and recommend a strategy.',
    output: 'Structured AIDiagnosis + RecoveryRecommendation',
    icon: Stethoscope,
  },
  {
    stage: '05',
    title: 'Risk Assessment & Approval Gate',
    detail:
      'Policy checks evaluate financial/auth/database sensitivity, retry count, and cooldown windows. Sensitive actions lock behind pending OWNER/ADMIN approval.',
    output: 'RecoveryRequest + ApprovalRequest governance record',
    icon: ShieldCheck,
  },
  {
    stage: '06',
    title: 'Verified Recovery Execution',
    detail:
      'Once approved, the engine triggers an idempotent retry (e.g. POST /executions/{id}/retry) and polls GET /executions/{newId} to confirm true outcome.',
    output: 'VERIFIED_SUCCESS or VERIFIED_FAILED RecoveryAttempt',
    icon: RotateCcw,
  },
  {
    stage: '07',
    title: 'Audit History & Reliability Metrics',
    detail:
      'Appends immutable audit logs, updates client health scores, recalculates MTTR metrics, and closes resolved incidents cleanly.',
    output: 'Auditable compliance trail + updated Analytics overview',
    icon: ClipboardCheck,
  },
];

export const HowItWorksPage: React.FC<HowItWorksPageProps> = ({ onNavigate }) => {
  return (
    <MarketingShell currentRoute="/how-it-works" onNavigate={onNavigate}>
      <section className="border-b border-[#363125] bg-[#211D10] py-16 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6 space-y-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
            How It Works
          </div>
          <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#F0E9D9] max-w-3xl">
            Seven deterministic stages from connection to verified recovery.
          </h1>
          <p className="text-base sm:text-lg text-[#B8AE9B] max-w-2xl leading-relaxed">
            Every automation incident follows a traceable, auditable pipeline—no silent drops and no unverified fire-and-forget retries.
          </p>
        </div>
      </section>

      <section className="bg-[#171A1B] py-20">
        <div className="mx-auto max-w-[960px] px-6 space-y-4">
          {SEVEN_STAGES.map((item, idx) => {
            const Icon = item.icon;
            return (
              <React.Fragment key={item.stage}>
                <div className="rounded-xl border border-[#363125] bg-[#211D10] p-6 sm:p-7 flex flex-col sm:flex-row gap-5">
                  <div className="flex items-start gap-3 sm:w-52 shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#363125] bg-[#171A1B] shrink-0">
                      <Icon className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="font-mono text-xs font-semibold text-[#C52A18]">
                        STAGE {item.stage}
                      </div>
                      <div className="text-xs text-[#B8AE9B] mt-0.5">Persisted State</div>
                    </div>
                  </div>

                  <div className="space-y-2.5 flex-1">
                    <h2 className="font-[var(--font-display)] text-xl font-bold text-[#F0E9D9]">
                      {item.title}
                    </h2>
                    <p className="text-sm text-[#B8AE9B] leading-relaxed">{item.detail}</p>
                    <div className="pt-2 text-xs font-mono text-[#8CC59B]">
                      Output: {item.output}
                    </div>
                  </div>
                </div>
                {idx < SEVEN_STAGES.length - 1 && (
                  <div className="flex justify-center py-1" aria-hidden="true">
                    <ArrowDown className="h-4 w-4 text-[#363125]" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </section>

      <CTASection onNavigate={onNavigate} />
    </MarketingShell>
  );
};

import React from 'react';
import {
  Activity,
  Stethoscope,
  Search,
  AlertOctagon,
  History,
  ShieldCheck,
  Users,
  BarChart3,
} from 'lucide-react';

interface FeatureItem {
  number: string;
  title: string;
  summary: string;
  outcome: string;
  icon: React.ComponentType<{ className?: string }>;
}

const FEATURES: FeatureItem[] = [
  {
    number: '01',
    title: 'Real-Time Workflow Monitoring',
    summary:
      'Continuous execution tracking across n8n clusters and webhook-connected automation pipelines.',
    outcome: 'Catch hung runs, HTTP 5xx errors, and silent trigger drops within seconds.',
    icon: Activity,
  },
  {
    number: '02',
    title: 'AI Root-Cause Diagnosis',
    summary:
      'Server-side Google Gemini analysis converts payloads, status codes, and stack traces into structured diagnostics.',
    outcome: 'Delivers both engineering breakdowns and plain-language summaries for stakeholders.',
    icon: Stethoscope,
  },
  {
    number: '03',
    title: 'Deterministic Safety Classifier',
    summary:
      'Pattern classification pairs with LLM reasoning to separate expired credentials, rate limits, and schema mismatches.',
    outcome: 'Continues classifying safely even if GEMINI_API_KEY is absent or throttled.',
    icon: Search,
  },
  {
    number: '04',
    title: 'Deduplicated Incident Queue',
    summary:
      'Groups recurring execution errors with SHA-256 incident fingerprinting, occurrence counters, and severity triage.',
    outcome: 'Keeps operational queues focused on unique root issues instead of alert storms.',
    icon: AlertOctagon,
  },
  {
    number: '05',
    title: 'Execution History & Audit Logs',
    summary:
      'Tracks workflow duration, consecutive failure streaks, last successful runs, and append-only audit trails.',
    outcome: 'Full operational accountability for every webhook, diagnosis, and retry.',
    icon: History,
  },
  {
    number: '06',
    title: 'Safe Recovery & Approval Gates',
    summary:
      'Safety gates pause financial, auth, database, and high-impact retries until an authorized operator approves.',
    outcome: 'SHA-256 idempotency keys and cooldowns prevent duplicate writes or runaway loops.',
    icon: ShieldCheck,
  },
  {
    number: '07',
    title: 'Multi-Client Workspace Isolation',
    summary:
      'Tenant-isolated client workspaces separate credentials, workflows, incidents, and health scores per customer account.',
    outcome: 'Manage multiple client operations cleanly from one unified control console.',
    icon: Users,
  },
  {
    number: '08',
    title: 'Reliability Analytics & Metrics',
    summary:
      'Aggregated workflow success rates, Mean Time to Recovery (MTTR), error category charts, and Prometheus /metrics.',
    outcome: 'Measure reliability improvements across your entire automation stack.',
    icon: BarChart3,
  },
];

export const FeatureSection: React.FC = () => {
  return (
    <section className="border-t border-[#363125] bg-[#211D10] py-20 md:py-24">
      <div className="mx-auto max-w-[1320px] px-6">
        <div className="max-w-2xl space-y-3 mb-14">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
            Core Capabilities
          </div>
          <h2 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold text-[#F0E9D9]">
            Eight foundational engines keeping automations observable and recoverable.
          </h2>
          <p className="text-base text-[#B8AE9B] leading-relaxed">
            Every module in Zevkar AI is designed around catching silent failures early, explaining root causes clearly, and gating risky recovery actions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.number}
                className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#363125] bg-[#211D10]">
                      <Icon className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                    </div>
                    <span className="font-mono text-xs text-[#B8AE9B] tabular-nums">{feat.number}</span>
                  </div>
                  <h3 className="text-base font-bold text-[#F0E9D9]">{feat.title}</h3>
                  <p className="text-sm leading-relaxed text-[#B8AE9B]">{feat.summary}</p>
                </div>
                <p className="text-xs leading-relaxed text-[#F0E9D9]/90 pt-3 border-t border-[#363125]">
                  {feat.outcome}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

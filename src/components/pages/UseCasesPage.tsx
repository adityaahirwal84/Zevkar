import React from 'react';
import {
  Building2,
  Cpu,
  DollarSign,
  Rocket,
  ShoppingCart,
  Workflow as WorkflowIcon,
} from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { MarketingShell } from './MarketingShell';
import { CTASection } from '../marketing/CTASection';

interface UseCasesPageProps {
  onNavigate: (route: AppRoute) => void;
}

const USE_CASE_CARDS = [
  {
    audience: 'Automation Agencies',
    title: 'Multi-Client Workspace Governance',
    problem: 'Agency operators managing dozens of client n8n workspaces struggle to separate alerts and status logs.',
    solution:
      'Isolates each client account into its own tenant-scoped workspace with per-client health scores, incident queues, and RBAC visibility.',
    icon: Building2,
  },
  {
    audience: 'SaaS Operations',
    title: 'Billing, Provisioning & Account Syncs',
    problem: 'Failed Stripe or CRM sync webhooks leave customer seats unprovisioned until support tickets arrive.',
    solution:
      'Captures webhook errors immediately, classifies auth/rate-limit causes, and gates financial replays behind admin approval.',
    icon: Rocket,
  },
  {
    audience: 'E-Commerce Operations',
    title: 'Order, ERP & Inventory Synchronization',
    problem: 'API throttling during high-volume sales breaks Shopify-to-ERP order posting and risks duplicate invoice retries.',
    solution:
      'Pairs exponential backoff strategies with SHA-256 idempotency keys so retries never duplicate fulfillment records.',
    icon: ShoppingCart,
  },
  {
    audience: 'Sales & Revenue Ops',
    title: 'Lead Enrichment & Routing Pipelines',
    problem: 'Rate limits or schema mismatches silently drop inbound form leads before reaching SDR sequences.',
    solution:
      'Detects stuck or failing lead workflows fast and delivers plain-English incident summaries to revenue operations owners.',
    icon: WorkflowIcon,
  },
  {
    audience: 'Finance & Accounting Ops',
    title: 'Invoice & Reconciliation Workflows',
    problem: 'Automated settlement retries cannot run unattended when ledger integrity or double-billing risk is involved.',
    solution:
      'Automatically assigns HIGH/CRITICAL risk levels and locks retries behind explicit human authorization and full audit logging.',
    icon: DollarSign,
  },
  {
    audience: 'Engineering Teams',
    title: 'Python Workers & FastAPI Services',
    problem: 'No-code n8n workflows and custom Python background workers often report errors into completely separate logs.',
    solution:
      'Unified webhook exception reporting ingests FastAPI tracebacks right beside n8n execution failures in one console.',
    icon: Cpu,
  },
];

export const UseCasesPage: React.FC<UseCasesPageProps> = ({ onNavigate }) => {
  return (
    <MarketingShell currentRoute="/use-cases" onNavigate={onNavigate}>
      <section className="border-b border-[#363125] bg-[#211D10] py-16 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6 space-y-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
            Use Cases
          </div>
          <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#F0E9D9] max-w-3xl">
            Where Zevkar AI protects daily operations.
          </h1>
          <p className="text-base sm:text-lg text-[#B8AE9B] max-w-2xl leading-relaxed">
            Built for teams running mission-critical workflows across agencies, SaaS operations, e-commerce, finance, and custom Python stacks.
          </p>
        </div>
      </section>

      <section className="bg-[#171A1B] py-20">
        <div className="mx-auto max-w-[1320px] px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {USE_CASE_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="rounded-xl border border-[#363125] bg-[#211D10] p-6 space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#363125] bg-[#171A1B]">
                    <Icon className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#B8AE9B]">
                    {card.audience}
                  </div>
                </div>
                <h2 className="font-[var(--font-display)] text-xl font-bold text-[#F0E9D9]">
                  {card.title}
                </h2>
                <div className="space-y-2 text-sm">
                  <p className="text-[#B8AE9B] leading-relaxed">
                    <strong className="text-[#F0E9D9]">Challenge:</strong> {card.problem}
                  </p>
                  <p className="text-[#B8AE9B] leading-relaxed">
                    <strong className="text-[#F0E9D9]">How it helps:</strong> {card.solution}
                  </p>
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

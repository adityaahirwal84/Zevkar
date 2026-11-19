import React from 'react';
import { Building2, Rocket, ShoppingCart, Terminal, Layers, ArrowRight, Check } from 'lucide-react';
import { AppRoute, resolveCtaRoute } from '../../lib/router';
import { useAuth } from '../../context/AuthContext';
import { MarketingShell } from './MarketingShell';
import { CTASection } from '../marketing/CTASection';

interface SolutionsPageProps {
  onNavigate: (route: AppRoute) => void;
}

const SOLUTIONS = [
  {
    audience: 'Automation Agencies',
    headline: 'Manage every client fleet from a single multi-tenant console.',
    icon: Building2,
    challenges: [
      'Switching across dozens of client n8n and Zapier accounts to spot silent failures.',
      'Translating cryptic HTTP stack traces into clear updates for non-technical clients.',
    ],
    outcomes: [
      'Isolated client portfolios with individual health scores and assigned engineers.',
      'One-click plain-language incident summaries ready to share with client stakeholders.',
      'Human approval gates before replaying high-value billing or CRM workflows.',
    ],
  },
  {
    audience: 'Startups & Operations Teams',
    headline: 'Keep revenue-critical onboarding and billing automations reliable.',
    icon: Rocket,
    challenges: [
      'Lead routing, trial provisioning, and invoicing scripts break quietly overnight.',
      'Small engineering teams lose sprint time debugging third-party webhook drops.',
    ],
    outcomes: [
      'Instant webhook failure capture and automated error categorization.',
      'Gemini AI diagnosis highlights root causes and concrete remediation steps in seconds.',
      'MTTR and reliability metrics visible across all active integrations.',
    ],
  },
  {
    audience: 'E-Commerce Businesses',
    headline: 'Protect order fulfillment, ERP syncs, and flash-sale webhook spikes.',
    icon: ShoppingCart,
    challenges: [
      'API rate limits (HTTP 429) during peak traffic drop Shopify-to-ERP invoice updates.',
      'Blind manual retries create duplicate customer orders or ledger mismatches.',
    ],
    outcomes: [
      'Automatic rate-limit detection with controlled exponential backoff recommendations.',
      'SHA-256 idempotency locks guarantee each order or invoice is recovered safely once.',
      'Estimated revenue-at-risk visibility across failing financial workflows.',
    ],
  },
  {
    audience: 'Python & FastAPI Developers',
    headline: 'Bring worker exceptions and background tasks into structured triage.',
    icon: Terminal,
    challenges: [
      'Celery tasks, ETL cron jobs, and FastAPI microservices fail inside scattered container logs.',
      'No unified retry approval workflow when database deadlocks or upstream timeouts occur.',
    ],
    outcomes: [
      'Standard HTTPS webhook ingestion accepts structured Python stack traces.',
      'Pairs deterministic error rules with Gemini AI root-cause analysis.',
      'Exposes Prometheus /metrics for Grafana alongside an actionable operational UI.',
    ],
  },
  {
    audience: 'n8n, Zapier & Make Teams',
    headline: 'One reliability layer across hybrid no-code and custom stacks.',
    icon: Layers,
    challenges: [
      'Teams outgrow single-platform error emails as workflows span n8n, Make, and Zapier.',
      'Inconsistent alerting makes it hard to tell which failure deserves immediate attention.',
    ],
    outcomes: [
      'Unified incident priority queue ranked by severity and occurrence count.',
      'Built-in connection testing and sync triggers for connected automation clusters.',
      'Full audit trail recording every alert, diagnosis, approval, and recovery run.',
    ],
  },
];

export const SolutionsPage: React.FC<SolutionsPageProps> = ({ onNavigate }) => {
  const { isAuthenticated, userRole } = useAuth();

  return (
    <MarketingShell currentRoute="/solutions" onNavigate={onNavigate}>
      <section className="border-b border-[#2E2D26] bg-[#1B180D] py-16 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6">
          <div className="max-w-3xl space-y-5">
            <div className="text-xs font-medium uppercase tracking-wider text-[#C52A18]">
              Solutions by Team
            </div>
            <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#E8E3D8] leading-tight">
              Tailored automation intelligence for agencies, startups, and engineering teams.
            </h1>
            <p className="text-base sm:text-lg text-[#A69B88] leading-relaxed">
              Whether you monitor five internal webhooks or fifty multi-client n8n and FastAPI pipelines, Zevkar AI adapts to how your team ships and operates workflows.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#171717] py-16 md:py-20">
        <div className="mx-auto max-w-[1320px] px-6 space-y-8">
          {SOLUTIONS.map((sol) => {
            const Icon = sol.icon;
            return (
              <div
                key={sol.audience}
                className="rounded-xl border border-[#2E2D26] bg-[#191B1C] p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8"
              >
                <div className="lg:col-span-5 space-y-4">
                  <div className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{sol.audience}</span>
                  </div>
                  <h2 className="font-[var(--font-display)] text-2xl font-bold text-[#E8E3D8]">
                    {sol.headline}
                  </h2>
                  <button
                    type="button"
                    onClick={() => onNavigate(resolveCtaRoute(isAuthenticated, userRole, '/signup'))}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-[#E8E3D8] hover:text-[#C52A18] transition-colors pt-2"
                  >
                    <span>
                      {isAuthenticated
                        ? `Open Console for ${sol.audience}`
                        : `Configure workspace for ${sol.audience}`}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="rounded-lg border border-[#2F3031] bg-[#1B180D] p-5 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#A69B88]">
                      Common Operational Gaps
                    </div>
                    <ul className="space-y-2.5 text-xs sm:text-sm text-[#A69B88]">
                      {sol.challenges.map((ch) => (
                        <li key={ch} className="leading-relaxed">
                          {ch}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-[#2F3031] bg-[#1B180D] p-5 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#E8E3D8]">
                      How Zevkar AI Helps
                    </div>
                    <ul className="space-y-2.5 text-xs sm:text-sm text-[#E8E3D8]">
                      {sol.outcomes.map((out) => (
                        <li key={out} className="flex items-start gap-2 leading-relaxed">
                          <Check className="h-4 w-4 text-[#C52A18] shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{out}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
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

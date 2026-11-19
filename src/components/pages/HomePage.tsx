import React from 'react';
import {
  ArrowRight,
  AlertTriangle,
  Cable,
  Activity,
  Stethoscope,
  ShieldCheck,
  Building2,
  Rocket,
  ShoppingCart,
  Terminal,
  GitBranch,
  Layers,
  Lock,
  CheckCircle2,
  ClipboardList,
} from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { MarketingShell } from './MarketingShell';
import { HeroSection } from '../marketing/HeroSection';
import { FeatureSection } from '../marketing/FeatureSection';
import { ProductPreview } from '../marketing/ProductPreview';
import { FAQSection, FAQItem } from '../marketing/FAQSection';
import { CTASection } from '../marketing/CTASection';

interface HomePageProps {
  onNavigate: (route: AppRoute) => void;
}

const SUPPORTED_PLATFORMS = [
  { name: 'n8n', status: 'Available · REST API v1 + Error Webhooks' },
  { name: 'Custom Webhooks', status: 'Available · Signed JSON + SHA-256 Dedupe' },
  { name: 'Custom Python Scripts', status: 'Available · Exception Hook Pattern' },
  { name: 'FastAPI Services', status: 'Available · Background Worker Telemetry' },
  { name: 'Zapier & Make.com', status: 'In Development · Catch Webhooks Live Today' },
];

const MONITORING_DIAGNOSIS_PILLARS = [
  {
    title: 'Continuous Workflow Monitoring',
    description:
      'Synchronizes n8n executions with persistent watermarks and overlap windows while ingesting webhook events across hybrid pipelines.',
    icon: Activity,
  },
  {
    title: 'Deduplicated Incident Queue',
    description:
      'SHA-256 incident fingerprinting rolls recurring errors into a single triage record with severity, occurrence counts, and clear ownership.',
    icon: AlertTriangle,
  },
  {
    title: 'AI Root-Cause Diagnosis',
    description:
      'Server-side Google Gemini analysis works alongside a deterministic classifier to generate technical explanations and plain-language summaries.',
    icon: Stethoscope,
  },
  {
    title: 'Idempotent Recovery Engine',
    description:
      'Creates auditable RecoveryRequest records with retry budgets, cooldown checks, and verification against live upstream execution status.',
    icon: GitBranch,
  },
  {
    title: 'Human Approval Gates',
    description:
      'Financial, billing, authentication, database, and CRITICAL incidents wait for explicit OWNER or ADMIN approval before executing retries.',
    icon: ShieldCheck,
  },
  {
    title: 'Multi-Tenant Workspace Isolation',
    description:
      'Every client, integration credential, incident, and audit log is scoped strictly per organization workspace.',
    icon: Layers,
  },
];

const HOW_IT_WORKS_FOUR = [
  {
    step: '01',
    title: 'Connect',
    description:
      'Link n8n instances via API key or send structured failure payloads from Python, FastAPI, Zapier catch hooks, and Make error routes.',
    icon: Cable,
  },
  {
    step: '02',
    title: 'Monitor',
    description:
      'Track workflow health, detect late RUNNING -> FAILED transitions, and flag workflows stuck past configurable duration limits.',
    icon: Activity,
  },
  {
    step: '03',
    title: 'Diagnose',
    description:
      'Automatically classify error categories and inspect structured root causes, recoverability flags, and recommended recovery strategies.',
    icon: Stethoscope,
  },
  {
    step: '04',
    title: 'Recover',
    description:
      'Gate sensitive retries behind human approval, run idempotent retries with cooldowns, and verify final execution status.',
    icon: ShieldCheck,
  },
];

const HOME_USE_CASES = [
  {
    title: 'Automation Agencies',
    summary:
      'Isolate client workflows, incident queues, and operational health inside one unified workspace instead of scattered tabs.',
    icon: Building2,
  },
  {
    title: 'SaaS & Operations Teams',
    summary:
      'Protect billing webhooks, CRM lead syncing, and customer onboarding flows with structured diagnosis and audit trails.',
    icon: Rocket,
  },
  {
    title: 'E-Commerce Order Pipelines',
    summary:
      'Catch ERP, inventory, and fulfillment sync failures fast while preventing double-posted orders through SHA-256 idempotency keys.',
    icon: ShoppingCart,
  },
  {
    title: 'Python & FastAPI Engineers',
    summary:
      'Centralize worker tracebacks and API timeout incidents right beside visual n8n workflows.',
    icon: Terminal,
  },
];

const HOME_FAQS: FAQItem[] = [
  {
    question: 'Does Zevkar AI automatically retry every failed workflow blindly?',
    answer:
      'No. Default organizational policy enforces approval gates (approval_required = true) and blocks blind auto-recovery on financial, authentication, database, or CRITICAL incidents until an authorized OWNER or ADMIN approves.',
  },
  {
    question: 'Which platforms are live right now vs in development?',
    answer:
      'n8n (REST API + Error Trigger webhooks), Custom Webhooks, Python workers, and FastAPI services are Available today. Native Zapier and Make.com polling/replay connectors are In Development (both already accept catch-hook error reports via POST /api/v1/webhooks/listener).',
  },
  {
    question: 'What happens if GEMINI_API_KEY is not configured or rate-limited?',
    answer:
      'Zevkar AI cleanly falls back to its built-in deterministic error classifier so incidents still receive severity classification, safe remediation steps, and recovery recommendations without blocking operations.',
  },
];

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  return (
    <MarketingShell currentRoute="/" onNavigate={onNavigate}>
      {/* 1. Hero Section */}
      <HeroSection onNavigate={onNavigate} />

      {/* 2. Platform Compatibility Strip */}
      <section className="border-b border-[#363125] bg-[#171A1B] py-10">
        <div className="mx-auto max-w-[1320px] px-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="text-xs font-medium uppercase tracking-wider text-[#B8AE9B] shrink-0">
              Platform Compatibility
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 flex-1 max-w-5xl">
              {SUPPORTED_PLATFORMS.map((stack) => (
                <div
                  key={stack.name}
                  className="rounded-lg border border-[#363125] bg-[#211D10] px-4 py-3"
                >
                  <div className="text-sm font-bold text-[#F0E9D9]">{stack.name}</div>
                  <div className="text-[11px] text-[#B8AE9B] mt-0.5 leading-snug">{stack.status}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. The Problem Section */}
      <section className="border-b border-[#363125] bg-[#211D10] py-20 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-5 space-y-4">
              <div className="text-xs font-medium uppercase tracking-wider text-[#C52A18]">
                Why Silent Failures Hurt
              </div>
              <h2 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold text-[#F0E9D9] leading-tight">
                Automations break silently—until customers or finance notice first.
              </h2>
              <p className="text-base text-[#B8AE9B] leading-relaxed">
                A revoked API key, schema shift, or rate-limit spike can halt downstream billing or lead routing for hours unless something is actively monitoring execution health, deduplicating errors, and explaining what broke.
              </p>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2.5">
                <AlertTriangle className="h-5 w-5 text-[#E2B066]" aria-hidden="true" />
                <h3 className="text-base font-bold text-[#F0E9D9]">Expired keys stall pipelines</h3>
                <p className="text-sm text-[#B8AE9B] leading-relaxed">
                  HTTP 401/403 authentication errors silently queue or fail without clear diagnostic summaries for non-technical operators.
                </p>
              </div>

              <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2.5">
                <AlertTriangle className="h-5 w-5 text-[#E2B066]" aria-hidden="true" />
                <h3 className="text-base font-bold text-[#F0E9D9]">Blind retries double-process data</h3>
                <p className="text-sm text-[#B8AE9B] leading-relaxed">
                  Re-running failed workflows without idempotency keys or approval gates can trigger duplicate invoices or customer messages.
                </p>
              </div>

              <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2.5">
                <AlertTriangle className="h-5 w-5 text-[#E2B066]" aria-hidden="true" />
                <h3 className="text-base font-bold text-[#F0E9D9]">Long-running workflows hang unseen</h3>
                <p className="text-sm text-[#B8AE9B] leading-relaxed">
                  Workflows stuck in RUNNING state never trigger standard failure callbacks unless stuck-execution detection watches duration limits.
                </p>
              </div>

              <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2.5">
                <AlertTriangle className="h-5 w-5 text-[#E2B066]" aria-hidden="true" />
                <h3 className="text-base font-bold text-[#F0E9D9]">Scattered multi-client logs</h3>
                <p className="text-sm text-[#B8AE9B] leading-relaxed">
                  Teams running n8n alongside Python scripts lack a single tenant-isolated console with chronological audit history.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 & 5. Monitoring, Diagnosis & Recovery Overview */}
      <section className="border-b border-[#363125] bg-[#171A1B] py-20 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6 space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl space-y-3">
              <div className="text-xs font-medium uppercase tracking-wider text-[#C52A18]">
                Intelligent Reliability Layer
              </div>
              <h2 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold text-[#F0E9D9]">
                Unified monitoring, AI diagnosis, and governed workflow recovery.
              </h2>
              <p className="text-sm sm:text-base text-[#B8AE9B] leading-relaxed">
                Inspect every execution, group failures deterministically, generate technical root-cause analysis, and approve safe recoveries in one control plane.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/features')}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#F0E9D9] hover:text-[#C52A18] transition-colors whitespace-nowrap shrink-0"
            >
              <span>Explore all 12 platform features</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {MONITORING_DIAGNOSIS_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={pillar.title}
                  className="rounded-xl border border-[#363125] bg-[#211D10] p-6 space-y-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#363125] bg-[#171A1B]">
                    <Icon className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                  </div>
                  <h3 className="font-[var(--font-display)] text-lg font-bold text-[#F0E9D9]">
                    {pillar.title}
                  </h3>
                  <p className="text-sm text-[#B8AE9B] leading-relaxed">{pillar.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. Interactive Product Preview */}
      <ProductPreview onNavigate={onNavigate} />

      {/* 7. How It Works (4-Step Summary + Link to 7-Stage Flow) */}
      <section className="border-t border-[#363125] bg-[#211D10] py-20 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-14">
            <div className="max-w-2xl space-y-3">
              <div className="text-xs font-medium uppercase tracking-wider text-[#B8AE9B]">
                Operational Flow
              </div>
              <h2 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold text-[#F0E9D9]">
                From incident detection to verified execution recovery.
              </h2>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('/how-it-works')}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#F0E9D9] hover:text-[#C52A18] transition-colors whitespace-nowrap shrink-0"
            >
              <span>View 7-stage process diagram</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS_FOUR.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-[#C52A18] tabular-nums">
                        STEP {item.step}
                      </span>
                      <Icon className="h-4 w-4 text-[#B8AE9B]" aria-hidden="true" />
                    </div>
                    <h3 className="font-[var(--font-display)] text-xl font-bold text-[#F0E9D9]">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-[#B8AE9B]">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 8. Eight Core Engines */}
      <FeatureSection />

      {/* 9. Use Cases Section */}
      <section className="border-t border-[#363125] bg-[#171A1B] py-20 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div className="max-w-2xl space-y-3">
              <div className="text-xs font-medium uppercase tracking-wider text-[#B8AE9B]">
                Built for Real Operations
              </div>
              <h2 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold text-[#F0E9D9]">
                Who relies on Zevkar AI.
              </h2>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('/use-cases')}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#F0E9D9] hover:text-[#C52A18] transition-colors whitespace-nowrap shrink-0"
            >
              <span>See all 6 use cases</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOME_USE_CASES.map((uc) => {
              const Icon = uc.icon;
              return (
                <div
                  key={uc.title}
                  className="rounded-xl border border-[#363125] bg-[#211D10] p-6 space-y-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#363125] bg-[#171A1B]">
                    <Icon className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-bold text-[#F0E9D9]">{uc.title}</h3>
                  <p className="text-sm text-[#B8AE9B] leading-relaxed">{uc.summary}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 10. Security & Reliability Guardrails */}
      <section className="border-t border-[#363125] bg-[#211D10] py-20">
        <div className="mx-auto max-w-[1320px] px-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-3">
            <Lock className="h-5 w-5 text-[#C52A18]" aria-hidden="true" />
            <h3 className="text-lg font-bold text-[#F0E9D9]">Server-Side Secret Boundary</h3>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              Gemini keys, integration credentials, and JWT signing secrets never ship to client bundles. Integration API keys are encrypted at rest with Fernet when configured.
            </p>
          </div>

          <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-3">
            <CheckCircle2 className="h-5 w-5 text-[#8CC59B]" aria-hidden="true" />
            <h3 className="text-lg font-bold text-[#F0E9D9]">SSRF &amp; Cooldown Protections</h3>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              External integration checks validate DNS/IP boundaries against loopback and metadata SSRF targets while enforcing cooldowns and retry budgets.
            </p>
          </div>

          <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-3">
            <ClipboardList className="h-5 w-5 text-[#E2B066]" aria-hidden="true" />
            <h3 className="text-lg font-bold text-[#F0E9D9]">Immutable Operational Audit Trail</h3>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              Every sync, diagnosis, approval decision, policy edit, and recovery execution appends a timestamped audit entry scoped by organization.
            </p>
          </div>
        </div>
      </section>

      {/* 11. Concise FAQ Preview */}
      <FAQSection
        items={HOME_FAQS}
        title="Common Questions"
        subtitle="Honest details about platform compatibility, recovery safety gates, and AI fallback behavior."
      />

      {/* 12. Bottom Conversion Section */}
      <CTASection onNavigate={onNavigate} />
    </MarketingShell>
  );
};

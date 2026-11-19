import React from 'react';
import { BookOpen, ArrowRight } from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { MarketingShell } from './MarketingShell';
import { FAQSection, FAQItem } from '../marketing/FAQSection';
import { CTASection } from '../marketing/CTASection';

interface ResourcesPageProps {
  onNavigate: (route: AppRoute) => void;
}

const GUIDES = [
  {
    category: 'Architecture Guide',
    readTime: '6 min read',
    title: 'Preventing Duplicate Charges with SHA-256 Recovery Idempotency Keys',
    summary:
      'How deterministic execution hashes stop payment webhooks and CRM updates from firing twice during transient 429 or 504 retries.',
    route: '/developers' as AppRoute,
    cta: 'Inspect Recovery API',
  },
  {
    category: 'n8n Operations',
    readTime: '5 min read',
    title: 'Wiring an n8n Error Trigger Workflow into Centralized Incident Triage',
    summary:
      'Step-by-step pattern for routing failed n8n node payloads into /api/v1/webhooks/listener with client workspace metadata.',
    route: '/integrations' as AppRoute,
    cta: 'View n8n Setup',
  },
  {
    category: 'Safety Governance',
    readTime: '4 min read',
    title: 'Designing Human Approval Gates for Financial & Healthcare Automations',
    summary:
      'When to allow autonomous backoff retries versus quarantining ledger, Stripe, or EMR mutations for human sign-off.',
    route: '/product' as AppRoute,
    cta: 'Explore Approval Gates',
  },
  {
    category: 'Python & FastAPI',
    readTime: '7 min read',
    title: 'Forwarding FastAPI Background Task Exceptions Without Losing Stack Context',
    summary:
      'Capture request IDs, upstream status codes, and exception classes cleanly using an async HTTPX hook.',
    route: '/developers' as AppRoute,
    cta: 'Read FastAPI Snippet',
  },
];

const GENERAL_FAQS: FAQItem[] = [
  {
    question: 'Which automation platforms are supported today?',
    answer:
      'Zevkar AI supports n8n (via API connector and Error Trigger webhooks), Zapier catch hooks, Make.com error handler routes, and custom Python scripts or FastAPI microservices posting JSON to /api/v1/webhooks/listener.',
  },
  {
    question: 'How does AI diagnosis work if Gemini is unavailable or unconfigured?',
    answer:
      'When GEMINI_API_KEY is configured on the server, Gemini generates structured root-cause and plain-English client explanations. If the key is absent or a request times out, the deterministic rules engine classifies the failure category and severity so triage never breaks.',
  },
  {
    question: 'Will automated recovery ever replay a financial workflow without permission?',
    answer:
      'No. Workflows involving payments, invoicing, or high consecutive failures are flagged as APPROVAL_REQUIRED. The recovery endpoint rejects unapproved retries with HTTP 403 unless an authorized admin approves the request or explicitly confirms safety override.',
  },
  {
    question: 'Can agencies separate client incidents and health scores?',
    answer:
      'Yes. Clients are modeled as isolated entities inside the workspace with dedicated contact info, workflow counts, active incident counts, and computed health scores.',
  },
];

export const ResourcesPage: React.FC<ResourcesPageProps> = ({ onNavigate }) => {
  return (
    <MarketingShell currentRoute="/resources" onNavigate={onNavigate}>
      <section className="border-b border-[#2E2D26] bg-[#1B180D] py-16 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6">
          <div className="max-w-3xl space-y-5">
            <div className="text-xs font-medium uppercase tracking-wider text-[#C52A18]">
              Guides &amp; Engineering Notes
            </div>
            <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#E8E3D8] leading-tight">
              Practical reliability playbooks for automation builders.
            </h1>
            <p className="text-base sm:text-lg text-[#A69B88] leading-relaxed">
              Implementation tutorials, error-handling patterns, and architectural answers for keeping multi-platform workflows observable and recoverable.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#171717] py-16 md:py-20">
        <div className="mx-auto max-w-[1320px] px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {GUIDES.map((guide) => (
              <article
                key={guide.title}
                className="rounded-xl border border-[#383838] bg-[#202020] p-6 sm:p-7 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-[#B5AA99]">
                    <BookOpen className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
                    <span className="font-semibold text-[#E9E5DC]">{guide.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{guide.readTime}</span>
                  </div>
                  <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC]">
                    {guide.title}
                  </h2>
                  <p className="text-sm text-[#B5AA99] leading-relaxed">{guide.summary}</p>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => onNavigate(guide.route)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#E9E5DC] hover:text-[#C52A18] transition-colors"
                  >
                    <span>{guide.cta}</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <FAQSection items={GENERAL_FAQS} />
      <CTASection onNavigate={onNavigate} />
    </MarketingShell>
  );
};

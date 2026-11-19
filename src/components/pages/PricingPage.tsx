import React from 'react';
import { AppRoute } from '../../lib/router';
import { MarketingShell } from './MarketingShell';
import { PricingCards } from '../marketing/PricingCards';
import { FAQSection, FAQItem } from '../marketing/FAQSection';
import { CTASection } from '../marketing/CTASection';

interface PricingPageProps {
  onNavigate: (route: AppRoute) => void;
}

const PRICING_FAQS: FAQItem[] = [
  {
    question: 'Are these prices hardcoded into an external checkout processor?',
    answer:
      'No. Plan pricing and limits load from configurable backend settings (/api/v1/pricing), and external Stripe/payment processing is intentionally omitted unless configured by your deployment.',
  },
  {
    question: 'Can we run Zevkar AI in self-hosted Docker Compose mode?',
    answer:
      'Yes. The repository includes Next.js frontend, FastAPI backend, PostgreSQL, Redis, and Celery workers wired together in Docker Compose.',
  },
  {
    question: 'Does Starter include approval gates and incident deduplication?',
    answer:
      'Every plan includes SHA-256 incident deduplication and human approval governance for sensitive workflows; higher plans unlock multi-client tenant workspaces and extended audit retention.',
  },
];

export const PricingPage: React.FC<PricingPageProps> = ({ onNavigate }) => {
  return (
    <MarketingShell currentRoute="/pricing" onNavigate={onNavigate}>
      <section className="border-b border-[#363125] bg-[#211D10] py-16 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6 text-center space-y-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
            Configurable Plans
          </div>
          <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#F0E9D9] max-w-3xl mx-auto">
            Transparent plans scaled by monitored workflows and governance depth.
          </h1>
          <p className="text-base sm:text-lg text-[#B8AE9B] max-w-2xl mx-auto leading-relaxed">
            Compare Starter, Professional, Business, and Enterprise capabilities cleanly—with zero deceptive checkout prompts.
          </p>
        </div>
      </section>

      <section className="bg-[#211D10] py-20">
        <div className="mx-auto max-w-[1320px] px-6">
          <PricingCards onNavigate={onNavigate} />
        </div>
      </section>

      <FAQSection
        items={PRICING_FAQS}
        title="Pricing & Billing Questions"
        subtitle="Details on configurable deployment limits and self-hosted operation."
      />
      <CTASection onNavigate={onNavigate} />
    </MarketingShell>
  );
};

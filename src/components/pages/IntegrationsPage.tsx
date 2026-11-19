import React from 'react';
import { AppRoute } from '../../lib/router';
import { MarketingShell } from './MarketingShell';
import { IntegrationGrid } from '../marketing/IntegrationGrid';
import { CTASection } from '../marketing/CTASection';

interface IntegrationsPageProps {
  onNavigate: (route: AppRoute) => void;
}

export const IntegrationsPage: React.FC<IntegrationsPageProps> = ({ onNavigate }) => {
  return (
    <MarketingShell currentRoute="/integrations" onNavigate={onNavigate}>
      <section className="border-b border-[#363125] bg-[#211D10] py-16 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6 space-y-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
            Integrations Directory
          </div>
          <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#F0E9D9] max-w-3xl">
            Honest integration status across your automation stack.
          </h1>
          <p className="text-base sm:text-lg text-[#B8AE9B] max-w-2xl leading-relaxed">
            Connect verified n8n clusters, signed custom webhooks, Python jobs, and FastAPI services immediately—and see exactly which connectors are in active development or planned.
          </p>
        </div>
      </section>

      <section className="bg-[#171A1B] py-20">
        <div className="mx-auto max-w-[1320px] px-6 space-y-10">
          <IntegrationGrid onNavigate={onNavigate} showSetupDetails enableFilter />
        </div>
      </section>

      <CTASection onNavigate={onNavigate} />
    </MarketingShell>
  );
};

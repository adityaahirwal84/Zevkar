import React from 'react';
import { ArrowRight } from 'lucide-react';
import { AppRoute, resolveCtaRoute } from '../../lib/router';
import { useAuth } from '../../context/AuthContext';

interface CTASectionProps {
  onNavigate: (route: AppRoute) => void;
  headline?: string;
  subtext?: string;
  primaryLabel?: string;
}

export const CTASection: React.FC<CTASectionProps> = ({
  onNavigate,
  headline = 'Keep Every Critical Workflow Monitored, Diagnosed, and Recoverable.',
  subtext = 'Start with your organization workspace, connect n8n or webhook pipelines in minutes, and gate risky retries behind explicit human approval.',
  primaryLabel = 'Start Free',
}) => {
  const { isAuthenticated, userRole } = useAuth();
  const targetRoute = resolveCtaRoute(isAuthenticated, userRole, '/signup');

  return (
    <section className="border-t border-[#363125] bg-[#171A1B] py-20">
      <div className="mx-auto max-w-[1000px] px-6 text-center space-y-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
          Zevkar AI
        </div>
        <h2 className="font-[var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight text-[#F0E9D9]">
          {headline}
        </h2>
        <p className="mx-auto max-w-2xl text-base text-[#B8AE9B] leading-relaxed">
          {subtext}
        </p>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => onNavigate(targetRoute)}
            className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-6 py-3 text-sm font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap"
          >
            <span>{isAuthenticated ? 'Open Console' : primaryLabel}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/docs')}
            className="inline-flex items-center rounded-md border border-[#363125] bg-[#211D10] hover:border-[#B8AE9B] px-6 py-3 text-sm font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap"
          >
            Read Documentation
          </button>
        </div>
      </div>
    </section>
  );
};

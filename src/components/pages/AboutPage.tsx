import React from 'react';
import { ArrowRight, ShieldCheck, Stethoscope, Workflow } from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { MarketingShell } from './MarketingShell';
import { CTASection } from '../marketing/CTASection';

interface AboutPageProps {
  onNavigate: (route: AppRoute) => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate }) => {
  return (
    <MarketingShell currentRoute="/about" onNavigate={onNavigate}>
      <section className="border-b border-[#363125] bg-[#211D10] py-16 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6 space-y-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
            About Zevkar AI
          </div>
          <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#F0E9D9] max-w-3xl leading-tight">
            Built to stop silent workflow failures before they quietly erode operations.
          </h1>
          <p className="text-base sm:text-lg text-[#B8AE9B] max-w-2xl leading-relaxed">
            Zevkar AI focuses on one engineering discipline: bringing reliability engineering, plain-language diagnosis, and safe human-governed recovery to business automations.
          </p>
        </div>
      </section>

      <section className="border-b border-[#363125] bg-[#171A1B] py-20">
        <div className="mx-auto max-w-[1320px] px-6 grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-4">
            <h2 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold text-[#F0E9D9]">
              Why this platform exists
            </h2>
            <p className="text-sm sm:text-base text-[#B8AE9B] leading-relaxed">
              Modern operations run on interconnected workflows: n8n pipelines, FastAPI background jobs, billing webhooks, and database syncs. When those steps break, teams often discover the problem days later through missing invoices or unanswered leads.
            </p>
            <p className="text-sm sm:text-base text-[#B8AE9B] leading-relaxed">
              Rather than building another noisy alert inbox or an unsafe auto-retry bot, Zevkar AI pairs deterministic safety checks with Gemini root-cause analysis and explicit human approval gates.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="rounded-xl border border-[#363125] bg-[#211D10] p-6 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[#F0E9D9]">
                <Stethoscope className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                <span>Clarity over noise</span>
              </div>
              <p className="text-xs sm:text-sm text-[#B8AE9B] leading-relaxed">
                Group repeating errors deterministically and explain every root cause in plain operational terms.
              </p>
            </div>

            <div className="rounded-xl border border-[#363125] bg-[#211D10] p-6 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[#F0E9D9]">
                <ShieldCheck className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                <span>Human-in-the-loop by default</span>
              </div>
              <p className="text-xs sm:text-sm text-[#B8AE9B] leading-relaxed">
                Sensitive financial, authentication, and database mutations wait for explicit operator authorization.
              </p>
            </div>

            <div className="rounded-xl border border-[#363125] bg-[#211D10] p-6 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[#F0E9D9]">
                <Workflow className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                <span>Honest engineering scope</span>
              </div>
              <p className="text-xs sm:text-sm text-[#B8AE9B] leading-relaxed">
                We document clearly which connectors are live today (n8n, custom webhooks, Python, FastAPI) and which are actively in development.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#211D10] py-16">
        <div className="mx-auto max-w-[1320px] px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h2 className="font-[var(--font-display)] text-2xl font-bold text-[#F0E9D9]">
              Want to meet the founder or discuss an automation challenge?
            </h2>
            <p className="text-sm text-[#B8AE9B]">
              Reach out directly to Aditya Ahirwal via our Contact page.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/contact')}
            className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap"
          >
            <span>Go to Contact</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      <CTASection onNavigate={onNavigate} />
    </MarketingShell>
  );
};

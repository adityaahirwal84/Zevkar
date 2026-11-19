import React from 'react';
import { Shield, FileText, Cookie, ArrowLeft, ArrowRight } from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { MarketingShell } from './MarketingShell';

interface LegalPageProps {
  mode: 'privacy' | 'terms' | 'cookies';
  onNavigate: (route: AppRoute) => void;
}

export const LegalPages: React.FC<LegalPageProps> = ({ mode, onNavigate }) => {
  const routeMap: Record<LegalPageProps['mode'], AppRoute> = {
    privacy: '/privacy',
    terms: '/terms',
    cookies: '/cookies',
  };

  return (
    <MarketingShell currentRoute={routeMap[mode]} onNavigate={onNavigate}>
      <section className="border-b border-[#363125] bg-[#211D10] py-16 md:py-20">
        <div className="mx-auto max-w-[960px] px-6 space-y-6">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B8AE9B] hover:text-[#F0E9D9] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Home</span>
          </button>

          <div className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
            {mode === 'privacy' && <Shield className="h-4 w-4" aria-hidden="true" />}
            {mode === 'terms' && <FileText className="h-4 w-4" aria-hidden="true" />}
            {mode === 'cookies' && <Cookie className="h-4 w-4" aria-hidden="true" />}
            <span>
              {mode === 'privacy'
                ? 'Privacy Policy (Draft Notice)'
                : mode === 'terms'
                ? 'Terms of Service (Draft Notice)'
                : 'Cookie Policy (Draft Notice)'}
            </span>
          </div>

          <h1 className="font-[var(--font-display)] text-3xl sm:text-5xl font-extrabold tracking-tight text-[#F0E9D9] leading-tight">
            {mode === 'privacy'
              ? 'Zevkar AI Privacy Policy'
              : mode === 'terms'
              ? 'Zevkar AI Terms of Service'
              : 'Zevkar AI Cookie Policy'}
          </h1>

          <p className="text-sm sm:text-base text-[#B8AE9B] leading-relaxed">
            This document is a pre-production engineering draft summarizing how the platform processes data, governs recovery operations, and stores essential session state. Obtain formal legal review prior to commercial SaaS launch.
          </p>
        </div>
      </section>

      <section className="bg-[#171A1B] py-14 md:py-18">
        <div className="mx-auto max-w-[960px] px-6 space-y-6">
          {mode === 'privacy' && (
            <>
              <div className="rounded-xl border border-[#363125] bg-[#211D10] p-6 sm:p-8 space-y-3">
                <h2 className="font-[var(--font-display)] text-xl font-bold text-[#F0E9D9]">
                  1. Operational Telemetry &amp; Webhook Payloads
                </h2>
                <p className="text-sm text-[#B8AE9B] leading-relaxed">
                  Zevkar AI stores workflow metadata, execution identifiers, HTTP status codes, and exception stack traces received via authorized connectors or <code className="font-mono text-[#F0E9D9]">/api/v1/webhooks/listener</code>. Avoid sending raw payment card numbers or unencrypted secrets inside workflow error payloads.
                </p>
              </div>
              <div className="rounded-xl border border-[#363125] bg-[#211D10] p-6 sm:p-8 space-y-3">
                <h2 className="font-[var(--font-display)] text-xl font-bold text-[#F0E9D9]">
                  2. Credential Encryption &amp; Gemini Processing
                </h2>
                <p className="text-sm text-[#B8AE9B] leading-relaxed">
                  Integration API keys are stored encrypted when <code className="font-mono text-[#F0E9D9]">INTEGRATION_ENCRYPTION_KEY</code> is configured and never returned in client responses. When server-side <code className="font-mono text-[#F0E9D9]">GEMINI_API_KEY</code> is active, incident traces are sent solely for root-cause diagnosis.
                </p>
              </div>
            </>
          )}

          {mode === 'terms' && (
            <>
              <div className="rounded-xl border border-[#363125] bg-[#211D10] p-6 sm:p-8 space-y-3">
                <h2 className="font-[var(--font-display)] text-xl font-bold text-[#F0E9D9]">
                  1. Operator Oversight &amp; Recovery Approvals
                </h2>
                <p className="text-sm text-[#B8AE9B] leading-relaxed">
                  High-risk workflows involving financial transactions, authentication credentials, or database writes require human authorization before recovery execution. Operators remain responsible for reviewing AI-assisted recommendations before authorizing retries.
                </p>
              </div>
              <div className="rounded-xl border border-[#363125] bg-[#211D10] p-6 sm:p-8 space-y-3">
                <h2 className="font-[var(--font-display)] text-xl font-bold text-[#F0E9D9]">
                  2. Configurable Pricing &amp; Integration Roadmap
                </h2>
                <p className="text-sm text-[#B8AE9B] leading-relaxed">
                  Displayed plan limits are configurable by deployment administrators. Connectors labeled In Development or Planned (including native Zapier/Make OAuth polling and Slack/PagerDuty dispatch) do not constitute active service-level commitments.
                </p>
              </div>
            </>
          )}

          {mode === 'cookies' && (
            <>
              <div className="rounded-xl border border-[#363125] bg-[#211D10] p-6 sm:p-8 space-y-3">
                <h2 className="font-[var(--font-display)] text-xl font-bold text-[#F0E9D9]">
                  1. Strictly Essential Session Cookies
                </h2>
                <p className="text-sm text-[#B8AE9B] leading-relaxed">
                  Zevkar AI uses an HttpOnly authentication session cookie (<code className="font-mono text-[#F0E9D9]">deltaai_session</code> / Bearer session token) solely to maintain authenticated access across Marketing and Console views.
                </p>
              </div>
              <div className="rounded-xl border border-[#363125] bg-[#211D10] p-6 sm:p-8 space-y-3">
                <h2 className="font-[var(--font-display)] text-xl font-bold text-[#F0E9D9]">
                  2. Local Preferences &amp; Zero Advertising Trackers
                </h2>
                <p className="text-sm text-[#B8AE9B] leading-relaxed">
                  Workspace timezone preferences are persisted locally so execution timestamps render in your selected IANA timezone. No third-party ad tracking or behavioral advertising pixels are loaded.
                </p>
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
              {mode !== 'privacy' && (
                <button
                  type="button"
                  onClick={() => onNavigate('/privacy')}
                  className="inline-flex items-center gap-1 text-[#F0E9D9] hover:text-[#C52A18]"
                >
                  <span>Privacy Policy</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {mode !== 'terms' && (
                <button
                  type="button"
                  onClick={() => onNavigate('/terms')}
                  className="inline-flex items-center gap-1 text-[#F0E9D9] hover:text-[#C52A18]"
                >
                  <span>Terms of Service</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {mode !== 'cookies' && (
                <button
                  type="button"
                  onClick={() => onNavigate('/cookies')}
                  className="inline-flex items-center gap-1 text-[#F0E9D9] hover:text-[#C52A18]"
                >
                  <span>Cookie Policy</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigate('/contact')}
              className="rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-4 py-2 text-xs font-semibold text-[#F0E9D9] transition-colors"
            >
              Contact Team
            </button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
};

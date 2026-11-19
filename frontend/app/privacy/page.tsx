import type { Metadata } from 'next';
import Link from 'next/link';
import { NextMarketingShell } from '@/components/NextMarketingShell';

export const metadata: Metadata = {
  title: 'Privacy Policy (Draft) — Zevkar AI',
  description: 'Draft operational privacy disclosures for Zevkar AI workflow telemetry, incident payloads, and operator inquiries.',
};

export default function PrivacyPage() {
  return (
    <NextMarketingShell activePath="/privacy">
      <section className="mx-auto max-w-[960px] px-6 py-16 md:py-20 space-y-8">
        <div className="space-y-3">
          <div className="text-xs font-semibold tracking-wide text-[#C52A18]">Draft Legal Notice</div>
          <h1 className="text-4xl font-extrabold text-[#F0E9D9]">Zevkar AI Privacy Policy</h1>
          <p className="text-sm text-[#B8AE9B]">
            Draft policy template describing how Zevkar AI processes workspace telemetry, error traces, and operator inquiries. Review with legal counsel prior to production SaaS launch.
          </p>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2">
            <h2 className="text-lg font-bold text-[#F0E9D9]">1. Operational Telemetry</h2>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              Zevkar AI ingests workflow metadata, execution IDs, and error messages routed to /api/v1/webhooks/listener or authorized API connectors. Avoid transmitting unencrypted secrets or payment card numbers in workflow error payloads.
            </p>
          </div>
          <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2">
            <h2 className="text-lg font-bold text-[#F0E9D9]">2. AI Diagnosis Processing</h2>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              When GEMINI_API_KEY is configured, sanitized failure context is evaluated server-side to produce root-cause diagnosis. When unconfigured, deterministic classification runs locally.
            </p>
          </div>
          <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2">
            <h2 className="text-lg font-bold text-[#F0E9D9]">3. Contact &amp; Inquiries</h2>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              Contact form submissions are validated and logged via POST /api/v1/contact for founder follow-up (aditya84azm@gmail.com).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <Link href="/terms" className="text-xs font-semibold text-[#F0E9D9] hover:text-[#C52A18]">
            Terms of Service →
          </Link>
          <Link href="/cookies" className="text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9]">
            Cookie Policy →
          </Link>
        </div>
      </section>
    </NextMarketingShell>
  );
}

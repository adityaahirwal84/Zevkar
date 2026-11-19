import type { Metadata } from 'next';
import Link from 'next/link';
import { NextMarketingShell } from '@/components/NextMarketingShell';

export const metadata: Metadata = {
  title: 'Developers & API Reference — Zevkar AI',
  description:
    'Zevkar AI webhook ingestion, FastAPI exception hooks, authentication headers, and documented REST API endpoints.',
};

export default function DevelopersPage() {
  return (
    <NextMarketingShell activePath="/developers">
      <section className="mx-auto max-w-[1320px] px-6 py-16 md:py-24 space-y-10">
        <div className="max-w-3xl space-y-4">
          <div className="text-xs font-medium tracking-wide text-[#C52A18]">Developers</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#F0E9D9]">
            API Overview &amp; Webhook Ingestion
          </h1>
          <p className="text-base text-[#B8AE9B]">
            Send automation failures to <code className="font-mono text-[#F0E9D9]">POST /api/v1/webhooks/listener</code> or explore full interactive guides in{' '}
            <Link href="/docs" className="text-[#F0E9D9] underline">Documentation</Link>.
          </p>
        </div>

        <div className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-3">
          <div className="text-sm font-bold text-[#F0E9D9]">Webhook Ingestion Contract</div>
          <pre className="overflow-x-auto rounded-lg border border-[#363125] bg-[#211D10] p-4 font-mono text-xs text-[#F0E9D9]">
{`POST /api/v1/webhooks/listener
Content-Type: application/json

{
  "workflowId": "wf_billing_sync",
  "workflowName": "Stripe Settlement -> NetSuite Invoice",
  "platform": "custom_python",
  "executionId": "exec_py_01",
  "error": "HTTP 401 Unauthorized"
}`}
          </pre>
        </div>
      </section>
    </NextMarketingShell>
  );
}

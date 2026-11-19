import type { Metadata } from 'next';
import Link from 'next/link';
import { NextMarketingShell } from '@/components/NextMarketingShell';

export const metadata: Metadata = {
  title: 'Solutions — Zevkar AI',
  description:
    'Zevkar AI solutions for automation agencies, SaaS operations, e-commerce teams, Python/FastAPI developers, and hybrid workflow teams.',
};

const GROUPS = [
  { name: 'Automation Agencies', summary: 'Isolated multi-client portfolios, health scores, and client-friendly plain-English summaries.' },
  { name: 'Startups & Operations Teams', summary: 'Catch lead routing, trial provisioning, and billing webhook failures before customers notice.' },
  { name: 'E-Commerce Businesses', summary: 'Protect Shopify-to-ERP syncs from rate-limit drops and duplicate order retries.' },
  { name: 'Python & FastAPI Developers', summary: 'Forward worker exceptions and API timeouts into centralized triage with Prometheus metrics.' },
  { name: 'n8n, Zapier & Make Teams', summary: 'One severity-ranked incident queue across hybrid no-code and custom code automations.' },
];

export default function SolutionsPage() {
  return (
    <NextMarketingShell activePath="/solutions">
      <section className="mx-auto max-w-[1320px] px-6 py-16 md:py-24 space-y-12">
        <div className="max-w-3xl space-y-4">
          <div className="text-xs font-medium tracking-wide text-[#C52A18]">Solutions</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#F0E9D9]">
            Tailored automation reliability for every team.
          </h1>
          <p className="text-base text-[#B8AE9B]">
            Also explore detailed workflows on <Link href="/use-cases" className="text-[#F0E9D9] underline">Use Cases</Link>.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {GROUPS.map((g) => (
            <div key={g.name} className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-2">
              <h2 className="text-xl font-bold text-[#F0E9D9]">{g.name}</h2>
              <p className="text-sm text-[#B8AE9B] leading-relaxed">{g.summary}</p>
            </div>
          ))}
        </div>
      </section>
    </NextMarketingShell>
  );
}

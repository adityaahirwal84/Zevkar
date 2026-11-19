import Link from 'next/link';
import { AlertTriangle, Stethoscope, ShieldCheck, Activity, Cable, ArrowRight } from 'lucide-react';
import { NextMarketingShell } from '@/components/NextMarketingShell';
import { HomeHeroActions } from '@/components/HomeHeroActions';

export default function HomePage() {
  return (
    <NextMarketingShell activePath="/">
      {/* Hero */}
      <section className="border-b border-[#363125] bg-[#211D10] py-16 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 space-y-6">
            <p className="text-xs font-medium tracking-wide text-[#B8AE9B]">
              Zevkar · Automation Monitoring, Diagnosis &amp; Recovery Platform
            </p>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#F0E9D9] leading-[1.08]">
              Keep Business Automations Running with Zevkar.
            </h1>
            <p className="text-base sm:text-lg text-[#B8AE9B] leading-relaxed max-w-xl">
              Monitor, diagnose, and recover your business automations before failures impact your operations.
            </p>
            <HomeHeroActions />
            <div className="pt-2 grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-x-3 gap-y-1.5 text-xs text-[#B8AE9B]">
              <span>n8n API Connector</span>
              <span className="hidden sm:inline" aria-hidden="true">·</span>
              <span>Custom Webhooks &amp; Python</span>
              <span className="hidden sm:inline" aria-hidden="true">·</span>
              <span>FastAPI Telemetry</span>
              <span className="hidden sm:inline" aria-hidden="true">·</span>
              <span>Human-Gated Recovery</span>
            </div>
          </div>

          <div className="lg:col-span-6 rounded-xl border border-[#363125] bg-[#171A1B] p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#363125] pb-3 text-xs">
              <span className="font-semibold text-[#F0E9D9]">Incident Triage Preview</span>
              <span className="font-mono text-[11px] text-[#E2B066]">Approval Required</span>
            </div>
            <div className="rounded-lg border border-[#61231C] bg-[#211D10] p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-[#F0E9D9]">
                <AlertTriangle className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                <span>Stripe Settlement Webhook → NetSuite Invoice Sync</span>
              </div>
              <div className="rounded border border-[#363125] bg-[#171A1B] p-2.5 font-mono text-[11px] text-[#E88A7E]">
                HTTP 401 Unauthorized: Restricted API key revoked before settlement batch.
              </div>
            </div>
            <div className="rounded-lg border border-[#363125] bg-[#202326] p-4 space-y-2 text-xs">
              <div className="font-semibold text-[#F0E9D9]">Diagnosis &amp; Recovery Guardrail</div>
              <p className="text-[#B8AE9B] leading-relaxed">
                Rotate the restricted credential and authorize an idempotent replay via the Recovery Center approval gate.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Step Lifecycle */}
      <section className="border-b border-[#363125] bg-[#171A1B] py-20">
        <div className="mx-auto max-w-[1320px] px-6 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="text-xs font-medium tracking-wide text-[#C52A18]">
                System Architecture
              </div>
              <h2 className="text-3xl font-bold text-[#F0E9D9]">
                Connect. Monitor. Diagnose. Recover.
              </h2>
            </div>
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#F0E9D9] hover:text-[#C52A18]"
            >
              <span>Inspect the 7-stage pipeline</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { step: '01', title: 'Connect', icon: Cable, desc: 'Link n8n REST APIs, signed webhooks, Python workers, and FastAPI services.' },
              { step: '02', title: 'Monitor', icon: Activity, desc: 'Ingest executions with watermark checkpoints and SHA-256 deduplication.' },
              { step: '03', title: 'Diagnose', icon: Stethoscope, desc: 'Classify failures with Gemini AI and deterministic fallback safety rules.' },
              { step: '04', title: 'Recover', icon: ShieldCheck, desc: 'Quarantine high-risk retries behind human approval and idempotency locks.' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.step} className="rounded-xl border border-[#363125] bg-[#202326] p-6 space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono text-[#C52A18] tabular-nums">
                    <span>0{Number(item.step)}</span>
                    <Icon className="h-4 w-4 text-[#B8AE9B]" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-bold text-[#F0E9D9]">{item.title}</h3>
                  <p className="text-sm text-[#B8AE9B] leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </NextMarketingShell>
  );
}

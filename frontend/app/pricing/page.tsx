'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { NextMarketingShell } from '@/components/NextMarketingShell';
import { api } from '@/lib/api-client';
import { DEFAULT_PRICING_PLANS, PricingPlanConfig } from '@/lib/site-content';

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [plans, setPlans] = useState<PricingPlanConfig[]>(DEFAULT_PRICING_PLANS);
  const [notice, setNotice] = useState(
    'Displayed plans and limits are configurable via deployment settings. External payment checkout is intentionally disabled in self-hosted mode.'
  );

  useEffect(() => {
    let active = true;
    api.pricing
      .catalog()
      .then((data) => {
        if (!active || !data) return;
        if (Array.isArray(data.plans) && data.plans.length > 0) {
          setPlans(
            data.plans.map((p: any) => ({
              id: p.id,
              name: p.name,
              audience: p.audience,
              monthlyPriceUsd: p.monthlyPriceUsd ?? p.monthly_price_usd ?? null,
              annualPriceUsd: p.annualPriceUsd ?? p.annual_price_usd ?? null,
              cadenceNote: p.cadenceNote || p.cadence_note || 'per month (configurable tier)',
              highlighted: Boolean(p.highlighted),
              ctaLabel: p.ctaLabel || p.cta_label || 'Start Free',
              ctaRoute: (p.ctaRoute || p.cta_route || '/signup') as '/signup' | '/contact',
              limits: p.limits || {},
              features: Array.isArray(p.features) ? p.features : [],
            }))
          );
        }
        if (data.billingModeNotice || data.billing_mode_notice) {
          setNotice(data.billingModeNotice || data.billing_mode_notice);
        }
      })
      .catch(() => {
        // Fallback to static configurable defaults cleanly
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <NextMarketingShell activePath="/pricing">
      <section className="mx-auto max-w-[1320px] px-6 py-16 md:py-24 space-y-12">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="max-w-2xl space-y-4">
            <div className="text-xs font-medium tracking-wide text-[#C52A18]">Configurable Plans</div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-[#F0E9D9]">
              Pricing structured around your automation footprint.
            </h1>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">{notice}</p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#171A1B] border border-[#363125] w-fit">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                !annual ? 'bg-[#A51D0B] text-[#F0E9D9]' : 'text-[#B8AE9B] hover:text-[#F0E9D9]'
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                annual ? 'bg-[#A51D0B] text-[#F0E9D9]' : 'text-[#B8AE9B] hover:text-[#F0E9D9]'
              }`}
            >
              Annual Billing (20% off)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((t) => {
            const amount = annual ? t.annualPriceUsd : t.monthlyPriceUsd;
            return (
              <div
                key={t.id}
                className={`rounded-xl border p-6 flex flex-col justify-between space-y-6 ${
                  t.highlighted
                    ? 'border-[#A51D0B] bg-[#202326]'
                    : 'border-[#363125] bg-[#171A1B]'
                }`}
              >
                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl font-bold text-[#F0E9D9]">{t.name}</h2>
                    <p className="mt-1 text-xs text-[#B8AE9B]">{t.audience}</p>
                  </div>
                  <div>
                    <div className="text-3xl font-extrabold text-[#F0E9D9] tabular-nums">
                      {amount !== null ? `$${amount}` : 'Custom'}
                    </div>
                    <div className="text-xs text-[#B8AE9B] mt-1">{t.cadenceNote}</div>
                  </div>
                  <ul className="space-y-2.5 border-t border-[#363125] pt-4 text-xs text-[#F0E9D9]">
                    {t.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 leading-relaxed">
                        <Check className="h-3.5 w-3.5 text-[#C52A18] shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href={t.ctaRoute}
                  className={`inline-flex items-center justify-center w-full rounded-md py-2.5 text-sm font-semibold transition-colors ${
                    t.highlighted
                      ? 'bg-[#A51D0B] hover:bg-[#C52A18] text-[#F0E9D9]'
                      : 'border border-[#363125] bg-[#211D10] hover:border-[#B8AE9B] text-[#F0E9D9]'
                  }`}
                >
                  {t.ctaLabel}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Comparison Table */}
        <div className="rounded-xl border border-[#363125] bg-[#171A1B] overflow-hidden">
          <div className="border-b border-[#363125] px-6 py-4">
            <h2 className="text-lg font-bold text-[#F0E9D9]">Plan Capability Limits</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-[#363125] bg-[#202326] text-[#B8AE9B]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Limit / Scope</th>
                  {plans.map((p) => (
                    <th key={p.id} className="px-5 py-3 font-semibold text-[#F0E9D9]">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#363125]">
                {(
                  [
                    ['Workflows', 'workflows'],
                    ['Clients & Tenants', 'clients'],
                    ['AI Diagnosis', 'diagnosis'],
                    ['Connectors', 'integrations'],
                    ['Governance', 'governance'],
                    ['Retention', 'retention'],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key}>
                    <td className="px-5 py-3 font-medium text-[#F0E9D9]">{label}</td>
                    {plans.map((p) => (
                      <td key={p.id} className="px-5 py-3 text-[#B8AE9B]">
                        {p.limits?.[key] || 'Configurable'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </NextMarketingShell>
  );
}

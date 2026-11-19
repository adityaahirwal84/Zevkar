import React, { useEffect, useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { AppRoute, resolveCtaRoute } from '../../lib/router';
import {
  ConfigurablePricingCatalog,
  getPricingCatalog,
} from '../../lib/pricing-config';
import { useAuth } from '../../context/AuthContext';

interface PricingCardsProps {
  onNavigate: (route: AppRoute) => void;
}

export const PricingCards: React.FC<PricingCardsProps> = ({ onNavigate }) => {
  const { isAuthenticated, userRole } = useAuth();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [catalog, setCatalog] = useState<ConfigurablePricingCatalog>(() => getPricingCatalog());

  useEffect(() => {
    let active = true;
    fetch('/api/v1/pricing')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && Array.isArray(data.plans)) {
          setCatalog(data);
        }
      })
      .catch(() => {
        // Fallback cleanly to deterministic local pricing catalog
      });
    return () => {
      active = false;
    };
  }, []);

  const plans = catalog.plans;

  return (
    <div className="space-y-16">
      {/* Billing Toggle */}
      <div className="flex flex-col items-center gap-3">
        <div
          className="inline-flex items-center rounded-md border border-[#363125] bg-[#171A1B] p-1"
          role="group"
          aria-label="Billing cycle toggle"
        >
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`rounded px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              billingCycle === 'monthly'
                ? 'bg-[#A51D0B] text-[#F0E9D9]'
                : 'text-[#B8AE9B] hover:text-[#F0E9D9]'
            }`}
          >
            Monthly Billing
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`rounded px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              billingCycle === 'yearly'
                ? 'bg-[#A51D0B] text-[#F0E9D9]'
                : 'text-[#B8AE9B] hover:text-[#F0E9D9]'
            }`}
          >
            Annual Billing ({catalog.annualDiscountPercent}% lower)
          </button>
        </div>
        <p className="text-xs text-[#B8AE9B] text-center max-w-2xl">
          {catalog.billingModeNotice}
        </p>
      </div>

      {/* 4 Configurable Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {plans.map((plan) => {
          const priceNumber =
            billingCycle === 'monthly' ? plan.monthlyPriceUsd : plan.annualPriceUsd;
          const displayedPrice = priceNumber === null ? 'Custom' : `$${priceNumber}`;
          const isCustom = priceNumber === null;

          return (
            <div
              key={plan.id}
              className={`flex flex-col justify-between rounded-xl border p-6 ${
                plan.highlighted
                  ? 'border-[#A51D0B] bg-[#202326]'
                  : 'border-[#363125] bg-[#171A1B]'
              }`}
            >
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-[var(--font-display)] text-xl font-bold text-[#F0E9D9]">
                      {plan.name}
                    </h3>
                    {plan.highlighted && (
                      <span className="text-[11px] font-semibold text-[#E2B066]">Recommended</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[#B8AE9B] min-h-[32px]">{plan.audience}</p>
                </div>

                <div className="border-y border-[#363125] py-4">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-[var(--font-display)] text-3xl font-extrabold text-[#F0E9D9] tabular-nums">
                      {displayedPrice}
                    </span>
                    {!isCustom && (
                      <span className="text-xs text-[#B8AE9B]">
                        / mo {billingCycle === 'yearly' ? 'annual' : 'monthly'}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-[#B8AE9B]">{plan.cadenceNote}</div>
                </div>

                <ul className="space-y-2.5 text-xs sm:text-sm text-[#F0E9D9]">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-[#C52A18] shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-7 pt-5 border-t border-[#363125]">
                {(() => {
                  const isSignupCta = plan.ctaRoute === '/signup';
                  const targetRoute = isSignupCta
                    ? resolveCtaRoute(isAuthenticated, userRole, plan.ctaRoute)
                    : plan.ctaRoute;
                  const buttonLabel = isAuthenticated && isSignupCta ? 'Go to Dashboard' : plan.ctaLabel;
                  return (
                    <button
                      type="button"
                      onClick={() => onNavigate(targetRoute)}
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors ${
                        plan.highlighted
                          ? 'bg-[#A51D0B] hover:bg-[#C52A18] text-[#F0E9D9]'
                          : 'border border-[#363125] bg-[#211D10] hover:border-[#B8AE9B] text-[#F0E9D9]'
                      }`}
                    >
                      <span>{buttonLabel}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison Matrix */}
      <div className="rounded-xl border border-[#363125] bg-[#171A1B] overflow-hidden">
        <div className="border-b border-[#363125] px-6 py-4">
          <h3 className="font-[var(--font-display)] text-lg font-bold text-[#F0E9D9]">
            Plan Capability Comparison
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-[#363125] bg-[#211D10] text-xs text-[#B8AE9B]">
              <tr>
                <th className="px-6 py-3.5 font-semibold">Capability</th>
                {plans.map((p) => (
                  <th key={p.id} className="px-6 py-3.5 font-semibold">{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#363125]">
              <tr>
                <td className="px-6 py-4 font-medium text-[#F0E9D9]">Workflow Capacity</td>
                {plans.map((p) => (
                  <td key={p.id} className="px-6 py-4 text-[#B8AE9B]">{p.limits.workflows}</td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-[#F0E9D9]">Client Workspaces</td>
                {plans.map((p) => (
                  <td key={p.id} className="px-6 py-4 text-[#B8AE9B]">{p.limits.clients}</td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-[#F0E9D9]">AI Root-Cause Diagnosis</td>
                {plans.map((p) => (
                  <td key={p.id} className="px-6 py-4 text-[#B8AE9B]">{p.limits.diagnosis}</td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-[#F0E9D9]">Integrations</td>
                {plans.map((p) => (
                  <td key={p.id} className="px-6 py-4 text-[#B8AE9B]">{p.limits.integrations}</td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-[#F0E9D9]">Governance &amp; Audit</td>
                {plans.map((p) => (
                  <td key={p.id} className="px-6 py-4 text-[#B8AE9B]">{p.limits.governance}</td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-[#F0E9D9]">History Retention</td>
                {plans.map((p) => (
                  <td key={p.id} className="px-6 py-4 text-[#B8AE9B]">{p.limits.retention}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

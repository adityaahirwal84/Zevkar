import React, { useState } from 'react';
import { Check, ShieldCheck, Download } from 'lucide-react';
import { Agency } from '../types';

interface BillingTabProps {
  agency: Agency;
  onUpgradeTier: (tier: 'FREE' | 'STARTER' | 'GROWTH' | 'AGENCY_PRO') => Promise<void>;
}

export const BillingTab: React.FC<BillingTabProps> = ({ agency, onUpgradeTier }) => {
  const [upgrading, setUpgrading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const plans = [
    {
      id: 'FREE',
      name: 'Free Starter',
      price: '$0',
      period: 'forever',
      description: 'Ideal for solo automation builders with 1 workspace.',
      limits: { clients: '1 Client', workflows: '5 Workflows', aiDiagnoses: '50/mo' },
      features: ['Basic error alerts', 'Execution history', 'Rules engine triage'],
    },
    {
      id: 'STARTER',
      name: 'Starter',
      price: '$49',
      period: 'per month',
      description: 'For small operations teams monitoring core webhooks.',
      limits: { clients: '3 Clients', workflows: '10 Workflows', aiDiagnoses: '100/mo' },
      features: ['n8n + Webhook connectors', 'Gemini AI root-cause engine', 'Idempotent retries'],
    },
    {
      id: 'GROWTH',
      name: 'Growth',
      price: '$149',
      period: 'per month',
      popular: true,
      description: 'For scaling automation teams and multi-client agencies.',
      limits: { clients: '10 Clients', workflows: '50 Workflows', aiDiagnoses: '1,000/mo' },
      features: [
        'n8n, Zapier & Make clusters',
        'Human Approval Gates',
        'Zevkar AI Operations Assistant',
        'Prometheus /metrics endpoint',
      ],
    },
    {
      id: 'AGENCY_PRO',
      name: 'Business',
      price: '$399',
      period: 'per month',
      description: 'For agencies operating high-throughput client portfolios.',
      limits: { clients: 'Multi-Client Isolation', workflows: '200+ Workflows', aiDiagnoses: '5,000+/mo' },
      features: [
        'Full RBAC & Audit Logs',
        'Custom FastAPI / Python hooks',
        'Dedicated Docker deployment',
        'Priority engineering support',
      ],
    },
  ];

  const handleSelectPlan = async (tier: 'FREE' | 'STARTER' | 'GROWTH' | 'AGENCY_PRO') => {
    setUpgrading(true);
    try {
      await onUpgradeTier(tier);
      setSuccessMessage(`Workspace plan updated to ${tier} (sandbox tier selection recorded).`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
          Subscription &amp; Resource Quotas
        </h2>
        <p className="text-xs text-[#B5AA99]">
          Configurable tier definitions and workspace usage quotas (external Stripe checkout is not enforced in self-hosted mode)
        </p>
      </div>

      {successMessage && (
        <div className="rounded-lg border border-[#2E4A36] bg-[#1C2A20] p-3 text-xs text-[#8CC59B] flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Usage Meter Card */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-6">
        <h3 className="text-sm font-bold text-[#E9E5DC] mb-4">
          Current Workspace Utilization ({agency.tier} Tier)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex justify-between text-xs text-[#B5AA99] font-medium mb-1.5">
              <span>Client Accounts</span>
              <span className="font-mono text-[#E9E5DC] tabular-nums">{agency.clientsCount} / 20</span>
            </div>
            <div className="h-2 w-full rounded bg-[#171717] overflow-hidden">
              <div className="h-full rounded bg-[#A51B0B]" style={{ width: '20%' }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-[#B5AA99] font-medium mb-1.5">
              <span>Monitored Workflows</span>
              <span className="font-mono text-[#E9E5DC] tabular-nums">{agency.workflowsCount} / 100</span>
            </div>
            <div className="h-2 w-full rounded bg-[#171717] overflow-hidden">
              <div className="h-full rounded bg-[#8CC59B]" style={{ width: '12%' }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-[#B5AA99] font-medium mb-1.5">
              <span>AI Diagnoses</span>
              <span className="font-mono text-[#E9E5DC] tabular-nums">184 / 2,500</span>
            </div>
            <div className="h-2 w-full rounded bg-[#171717] overflow-hidden">
              <div className="h-full rounded bg-[#E2B066]" style={{ width: '7%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan) => {
          const isCurrent = agency.tier === plan.id;
          return (
            <div
              key={plan.id}
              className={`rounded-xl border p-5 flex flex-col justify-between ${
                plan.popular ? 'border-[#A51B0B] bg-[#211D10]' : 'border-[#383838] bg-[#202020]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-base font-bold text-[#E9E5DC]">{plan.name}</h4>
                  {plan.popular && (
                    <span className="text-[11px] font-semibold text-[#E2B066]">Recommended</span>
                  )}
                </div>
                <p className="text-[11px] text-[#B5AA99] mt-1 min-h-[32px]">{plan.description}</p>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-[var(--font-display)] text-3xl font-extrabold text-[#E9E5DC] tabular-nums">
                    {plan.price}
                  </span>
                  <span className="text-xs text-[#B5AA99]">/{plan.period}</span>
                </div>

                <div className="mt-4 space-y-1 pt-4 border-t border-[#383838] text-xs text-[#E9E5DC]">
                  <div>{plan.limits.clients}</div>
                  <div>{plan.limits.workflows}</div>
                  <div className="text-[#B5AA99]">{plan.limits.aiDiagnoses}</div>
                </div>

                <ul className="mt-4 space-y-2 pt-4 border-t border-[#383838] text-xs text-[#B5AA99]">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <Check className="h-3.5 w-3.5 text-[#C52A18] shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-[#383838]">
                <button
                  type="button"
                  onClick={() => handleSelectPlan(plan.id as any)}
                  disabled={isCurrent || upgrading}
                  className={`w-full rounded-md py-2 text-xs font-semibold transition-colors ${
                    isCurrent
                      ? 'border border-[#383838] bg-[#171717] text-[#B5AA99] cursor-default'
                      : plan.popular
                      ? 'bg-[#A51B0B] hover:bg-[#C52A18] text-[#E9E5DC]'
                      : 'border border-[#383838] bg-[#171717] hover:border-[#B5AA99] text-[#E9E5DC]'
                  }`}
                >
                  {isCurrent ? 'Current Plan' : 'Select Plan (Sandbox)'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sample Billing Reference */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-6">
        <h3 className="text-sm font-bold text-[#E9E5DC] mb-3">Billing Ledger Reference</h3>
        <div className="rounded-lg border border-[#383838] bg-[#171717] p-3.5 flex items-center justify-between text-xs">
          <div>
            <span className="font-semibold text-[#E9E5DC]">Workspace Plan Record</span>
            <p className="text-[11px] text-[#B5AA99]">
              Active tier: {agency.tier} · Configurable billing mode
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-[#B5AA99] font-mono">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>JSON Export in Settings</span>
          </span>
        </div>
      </div>
    </div>
  );
};

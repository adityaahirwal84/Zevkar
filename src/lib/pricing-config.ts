export interface PricingPlanConfig {
  id: 'starter' | 'professional' | 'business' | 'enterprise';
  tierCode: 'FREE' | 'STARTER' | 'GROWTH' | 'AGENCY_PRO';
  name: string;
  audience: string;
  monthlyPriceUsd: number | null; // null represents custom enterprise pricing
  annualPriceUsd: number | null;
  cadenceNote: string;
  highlighted?: boolean;
  ctaLabel: string;
  ctaRoute: '/signup' | '/contact';
  limits: {
    workflows: string;
    clients: string;
    diagnosis: string;
    integrations: string;
    governance: string;
    retention: string;
  };
  features: string[];
}

export interface ConfigurablePricingCatalog {
  currency: 'USD';
  annualDiscountPercent: number;
  billingModeNotice: string;
  plans: PricingPlanConfig[];
}

function readOptionalEnvNumber(key: string, fallback: number): number {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    const parsed = Number(process.env[key]);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

export function getPricingCatalog(): ConfigurablePricingCatalog {
  const starterMonthly = readOptionalEnvNumber('PRICING_STARTER_MONTHLY', 49);
  const starterAnnual = readOptionalEnvNumber('PRICING_STARTER_ANNUAL', 39);
  const proMonthly = readOptionalEnvNumber('PRICING_PRO_MONTHLY', 149);
  const proAnnual = readOptionalEnvNumber('PRICING_PRO_ANNUAL', 119);
  const businessMonthly = readOptionalEnvNumber('PRICING_BUSINESS_MONTHLY', 349);
  const businessAnnual = readOptionalEnvNumber('PRICING_BUSINESS_ANNUAL', 279);

  return {
    currency: 'USD',
    annualDiscountPercent: 20,
    billingModeNotice:
      'Displayed plans and usage caps are configurable via deployment settings. External payment checkout is intentionally disabled in local/self-hosted mode.',
    plans: [
      {
        id: 'starter',
        tierCode: 'STARTER',
        name: 'Starter',
        audience: 'For solo operators and early automation stacks',
        monthlyPriceUsd: starterMonthly,
        annualPriceUsd: starterAnnual,
        cadenceNote: 'per month (configurable tier)',
        ctaLabel: 'Start Free Trial',
        ctaRoute: '/signup',
        limits: {
          workflows: 'Up to 10 workflows',
          clients: '1 organization workspace',
          diagnosis: 'Deterministic + 100 AI diagnoses/mo',
          integrations: 'n8n & custom webhook listener',
          governance: 'Standard incident & recovery log',
          retention: '14-day execution history',
        },
        features: [
          'Limited automation monitoring (up to 10 workflows)',
          'Basic incident history with SHA-256 deduplication',
          'Basic root-cause diagnosis with deterministic fallback',
          'Email & in-app incident notifications',
        ],
      },
      {
        id: 'professional',
        tierCode: 'GROWTH',
        name: 'Professional',
        audience: 'For growing SaaS ops, e-commerce, and engineering teams',
        monthlyPriceUsd: proMonthly,
        annualPriceUsd: proAnnual,
        cadenceNote: 'per month (configurable tier)',
        highlighted: true,
        ctaLabel: 'Start with Professional',
        ctaRoute: '/signup',
        limits: {
          workflows: 'Up to 50 connected workflows',
          clients: 'Up to 10 isolated client workspaces',
          diagnosis: '1,000 Gemini AI diagnoses/mo',
          integrations: 'n8n, custom webhooks, Python & FastAPI',
          governance: 'Human approval gates + cooldowns',
          retention: '30-day execution & recovery history',
        },
        features: [
          'More connected workflows across production stacks',
          'Advanced Gemini AI diagnosis & strategy recommendations',
          'Recovery approvals with cooldowns and idempotency keys',
          'Advanced monitoring & stuck execution detection',
        ],
      },
      {
        id: 'business',
        tierCode: 'AGENCY_PRO',
        name: 'Business',
        audience: 'For multi-client automation agencies and ops organizations',
        monthlyPriceUsd: businessMonthly,
        annualPriceUsd: businessAnnual,
        cadenceNote: 'per month (configurable tier)',
        ctaLabel: 'Start with Business',
        ctaRoute: '/signup',
        limits: {
          workflows: 'Up to 250 connected workflows',
          clients: 'Unlimited multi-client isolation',
          diagnosis: '5,000 Gemini AI diagnoses/mo',
          integrations: 'All available connectors + webhook API',
          governance: 'RBAC (Owner/Admin/Developer/Viewer) + audit export',
          retention: '90-day immutable audit retention',
        },
        features: [
          'Role-based team access and approval governance',
          'Higher workflow, diagnosis, and execution limits',
          'Advanced immutable audit logs & JSON archive export',
          'Priority technical support & onboarding',
        ],
      },
      {
        id: 'enterprise',
        tierCode: 'AGENCY_PRO',
        name: 'Enterprise',
        audience: 'For regulated environments and dedicated self-hosted deployments',
        monthlyPriceUsd: null,
        annualPriceUsd: null,
        cadenceNote: 'custom agreement & deployment scope',
        ctaLabel: 'Contact Team',
        ctaRoute: '/contact',
        limits: {
          workflows: 'Custom workflow capacity',
          clients: 'Dedicated VPC / PostgreSQL isolation',
          diagnosis: 'Custom Gemini quota & key control',
          integrations: 'Custom integration adapters',
          governance: 'Security review & dedicated onboarding',
          retention: 'Configurable retention policy',
        },
        features: [
          'Dedicated Docker Compose & VPC deployment guidance',
          'Custom integration engineering & webhook contracts',
          'Configurable org-wide recovery policy defaults',
          'Direct engineering & architecture review',
        ],
      },
    ],
  };
}

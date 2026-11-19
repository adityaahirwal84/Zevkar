import type { Role } from '../types';

export type AppRoute =
  | '/'
  | '/product'
  | '/features'
  | '/solutions'
  | '/integrations'
  | '/how-it-works'
  | '/use-cases'
  | '/pricing'
  | '/docs'
  | '/developers'
  | '/blog'
  | '/resources'
  | '/about'
  | '/contact'
  | '/privacy'
  | '/terms'
  | '/cookies'
  | '/login'
  | '/signup'
  | '/forgot-password'
  | '/reset-password'
  | '/verify-email'
  | '/accept-invite'
  | '/onboarding'
  | '/dashboard';

export type DashboardTab =
  | 'overview'
  | 'control-center'
  | 'incidents'
  | 'diagnosis'
  | 'recovery'
  | 'approvals'
  | 'workflows'
  | 'clients'
  | 'integrations'
  | 'analytics'
  | 'alerts'
  | 'assistant'
  | 'audit'
  | 'team'
  | 'billing'
  | 'settings';

export interface RouteMeta {
  title: string;
  description: string;
}

const VALID_ROUTES: ReadonlySet<string> = new Set<AppRoute>([
  '/',
  '/product',
  '/features',
  '/solutions',
  '/integrations',
  '/how-it-works',
  '/use-cases',
  '/pricing',
  '/docs',
  '/developers',
  '/blog',
  '/resources',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/cookies',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/accept-invite',
  '/onboarding',
  '/dashboard',
]);

const VALID_DASHBOARD_TABS: ReadonlySet<string> = new Set<DashboardTab>([
  'overview',
  'control-center',
  'incidents',
  'diagnosis',
  'recovery',
  'approvals',
  'workflows',
  'clients',
  'integrations',
  'analytics',
  'alerts',
  'assistant',
  'audit',
  'team',
  'billing',
  'settings',
]);

export function normalizePathname(pathname: string): AppRoute {
  const cleaned = pathname.replace(/\/+$/, '') || '/';
  if (cleaned.startsWith('/blog/')) {
    return '/blog';
  }
  if (VALID_ROUTES.has(cleaned)) {
    return cleaned as AppRoute;
  }
  return '/';
}

export function extractBlogSlug(pathname: string): string | null {
  const cleaned = pathname.replace(/\/+$/, '');
  if (cleaned.startsWith('/blog/') && cleaned.length > '/blog/'.length) {
    return cleaned.slice('/blog/'.length);
  }
  return null;
}

export function normalizeDashboardTab(tab?: string | null): DashboardTab {
  if (tab && VALID_DASHBOARD_TABS.has(tab)) {
    return tab as DashboardTab;
  }
  return 'overview';
}

export function isDashboardRoute(route: AppRoute): boolean {
  return route === '/dashboard';
}

export function isAuthRoute(route: AppRoute): boolean {
  return (
    route === '/login' ||
    route === '/signup' ||
    route === '/forgot-password' ||
    route === '/reset-password' ||
    route === '/verify-email' ||
    route === '/accept-invite'
  );
}

export function isOnboardingRoute(route: AppRoute): boolean {
  return route === '/onboarding';
}

export function getDashboardRouteForRole(role?: Role | string | null): AppRoute {
  switch (role) {
    case 'OWNER':
    case 'ADMIN':
    case 'MEMBER':
    case 'VIEWER':
    default:
      return '/dashboard';
  }
}

export function getDefaultTabForRole(role?: Role | string | null): DashboardTab {
  switch (role) {
    case 'OWNER':
    case 'ADMIN':
    case 'MEMBER':
    case 'VIEWER':
    default:
      return 'overview';
  }
}

export function resolveDashboardHref(
  role?: Role | string | null,
  tab?: DashboardTab | null
): string {
  const base = getDashboardRouteForRole(role);
  const normalizedTab = normalizeDashboardTab(tab);
  return normalizedTab === 'overview' ? base : `${base}?tab=${normalizedTab}`;
}

export function resolveCtaRoute(
  isAuthenticated: boolean,
  role?: Role | string | null,
  unauthenticatedRoute: AppRoute = '/signup'
): AppRoute {
  return isAuthenticated ? getDashboardRouteForRole(role) : unauthenticatedRoute;
}

export function resolveProtectedRouteAccess(input: {
  pathname: string;
  search?: string;
  isAuthenticated: boolean;
  userRole?: Role | string | null;
}): {
  route: AppRoute;
  tab: DashboardTab;
  shouldRedirect: boolean;
  autostartDemo: boolean;
} {
  const params = new URLSearchParams(input.search || '');
  const requestedTab = normalizeDashboardTab(params.get('tab'));

  if (params.get('autostart') === '1') {
    return {
      route: getDashboardRouteForRole(input.userRole),
      tab: requestedTab,
      shouldRedirect: true,
      autostartDemo: true,
    };
  }

  const normalized = normalizePathname(input.pathname);
  if ((isDashboardRoute(normalized) || isOnboardingRoute(normalized)) && !input.isAuthenticated) {
    return {
      route: '/login',
      tab: 'overview',
      shouldRedirect: true,
      autostartDemo: false,
    };
  }

  return {
    route: normalized,
    tab: requestedTab,
    shouldRedirect: false,
    autostartDemo: false,
  };
}

const ROUTE_META_MAP: Record<AppRoute, RouteMeta> = {
  '/': {
    title: 'Zevkar AI — AI-Powered Automation Monitoring, Diagnosis & Recovery',
    description:
      'Zevkar AI is an AI-powered automation monitoring, diagnosis, and recovery platform built to protect critical business workflows.',
  },
  '/product': {
    title: 'Product — Zevkar AI',
    description:
      'Explore the Zevkar AI automation reliability architecture: ingestion, stuck detection, Gemini AI diagnosis, approval gates, and verified recovery.',
  },
  '/features': {
    title: 'Features — Zevkar AI',
    description:
      'Review workflow monitoring, n8n execution sync, AI root-cause diagnosis, intelligent recovery engine, human approvals, and immutable audit logs in Zevkar AI.',
  },
  '/solutions': {
    title: 'Solutions — Zevkar AI',
    description:
      'See how automation agencies, SaaS teams, e-commerce operators, and Python engineers use Zevkar AI in production.',
  },
  '/integrations': {
    title: 'Integrations — Zevkar AI',
    description:
      'Connect verified n8n instances, custom webhooks, Python jobs, and FastAPI services to Zevkar AI, and check Zapier and Make.com status.',
  },
  '/how-it-works': {
    title: 'How It Works — Zevkar AI',
    description:
      'Walk through Zevkar AI’s 7-stage operational reliability pipeline from platform connection and execution monitoring to verified recovery.',
  },
  '/use-cases': {
    title: 'Use Cases — Zevkar AI',
    description:
      'Reliability blueprints for automation agencies, SaaS operations, e-commerce order syncs, lead pipelines, finance workflows, and engineering teams.',
  },
  '/pricing': {
    title: 'Pricing — Zevkar AI',
    description:
      'Compare configurable Zevkar AI Starter, Professional, Business, and Enterprise plans for automation monitoring, AI diagnostics, and safe recovery.',
  },
  '/docs': {
    title: 'Documentation — Zevkar AI',
    description:
      'Technical guides for account setup, connecting n8n, webhook payloads, stuck execution thresholds, AI diagnosis, and security architecture in Zevkar AI.',
  },
  '/developers': {
    title: 'Developer Reference — Zevkar AI',
    description:
      'Integrate FastAPI services, Python workers, and HMAC-signed webhooks with the Zevkar AI API and telemetry endpoints.',
  },
  '/blog': {
    title: 'Engineering Blog & Guides — Zevkar AI',
    description:
      'Read practical guides on idempotent workflow recovery, watermark-based n8n syncing, deterministic AI guardrails, and FastAPI error telemetry.',
  },
  '/resources': {
    title: 'Resources & Knowledge Base — Zevkar AI',
    description:
      'Guides, architecture tutorials, and engineering articles from Zevkar AI for keeping business-critical automations reliable.',
  },
  '/about': {
    title: 'About — Zevkar AI',
    description:
      'Zevkar AI was built to prevent silent automation failures and bring observable reliability engineering to n8n, webhooks, and custom Python pipelines.',
  },
  '/contact': {
    title: 'Contact — Zevkar AI',
    description:
      'Contact Aditya Ahirwal and the Zevkar AI team for technical onboarding, workspace setup, or partnership inquiries.',
  },
  '/privacy': {
    title: 'Privacy Policy — Zevkar AI',
    description:
      'Draft privacy notice detailing how Zevkar AI handles tenant isolation, webhook telemetry, integration credentials, and audit logs.',
  },
  '/terms': {
    title: 'Terms of Service — Zevkar AI',
    description:
      'Draft terms governing workspace accounts, safety approval gates, and acceptable usage of the Zevkar AI platform.',
  },
  '/cookies': {
    title: 'Cookie Policy — Zevkar AI',
    description:
      'Draft cookie notice explaining essential session authentication and timezone preference storage inside Zevkar AI.',
  },
  '/login': {
    title: 'Sign In — Zevkar AI',
    description: 'Sign in to your Zevkar AI workspace.',
  },
  '/signup': {
    title: 'Create Account — Zevkar AI',
    description: 'Create an organization workspace on Zevkar AI and complete onboarding.',
  },
  '/forgot-password': {
    title: 'Forgot Password — Zevkar AI',
    description: 'Request password reset instructions for your Zevkar AI account.',
  },
  '/reset-password': {
    title: 'Reset Password — Zevkar AI',
    description: 'Set a new password using your verification token on Zevkar AI.',
  },
  '/verify-email': {
    title: 'Verify Email — Zevkar AI',
    description: 'Verify your account email address on Zevkar AI.',
  },
  '/accept-invite': {
    title: 'Accept Team Invitation — Zevkar AI',
    description: 'Join your organization workspace on Zevkar AI using your team invitation link.',
  },
  '/onboarding': {
    title: 'Workspace Onboarding — Zevkar AI',
    description: 'Set up your organization, connect your first platform, and verify connection health in Zevkar AI.',
  },
  '/dashboard': {
    title: 'Control Console — Zevkar AI',
    description:
      'Monitor workflows, triage incidents, inspect AI diagnoses, and authorize verified recovery actions in Zevkar AI.',
  },
};

export function getRouteMeta(route: AppRoute): RouteMeta {
  return ROUTE_META_MAP[route] || ROUTE_META_MAP['/'];
}

import {
  Client,
  Execution,
  Incident,
  Integration,
  NotificationPreferenceItem,
  OnboardingState,
  OnboardingStepData,
  PlatformType,
  Role,
  Workflow,
} from '../types';
import { AppRoute, getDashboardRouteForRole } from './router';

export interface OnboardingStepDefinition {
  step: number;
  key: string;
  title: string;
  shortLabel: string;
  description: string;
}

export const ONBOARDING_STEPS: OnboardingStepDefinition[] = [
  {
    step: 1,
    key: 'welcome',
    title: 'Welcome to Zevkar',
    shortLabel: 'Welcome',
    description: 'Set up tenant-isolated automation monitoring, AI root-cause diagnosis, and human approval recovery guardrails.',
  },
  {
    step: 2,
    key: 'organization',
    title: 'Configure Organization Profile',
    shortLabel: 'Organization',
    description: 'Confirm your organization name, operations contact email, and display timezone.',
  },
  {
    step: 3,
    key: 'client',
    title: 'Add First Client or Project',
    shortLabel: 'First Client',
    description: 'Group connected automations under a client portfolio or internal operations project.',
  },
  {
    step: 4,
    key: 'platform',
    title: 'Select Automation Platform',
    shortLabel: 'Platform',
    description: 'Choose the primary runtime you want to monitor first.',
  },
  {
    step: 5,
    key: 'integration',
    title: 'Connect Integration',
    shortLabel: 'Connect',
    description: 'Register your connector endpoint. Credentials are stored encrypted server-side and never returned in API responses.',
  },
  {
    step: 6,
    key: 'test',
    title: 'Test Connection',
    shortLabel: 'Test',
    description: 'Verify endpoint reachability and inspect real validation feedback before syncing workflows.',
  },
  {
    step: 7,
    key: 'sync',
    title: 'Sync Workflows & Verify Import',
    shortLabel: 'Sync',
    description: 'Synchronize your first workflow set or confirm your webhook ingestion target is ready.',
  },
  {
    step: 8,
    key: 'complete',
    title: 'Launch Control Console',
    shortLabel: 'Complete',
    description: 'Review your workspace summary and enter the Zevkar reliability dashboard.',
  },
];

export interface OnboardingPlatformOption {
  id: PlatformType;
  label: string;
  badge: string;
  description: string;
  defaultLabel: string;
  defaultUrlPlaceholder: string;
  requiresApiKey: boolean;
  verificationMode: 'n8n-rest' | 'webhook-listener' | 'hybrid-webhook';
}

export const ONBOARDING_PLATFORM_OPTIONS: OnboardingPlatformOption[] = [
  {
    id: 'n8n',
    label: 'n8n',
    badge: 'REST API + Webhooks',
    description: 'Full workflow & execution polling sync, stuck-run detection, and one-click verified retries.',
    defaultLabel: 'Production n8n Cluster',
    defaultUrlPlaceholder: 'https://n8n.yourcompany.com/api/v1',
    requiresApiKey: true,
    verificationMode: 'n8n-rest',
  },
  {
    id: 'Make',
    label: 'Make',
    badge: 'HTTP Error Route',
    description: 'Capture scenario execution errors and HTTP route payloads inside Zevkar incident queues.',
    defaultLabel: 'Make.com Operations Scenarios',
    defaultUrlPlaceholder: 'https://hook.us1.make.com/your-scenario',
    requiresApiKey: false,
    verificationMode: 'hybrid-webhook',
  },
  {
    id: 'Zapier',
    label: 'Zapier',
    badge: 'Catch Hook',
    description: 'Forward failed Zap webhooks to Zevkar for error classification and triage.',
    defaultLabel: 'Zapier Production Workspace',
    defaultUrlPlaceholder: 'https://hooks.zapier.com/hooks/catch/demo/example',
    requiresApiKey: false,
    verificationMode: 'hybrid-webhook',
  },
  {
    id: 'custom_python',
    label: 'Custom API / Python / FastAPI',
    badge: 'HMAC Webhook Listener',
    description: 'Stream exceptions from FastAPI, Celery, or Python workers via POST /api/v1/webhooks/listener.',
    defaultLabel: 'Python & FastAPI Webhook Pipeline',
    defaultUrlPlaceholder: 'https://api.yourservice.com/webhooks/zevkar',
    requiresApiKey: false,
    verificationMode: 'webhook-listener',
  },
];

export function getOnboardingPlatformConfig(platform?: PlatformType | string): OnboardingPlatformOption {
  return (
    ONBOARDING_PLATFORM_OPTIONS.find((item) => item.id === platform) ||
    ONBOARDING_PLATFORM_OPTIONS[0]
  );
}

export function clampOnboardingStep(step: number): number {
  if (!Number.isFinite(step) || step < 1) return 1;
  if (step > ONBOARDING_STEPS.length) return ONBOARDING_STEPS.length;
  return Math.floor(step);
}

export function validateOnboardingStep(
  step: number,
  data: OnboardingStepData
): { valid: boolean; error?: string } {
  if (step === 2) {
    const org = (data.organizationName || '').trim();
    const email = (data.contactEmail || '').trim();
    if (org.length < 2) {
      return { valid: false, error: 'Organization name must be at least 2 characters.' };
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { valid: false, error: 'Enter a valid operations contact email.' };
    }
  }

  if (step === 3) {
    const clientName = (data.clientName || '').trim();
    const companyName = (data.companyName || clientName).trim();
    const clientEmail = (data.clientEmail || '').trim();
    if (clientName.length < 2 || companyName.length < 2) {
      return { valid: false, error: 'Enter a client or project name (at least 2 characters).' };
    }
    if (!clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      return { valid: false, error: 'Enter a valid client or project contact email.' };
    }
  }

  if (step === 5) {
    const label = (data.integrationName || '').trim();
    const url = (data.instanceUrl || '').trim();
    if (label.length < 2) {
      return { valid: false, error: 'Provide an integration name (at least 2 characters).' };
    }
    if (url) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return { valid: false, error: 'Instance or webhook URL must use http:// or https://.' };
        }
      } catch {
        return { valid: false, error: 'Enter a valid URL starting with https:// or http://.' };
      }
    } else if (data.platform === 'n8n') {
      return { valid: false, error: 'Enter your n8n instance URL (e.g. https://n8n.yourcompany.com/api/v1).' };
    }
  }

  return { valid: true };
}

export function resolvePostAuthDestination(params: {
  isAuthenticated: boolean;
  onboardingCompleted?: boolean | null;
  role?: Role | string | null;
  pendingTab?: string | null;
}): { route: AppRoute; tab?: string } {
  if (!params.isAuthenticated) {
    return { route: '/login' };
  }
  if (params.onboardingCompleted === false) {
    return { route: '/onboarding' };
  }
  return {
    route: getDashboardRouteForRole(params.role),
    tab: params.pendingTab || undefined,
  };
}

export interface GettingStartedChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  actionLabel: string;
  targetTab?: string;
  targetRoute?: AppRoute;
}

export function computeGettingStartedChecklist(input: {
  onboardingState?: Partial<OnboardingState> | null;
  clients: Client[];
  integrations: Integration[];
  workflows: Workflow[];
  executions: Execution[];
  incidents: Incident[];
  notificationPreferences?: NotificationPreferenceItem[];
}): {
  items: GettingStartedChecklistItem[];
  completedCount: number;
  totalCount: number;
  progressPercent: number;
} {
  const hasClient = input.clients.length > 0;
  const hasIntegration = input.integrations.length > 0;
  const hasSyncedWorkflow =
    input.workflows.length > 0 ||
    input.integrations.some((i) => Boolean(i.lastSyncedAt) && i.lastSyncStatus === 'SUCCESS');
  const hasExecution = input.executions.length > 0;
  const hasIncidentOrTested =
    input.incidents.length > 0 ||
    Boolean(input.onboardingState?.data?.syncCompleted);
  const hasDiagnosis = input.incidents.some((inc) => Boolean(inc.aiDiagnosis));
  const hasNotificationsConfigured = Boolean(
    input.notificationPreferences && input.notificationPreferences.some((pref) => pref.isEnabled)
  );

  const items: GettingStartedChecklistItem[] = [
    {
      id: 'client',
      title: 'Add your first client or project',
      description: 'Organize workflows and incidents inside isolated client portfolios.',
      completed: hasClient,
      actionLabel: hasClient ? 'Manage Clients' : 'Add Client',
      targetTab: 'clients',
    },
    {
      id: 'integration',
      title: 'Connect an automation platform',
      description: 'Connect n8n, Make, Zapier, or register your FastAPI webhook gateway.',
      completed: hasIntegration,
      actionLabel: hasIntegration ? 'View Integrations' : 'Connect Platform',
      targetTab: 'integrations',
    },
    {
      id: 'workflow',
      title: 'Import or register monitored workflows',
      description: 'Sync active flows from n8n or add a custom runtime endpoint to track.',
      completed: hasSyncedWorkflow,
      actionLabel: hasSyncedWorkflow ? 'View Workflows' : 'Sync / Add Workflow',
      targetTab: 'workflows',
    },
    {
      id: 'executions',
      title: 'Inspect execution telemetry',
      description: 'Verify live execution logs, stuck-run thresholds, and timing metrics.',
      completed: hasExecution,
      actionLabel: 'Inspect Executions',
      targetTab: 'workflows',
    },
    {
      id: 'incident',
      title: 'Verify failure ingestion or simulation',
      description: 'Confirm webhook errors open deduplicated incidents cleanly.',
      completed: hasIncidentOrTested,
      actionLabel: 'View Incidents',
      targetTab: 'incidents',
    },
    {
      id: 'diagnosis',
      title: 'Run AI root-cause diagnosis',
      description: 'Inspect root cause, risk assessment, and recommended recovery actions.',
      completed: hasDiagnosis,
      actionLabel: 'Open AI Diagnosis',
      targetTab: 'diagnosis',
    },
    {
      id: 'notifications',
      title: 'Configure alert & recovery notifications',
      description: 'Choose minimum severity thresholds and alert delivery channels.',
      completed: hasNotificationsConfigured,
      actionLabel: 'Notification Settings',
      targetTab: 'settings',
    },
  ];

  const completedCount = items.filter((item) => item.completed).length;
  const totalCount = items.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  return {
    items,
    completedCount,
    totalCount,
    progressPercent,
  };
}

export function createEmptyOnboardingState(agencyId: string, orgName?: string, contactEmail?: string, timezone = 'UTC'): OnboardingState {
  return {
    agencyId,
    currentStep: 1,
    completed: false,
    data: {
      organizationName: orgName || '',
      contactEmail: contactEmail || '',
      timezone,
      platform: 'n8n',
    },
  };
}

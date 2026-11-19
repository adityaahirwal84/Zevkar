export type IntegrationAvailability = 'Available' | 'In Development' | 'Planned';

export interface IntegrationDirectoryEntry {
  id: string;
  name: string;
  category: string;
  availability: IntegrationAvailability;
  description: string;
  verifiedCapabilities: string[];
  setupSteps: string[];
  docsSectionId: string;
  canConnectDirectly: boolean;
}

export const INTEGRATION_DIRECTORY: IntegrationDirectoryEntry[] = [
  {
    id: 'n8n',
    name: 'n8n',
    category: 'Workflow Automation',
    availability: 'Available',
    description:
      'Verified integration via n8n REST API v1 and Error Trigger webhooks. Supports paginated execution sync, watermark tracking, stuck execution detection, and verified retry execution.',
    verifiedCapabilities: [
      'Credential validation against GET /api/v1/workflows',
      'Cursor-paginated execution sync with persistent watermarks',
      'Verified recovery retries via POST /executions/{id}/retry & GET /executions/{newId}',
    ],
    setupSteps: [
      'Generate an API key in n8n under Settings -> n8n API.',
      'Open Integrations in Zevkar AI and add your n8n base URL + API key.',
      'Run Test Connection to confirm live API reachability and trigger initial sync.',
      'Optionally point an n8n Error Trigger workflow to POST /api/v1/webhooks/listener.',
    ],
    docsSectionId: 'connecting-n8n',
    canConnectDirectly: true,
  },
  {
    id: 'webhooks',
    name: 'Custom Webhooks',
    category: 'Universal Event Ingestion',
    availability: 'Available',
    description:
      'Verified JSON failure listener endpoint supporting HMAC SHA-256 verification and deterministic incident deduplication.',
    verifiedCapabilities: [
      'Ingests structured JSON payloads at POST /api/v1/webhooks/listener',
      'Deduplicates repeated execution failures via SHA-256 incident fingerprinting',
      'Maps platform, workflow_id, execution_id, and error trace directly to incidents',
    ],
    setupSteps: [
      'Configure your emitter to send POST JSON payloads to /api/v1/webhooks/listener.',
      'Include workflowId, executionId, platform, and error message fields.',
      'Sign requests with X-Webhook-Signature when WEBHOOK_SIGNING_SECRET is configured.',
    ],
    docsSectionId: 'api-integration',
    canConnectDirectly: true,
  },
  {
    id: 'python',
    name: 'Custom Python Scripts',
    category: 'Backend Jobs & Workers',
    availability: 'Available',
    description:
      'Verified webhook-based reporting pattern for cron scripts, ETL workers, and Celery tasks using standard HTTPX or requests exception hooks.',
    verifiedCapabilities: [
      'Captures Python tracebacks and upstream API errors in structured incidents',
      'Classifies database, timeout, auth, and schema errors automatically',
      'Supports idempotent recovery tracking and operator approval gates',
    ],
    setupSteps: [
      'Wrap top-level script or Celery task handlers with an exception callback.',
      'POST workflow_id, execution_id, and traceback summary to /api/v1/webhooks/listener.',
      'Inspect classified incidents and Gemini/deterministic diagnoses inside the dashboard.',
    ],
    docsSectionId: 'api-integration',
    canConnectDirectly: true,
  },
  {
    id: 'fastapi',
    name: 'FastAPI Applications',
    category: 'API Microservices',
    availability: 'Available',
    description:
      'Verified exception hook integration for FastAPI background tasks and downstream webhook consumers.',
    verifiedCapabilities: [
      'Captures HTTP 401/429/5xx dependency failures with request trace context',
      'Routes failures through Gemini + deterministic root-cause classification',
      'Tracks occurrence counts and audit logs per tenant organization',
    ],
    setupSteps: [
      'Add an async HTTPX reporter inside your FastAPI background task error handler.',
      'Forward service identifier, trace ID, and error message to /api/v1/webhooks/listener.',
      'Review root-cause diagnoses and required operator actions in AI Diagnosis.',
    ],
    docsSectionId: 'api-integration',
    canConnectDirectly: true,
  },
  {
    id: 'zapier',
    name: 'Zapier',
    category: 'No-Code Automation',
    availability: 'In Development',
    description:
      'Catch-hook error reporting via POST /api/v1/webhooks/listener works today; native Zapier Partner API Zap discovery and replay orchestration are actively in development.',
    verifiedCapabilities: [
      'Receives Zapier Manager or Webhooks-by-Zapier failure POST events',
      'Native OAuth Zap listing and API-triggered Zap replay are In Development',
    ],
    setupSteps: [
      'Until the native Partner API connector completes, attach a Zapier Manager error step.',
      'POST failure payload JSON to /api/v1/webhooks/listener with platform="Zapier".',
    ],
    docsSectionId: 'api-integration',
    canConnectDirectly: true,
  },
  {
    id: 'make',
    name: 'Make.com',
    category: 'Visual Scenarios',
    availability: 'In Development',
    description:
      'Error-handler HTTP module ingestion works today; automated Make scenario API polling and verified remote scenario replay are actively in development.',
    verifiedCapabilities: [
      'Ingests Make HTTP error-route JSON notifications into incident triage',
      'Automated Make scenario polling and replay verification are In Development',
    ],
    setupSteps: [
      'Attach an Error Handler route on critical Make scenario modules.',
      'Configure an HTTP Make a Request module targeting /api/v1/webhooks/listener.',
    ],
    docsSectionId: 'api-integration',
    canConnectDirectly: true,
  },
  {
    id: 'slack-pagerduty',
    name: 'Slack & PagerDuty Routing',
    category: 'External Alert Dispatch',
    availability: 'Planned',
    description:
      'Planned outbound severity routing to Slack channels and PagerDuty incidents. Currently notifications appear in-app inside the Dashboard Notification Center.',
    verifiedCapabilities: [
      'In-app deduplicated notification center is live',
      'Outbound Slack interactive approval blocks and PagerDuty webhooks are Planned',
    ],
    setupSteps: [
      'Currently planned for a future release; monitor real-time alerts in the Dashboard Notification Center.',
    ],
    docsSectionId: 'workflow-monitoring',
    canConnectDirectly: false,
  },
];

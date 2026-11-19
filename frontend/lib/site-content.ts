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
}

export const INTEGRATION_DIRECTORY: IntegrationDirectoryEntry[] = [
  {
    id: 'n8n',
    name: 'n8n',
    category: 'Workflow Automation',
    availability: 'Available',
    description:
      'Verified integration via n8n REST API v1 and Error Trigger webhooks with paginated execution sync, watermarks, stuck execution detection, and verified retry execution.',
    verifiedCapabilities: [
      'Credential validation against GET /api/v1/workflows',
      'Cursor-paginated execution sync with persistent watermarks',
      'Verified retries via POST /executions/{id}/retry & GET /executions/{newId}',
    ],
    setupSteps: [
      'Generate an API key in n8n under Settings -> n8n API.',
      'Open Integrations in Zevkar AI and enter your n8n URL and API key.',
      'Run Test Connection and trigger initial sync.',
    ],
    docsSectionId: 'connecting-n8n',
  },
  {
    id: 'webhooks',
    name: 'Custom Webhooks',
    category: 'Universal Event Ingestion',
    availability: 'Available',
    description:
      'Verified JSON failure ingestion at POST /api/v1/webhooks/listener with optional HMAC SHA-256 verification and deduplication.',
    verifiedCapabilities: [
      'Structured failure payload ingestion with HTTP 200/201 acknowledgment',
      'SHA-256 incident fingerprinting across repeated failures',
      'Direct routing to AI Diagnosis and Recovery Center',
    ],
    setupSteps: [
      'POST JSON payloads containing workflowId, executionId, platform, and error.',
      'Optionally sign payloads using X-Webhook-Signature and WEBHOOK_SIGNING_SECRET.',
    ],
    docsSectionId: 'api-integration',
  },
  {
    id: 'python',
    name: 'Custom Python Scripts',
    category: 'Backend Jobs & Workers',
    availability: 'Available',
    description:
      'Standard HTTPX / requests exception reporting hook for cron workers, ETL scripts, and background tasks.',
    verifiedCapabilities: [
      'Captures tracebacks, HTTP errors, and database timeouts',
      'Deterministic error classification with Gemini diagnosis',
    ],
    setupSteps: [
      'Wrap unhandled exceptions with an async/sync HTTP reporter.',
      'Forward service ID, execution ID, and error message to /api/v1/webhooks/listener.',
    ],
    docsSectionId: 'api-integration',
  },
  {
    id: 'fastapi',
    name: 'FastAPI Applications',
    category: 'API Microservices',
    availability: 'Available',
    description:
      'Register exception handlers or background task callbacks in FastAPI microservices for centralized triage.',
    verifiedCapabilities: [
      'Captures dependency timeouts, auth revocations, and schema mismatches',
      'Logs chronological workspace audit trails',
    ],
    setupSteps: [
      'Add an async HTTPX POST inside your FastAPI background exception handler.',
      'Inspect classified incidents inside the Zevkar AI dashboard.',
    ],
    docsSectionId: 'api-integration',
  },
  {
    id: 'zapier',
    name: 'Zapier',
    category: 'No-Code Automation',
    availability: 'In Development',
    description:
      'Catch-hook error reporting works today; native Zapier Partner API discovery and remote replay are actively in development.',
    verifiedCapabilities: [
      'Receives Zapier Manager or Webhooks-by-Zapier failure events',
      'Native OAuth Zap discovery and remote replay are In Development',
    ],
    setupSteps: [
      'Attach a Zapier Manager error step pointing to /api/v1/webhooks/listener.',
    ],
    docsSectionId: 'api-integration',
  },
  {
    id: 'make',
    name: 'Make.com',
    category: 'Visual Scenarios',
    availability: 'In Development',
    description:
      'Make HTTP error-handler ingestion works today; automated scenario polling and remote replay verification are actively in development.',
    verifiedCapabilities: [
      'Ingests Make error-route JSON into incident triage',
      'Scenario API polling & replay verification are In Development',
    ],
    setupSteps: [
      'Attach a Make Error Handler route using the HTTP module.',
    ],
    docsSectionId: 'api-integration',
  },
  {
    id: 'slack-pagerduty',
    name: 'Slack & PagerDuty Routing',
    category: 'External Alert Dispatch',
    availability: 'Planned',
    description:
      'Planned outbound alerting to Slack channels and PagerDuty services. Today, real-time notifications surface inside the dashboard Notification Center.',
    verifiedCapabilities: [
      'In-app deduplicated Notification Center is active',
      'Outbound Slack and PagerDuty dispatches are Planned',
    ],
    setupSteps: [
      'Monitor active incidents and pending approvals inside the Notification Center.',
    ],
    docsSectionId: 'workflow-monitoring',
  },
];

export interface PricingPlanConfig {
  id: 'starter' | 'professional' | 'business' | 'enterprise';
  name: string;
  audience: string;
  monthlyPriceUsd: number | null;
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

export const DEFAULT_PRICING_PLANS: PricingPlanConfig[] = [
  {
    id: 'starter',
    name: 'Starter',
    audience: 'For solo operators and early automation stacks',
    monthlyPriceUsd: 49,
    annualPriceUsd: 39,
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
      'Root-cause diagnosis with deterministic fallback',
      'In-app incident notifications',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    audience: 'For growing SaaS ops, e-commerce, and engineering teams',
    monthlyPriceUsd: 149,
    annualPriceUsd: 119,
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
      'Stuck execution detection & execution tracking',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    audience: 'For multi-client automation agencies and ops organizations',
    monthlyPriceUsd: 349,
    annualPriceUsd: 279,
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
      'Immutable audit logs & JSON archive export',
      'Priority technical support & onboarding',
    ],
  },
  {
    id: 'enterprise',
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
];

export interface DocSection {
  id: string;
  title: string;
  category: string;
  summary: string;
  bodyParagraphs: string[];
  codeTitle?: string;
  codeSnippet?: string;
  notes?: string[];
}

export const DOCUMENTATION_SECTIONS: DocSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    category: 'Foundations',
    summary: 'Connect automation sources, deduplicate failures, run AI diagnosis, and gate recoveries behind human approval.',
    bodyParagraphs: [
      'Zevkar AI sits beside your workflow tools (n8n, webhooks, Python workers, and FastAPI services) as an observability, diagnosis, and recovery control plane.',
      'All workspaces are organization-scoped so incidents, workflows, approvals, and audit trails stay strictly tenant-isolated.',
    ],
    notes: [
      'Default org recovery policy enables approval gates (approval_required = true) and disables blind auto-recovery.',
    ],
  },
  {
    id: 'account-setup',
    title: 'Account & Organization Setup',
    category: 'Foundations',
    summary: 'Provision an agency organization with Argon2id security and assign RBAC roles.',
    bodyParagraphs: [
      'Signing up provisions an organization tenant and OWNER membership automatically.',
      'Admins and Owners govern high-impact recovery approvals while Developers and Viewers inspect telemetry cleanly.',
    ],
  },
  {
    id: 'connecting-n8n',
    title: 'Connecting n8n',
    category: 'Integrations',
    summary: 'Validate REST credentials, paginate executions with persistent watermarks, and detect stuck runs.',
    bodyParagraphs: [
      'Credentials test against GET /api/v1/workflows and protect against SSRF by blocking private/loopback URLs unless explicitly permitted in local dev.',
    ],
    codeTitle: 'POST /api/v1/integrations/test',
    codeSnippet: `{
  "platform": "n8n",
  "instance_url": "https://n8n.yourcompany.com/api/v1",
  "api_key": "n8n_api_xxxxxxxxxxxxxxxx"
}`,
  },
  {
    id: 'api-integration',
    title: 'API & Webhook Integration',
    category: 'Integrations',
    summary: 'Stream Python, FastAPI, Zapier catch hooks, or Make error routes to POST /api/v1/webhooks/listener.',
    bodyParagraphs: [
      'Every webhook payload maps into a deduplicated Incident and updates affected workflow health states immediately.',
    ],
    codeTitle: 'Python Exception Reporter',
    codeSnippet: `async with httpx.AsyncClient(timeout=5.0) as client:
    await client.post("/api/v1/webhooks/listener", json={
        "workflowId": "fastapi_orders",
        "executionId": "exec_104",
        "platform": "FastAPI",
        "error": "HTTP 401 Unauthorized"
    })`,
  },
  {
    id: 'workflow-monitoring',
    title: 'Workflow Monitoring & Stuck Detection',
    category: 'Operations',
    summary: 'Monitor workflow health transitions (HEALTHY, DEGRADED, FAILING) and long-running stuck timeouts.',
    bodyParagraphs: [
      'Executions stuck in RUNNING beyond threshold (default 900s, or 14,400s for long-running flows) trigger dedicated stuck incidents.',
    ],
  },
  {
    id: 'incident-diagnosis',
    title: 'Incident Diagnosis (Gemini + Fallback)',
    category: 'AI Intelligence',
    summary: 'Structured Gemini root-cause analysis paired with deterministic classification when AI keys are absent.',
    bodyParagraphs: [
      'Outputs root cause, plain-English client summary, error category, expected risk level, recommended strategy, and required operator action.',
    ],
  },
  {
    id: 'recovery-and-approvals',
    title: 'Recovery Engine & Human Approvals',
    category: 'Safety & Recovery',
    summary: 'Execute safe retries protected by SHA-256 idempotency hashes, cooldowns, and outcome verification.',
    bodyParagraphs: [
      'Financial, auth, database, and CRITICAL incidents remain quarantined behind human sign-off before execution.',
    ],
    codeTitle: '9-Stage Pipeline',
    codeSnippet: `Failed Execution -> Incident Detection -> AI Diagnosis -> Recovery Recommendation
  -> Risk Assessment -> Human Approval -> Recovery Execution
  -> Result Verification -> Recovery History`,
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    category: 'Operations',
    summary: 'Diagnose HTTP 403 approval blocks, HTTP 409 duplicate recovery locks, and local SSRF guardrails.',
    bodyParagraphs: [
      'Verify an APPROVED decision exists on the linked ApprovalRequest before executing guarded recovery requests.',
    ],
  },
  {
    id: 'security',
    title: 'Security Architecture',
    category: 'Security',
    summary: 'Server-side secrets, Fernet encrypted connector keys, JWT auth, and immutable organization audit logs.',
    bodyParagraphs: [
      'Secrets such as GEMINI_API_KEY and integration credentials never expose to client browsers.',
    ],
  },
];

export interface BlogArticle {
  slug: string;
  title: string;
  category: 'Architecture' | 'n8n Operations' | 'Safety & Recovery' | 'Python & FastAPI';
  publishedLabel: string;
  readTime: string;
  summary: string;
  sections: { heading: string; paragraphs: string[]; code?: string }[];
}

export const BLOG_ARTICLES: BlogArticle[] = [
  {
    slug: 'idempotent-workflow-recovery-sha256',
    title: 'Why Blind Workflow Retries Break Production Billing—and How Idempotency Keys Prevent Them',
    category: 'Safety & Recovery',
    publishedLabel: 'Engineering Guide',
    readTime: '6 min read',
    summary: 'Learn how SHA-256 idempotency hashes, retry ceilings, and cooldown windows prevent duplicate billing side effects.',
    sections: [
      {
        heading: 'The hidden danger of blind retries',
        paragraphs: [
          'When an HTTP 429 or gateway timeout interrupts a multi-step billing workflow, clicking Retry blindly can double-charge invoices.',
          'Zevkar AI binds every recovery request and attempt to a deterministic SHA-256 key and verifies actual upstream outcomes.',
        ],
        code: `key = sha256(f"{recovery_request_id}:{attempt_number}:{strategy}")[:32]`,
      },
    ],
  },
  {
    slug: 'watermark-based-n8n-execution-sync',
    title: 'Designing Reliable n8n Execution Polling Without Missing Late Failures',
    category: 'n8n Operations',
    publishedLabel: 'Operations Playbook',
    readTime: '5 min read',
    summary: 'How cursor pagination, persistent polling watermarks, and overlap windows catch late RUNNING -> FAILED transitions.',
    sections: [
      {
        heading: 'Overlap windows prevent blind spots',
        paragraphs: [
          'Storing an overlap window per integration ensures executions transitioning from RUNNING to FAILED ten minutes later are updated cleanly rather than skipped.',
        ],
      },
    ],
  },
  {
    slug: 'deterministic-fallback-with-ai-diagnosis',
    title: 'Pairing Gemini Root-Cause Diagnosis with Deterministic Safety Guardrails',
    category: 'Architecture',
    publishedLabel: 'System Design',
    readTime: '5 min read',
    summary: 'Why reliability systems must combine natural-language AI explanations with deterministic category guardrails.',
    sections: [
      {
        heading: 'Safety policy always wins',
        paragraphs: [
          'Even when Gemini generates helpful remediation context, organizational approval gates and risk thresholds remain strictly enforced.',
        ],
      },
    ],
  },
  {
    slug: 'fastapi-webhook-exception-telemetry',
    title: 'Instrumenting FastAPI Background Workers for Centralized Incident Triage',
    category: 'Python & FastAPI',
    publishedLabel: 'Developer Tutorial',
    readTime: '4 min read',
    summary: 'Forward unhandled Python exceptions from workers and FastAPI services into one tenant-isolated incident queue.',
    sections: [
      {
        heading: 'Unifying no-code and Python reliability',
        paragraphs: [
          'Hybrid teams run n8n orchestrations alongside Python ETL workers. Routing both into POST /api/v1/webhooks/listener creates a single audit trail.',
        ],
      },
    ],
  },
];

export const FOUNDER_STORY = {
  name: 'Aditya Ahirwal',
  designation: 'Founder, Zevkar AI',
  email: 'aditya84azm@gmail.com',
  paragraphs: [
    "I'm Aditya, the founder of Zevkar AI. I'm building this platform to make business automations more reliable, transparent, and easier to manage.",
    "As businesses depend more on automated workflows for important operations, a failed step is rarely just a technical glitch. It can mean missed opportunities, delayed work, frustrated customers, and hours spent piecing together what broke—often long after it began affecting the business.",
    "I started Zevkar AI around a simple idea: teams shouldn't have to watch their workflows or guess why something stopped working. The platform monitors executions, spots failures early, explains the likely root cause, and supports safe recovery with the right human oversight—so operators spend less time firefighting broken automations.",
  ],
};

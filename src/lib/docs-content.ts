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
    summary: 'Understand how Zevkar AI connects to workflows, deduplicates failures, diagnoses root causes, and verifies safe recoveries.',
    bodyParagraphs: [
      'Zevkar AI sits beside your existing workflow tools (n8n, custom webhooks, Python workers, and FastAPI services) as an observability, AI diagnosis, and recovery control plane.',
      'Every workspace is organization-scoped. Incidents, workflows, approvals, recovery requests, and audit logs belong strictly to a single organization tenant.',
    ],
    notes: [
      'Create an organization during signup and complete the 6-step onboarding flow to connect your first platform.',
      'Default org recovery policy enforces human approval (approval_required = true) and disables blind auto-recovery until explicitly enabled.',
    ],
  },
  {
    id: 'account-setup',
    title: 'Account & Organization Setup',
    category: 'Foundations',
    summary: 'Sign up, verify your account state, invite engineers with RBAC roles, and configure your workspace timezone.',
    bodyParagraphs: [
      'When you create an account via /signup, an organization (agency/workspace) and OWNER membership are provisioned automatically using Argon2id password hashing.',
      'Team members can be assigned OWNER, ADMIN, DEVELOPER, MEMBER, or VIEWER roles. High-impact approval authorizations require OWNER or ADMIN privileges.',
    ],
    notes: [
      'All execution and audit timestamps are stored in UTC on the backend and formatted in your configured IANA timezone inside the dashboard.',
    ],
  },
  {
    id: 'connecting-n8n',
    title: 'Connecting n8n',
    category: 'Integrations',
    summary: 'Link self-hosted or n8n Cloud instances using the n8n v1 REST API and Error Trigger webhooks.',
    bodyParagraphs: [
      'Zevkar AI validates n8n credentials directly against GET /api/v1/workflows, stores API keys encrypted at rest when INTEGRATION_ENCRYPTION_KEY is set, and rejects private/loopback SSRF URLs unless explicitly permitted for local development.',
      'Sync jobs maintain persistent watermarks with overlap windows so paginated workflow runs and late state transitions (RUNNING to SUCCESS/FAILED) are never skipped or duplicated.',
    ],
    codeTitle: 'POST /api/v1/integrations/test',
    codeSnippet: `{
  "platform": "n8n",
  "instance_url": "https://n8n.yourcompany.com/api/v1",
  "api_key": "n8n_api_xxxxxxxxxxxxxxxx"
}`,
    notes: [
      'Ensure your n8n instance URL is reachable from the FastAPI/Celery worker network.',
    ],
  },
  {
    id: 'api-integration',
    title: 'API & Webhook Integration',
    category: 'Integrations',
    summary: 'Forward failures from custom Python scripts, FastAPI background workers, Zapier catch hooks, or Make error routes.',
    bodyParagraphs: [
      'Any automation platform capable of sending HTTPS JSON payloads can report failures to POST /api/v1/webhooks/listener. Payloads are verified via HMAC SHA-256 signature when WEBHOOK_SIGNING_SECRET is configured.',
      'Incoming events automatically deduplicate matching execution IDs and group recurring errors by workflow and category.',
    ],
    codeTitle: 'Python / FastAPI Failure Reporter',
    codeSnippet: `import httpx

async def report_automation_failure(workflow_id: str, execution_id: str, err: Exception):
    payload = {
        "workflowId": workflow_id,
        "executionId": execution_id,
        "platform": "FastAPI",
        "error": f"{type(err).__name__}: {err}",
        "status": "FAILED",
    }
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post("http://localhost:8000/api/v1/webhooks/listener", json=payload)`,
  },
  {
    id: 'workflow-monitoring',
    title: 'Workflow Monitoring & Stuck Detection',
    category: 'Operations',
    summary: 'Track workflow health scores, execution durations, and stuck-run thresholds across connected platforms.',
    bodyParagraphs: [
      'Health scores reflect live execution outcomes and active open incidents. Consecutive failure counters automatically transition workflows across HEALTHY, DEGRADED, and FAILING states.',
      'Stuck execution detection flags runs stuck in RUNNING beyond configurable thresholds (default 900s, or 14,400s for long-running jobs and custom workflow overrides).',
    ],
  },
  {
    id: 'incident-diagnosis',
    title: 'Incident Diagnosis (Gemini + Deterministic Fallback)',
    category: 'AI Intelligence',
    summary: 'Classify failure categories and generate both engineering root causes and structured recovery recommendations.',
    bodyParagraphs: [
      'When an incident is analyzed via POST /api/v1/diagnosis/analyze, the server invokes Google Gemini using GEMINI_API_KEY and validates structured JSON fields including is_recoverable, recommended_strategy, expected_risk_level, and required_user_action.',
      'If GEMINI_API_KEY is unconfigured or an upstream API timeout occurs, the deterministic classifier seamlessly supplies safe category classification and remediation steps.',
    ],
  },
  {
    id: 'recovery-and-approvals',
    title: 'Recovery Engine & Human Approvals',
    category: 'Safety & Recovery',
    summary: 'Govern workflow retries with risk assessment, approval gates, cooldown windows, exponential backoff, and outcome verification.',
    bodyParagraphs: [
      'Supported recovery strategies are RETRY_EXECUTION, RETRY_AFTER_DELAY, RETRY_EXPONENTIAL_BACKOFF, MANUAL_RECOVERY, MARK_NON_RECOVERABLE, and ESCALATE_HUMAN.',
      'Financial, auth, database, or high/critical-risk incidents require explicit OWNER or ADMIN approval before execution. External n8n retries always check GET /executions/{newId} to confirm true VERIFIED_SUCCESS or VERIFIED_FAILED status.',
    ],
    codeTitle: '9-Stage Recovery Pipeline',
    codeSnippet: `Failed Execution -> Incident Detection -> AI Diagnosis -> Recovery Recommendation
  -> Risk Assessment -> Human Approval -> Recovery Execution
  -> Result Verification -> Recovery History`,
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    category: 'Operations',
    summary: 'Common diagnostics for n8n sync errors, SSRF blocks, unapproved recovery 403 responses, and fallback diagnosis states.',
    bodyParagraphs: [
      'HTTP 403 on recovery execute: verify the linked ApprovalRequest status is APPROVED and your account holds OWNER or ADMIN role.',
      'HTTP 409 on recovery request creation: an active recovery request already exists for that incident; inspect or cancel it before creating a new one.',
      'SSRF block when testing local n8n: set ALLOW_PRIVATE_INTEGRATION_URLS=true in local development environments only.',
    ],
  },
  {
    id: 'security',
    title: 'Security Architecture',
    category: 'Security',
    summary: 'Learn how credentials, tenant boundaries, webhooks, and audit logs are protected across frontend and backend layers.',
    bodyParagraphs: [
      'All API secrets (GEMINI_API_KEY, JWT secrets, integration API keys) remain strictly on the server. Integration credentials are encrypted with Fernet when INTEGRATION_ENCRYPTION_KEY is provided.',
      'Every state-changing operation emits an immutable AuditLog entry scoped by organization ID, and cross-tenant resource lookups return HTTP 403/404.',
    ],
  },
];

import type { Execution, Incident, Integration, PlatformType, Role, Workflow } from '../types';

export type ControlWorkflowStatus = 'ACTIVE' | 'INACTIVE' | 'PAUSED' | 'FAILED' | 'UNKNOWN';

export type ControlActionType =
  | 'ACTIVATE'
  | 'DEACTIVATE'
  | 'TRIGGER'
  | 'RETRY_EXECUTION'
  | 'PAUSE'
  | 'RESUME'
  | 'UPDATE_SETTINGS'
  | 'MANAGE_SCHEDULE';

export type ControlActionStatus =
  | 'PENDING'
  | 'AWAITING_APPROVAL'
  | 'RUNNING'
  | 'SUCCESSFUL'
  | 'FAILED'
  | 'CANCELLED';

export interface ProviderCapabilityFlag {
  supported: boolean;
  reason: string;
  requires_approval?: boolean;
}

export interface ProviderCapabilitiesMap {
  platform: string;
  adapter_mode: string;
  list_workflows: ProviderCapabilityFlag;
  fetch_executions: ProviderCapabilityFlag;
  activate: ProviderCapabilityFlag;
  deactivate: ProviderCapabilityFlag;
  trigger: ProviderCapabilityFlag;
  retry_execution: ProviderCapabilityFlag;
  pause: ProviderCapabilityFlag;
  resume: ProviderCapabilityFlag;
  update_settings: ProviderCapabilityFlag;
  manage_schedule: ProviderCapabilityFlag;
  webhook_ingest: ProviderCapabilityFlag;
}

export interface ControlWorkflowItem {
  id: string;
  name: string;
  platform: PlatformType | string;
  clientName: string;
  integrationId?: string;
  integrationName?: string;
  integrationStatus?: string;
  externalWorkflowId: string;
  isActive: boolean;
  controlStatus: ControlWorkflowStatus;
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'FAILING' | string;
  consecutiveFailures: number;
  avgDurationMs: number;
  lastExecutionAt?: string | null;
  lastSuccessfulAt?: string | null;
  lastFailedAt?: string | null;
  nextScheduledAt?: string | null;
  scheduleSummary?: string | null;
  openIncidentsCount: number;
  capabilities: ProviderCapabilitiesMap;
}

export interface ControlActionRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  platform: string;
  actionType: ControlActionType;
  targetExecutionId?: string | null;
  status: ControlActionStatus;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresApproval: boolean;
  confirmedByUser: boolean;
  reason?: string;
  requestedBy: string;
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ControlActivityRecord {
  id: string;
  workflowId?: string;
  workflowName?: string;
  platform: string;
  actorRole?: string;
  actionType: string;
  eventStatus: string;
  summary: string;
  createdAt: string;
}

export interface ControlAssistantProposal {
  workflowId: string;
  workflowName: string;
  platform: string;
  actionType: ControlActionType;
  supported: boolean;
  capabilityReason?: string;
  requiresApproval: boolean;
  requiresConfirmation: true;
  autoExecuted: false;
  reason: string;
  impactSummary: string;
}

export interface ControlAssistantAnswer {
  answer: string;
  riskNotes: string[];
  preventiveRecommendations: string[];
  proposedActions: ControlAssistantProposal[];
  unhealthyCount: number;
  repeatedFailuresCount: number;
  isAiGenerated: boolean;
  modelUsed: string;
}

const SENSITIVE_NAME_RE =
  /stripe|invoice|payment|refund|billing|payroll|charge|delete|drop|crm|email|broadcast/i;

const HIGH_RISK_ACTIONS: ReadonlySet<ControlActionType> = new Set([
  'DEACTIVATE',
  'PAUSE',
  'UPDATE_SETTINGS',
  'MANAGE_SCHEDULE',
]);

export type CapabilityFlagKey =
  | 'list_workflows'
  | 'fetch_executions'
  | 'activate'
  | 'deactivate'
  | 'trigger'
  | 'retry_execution'
  | 'pause'
  | 'resume'
  | 'update_settings'
  | 'manage_schedule'
  | 'webhook_ingest';

export const ACTION_CAPABILITY_KEY: Record<ControlActionType, CapabilityFlagKey> = {
  ACTIVATE: 'activate',
  DEACTIVATE: 'deactivate',
  TRIGGER: 'trigger',
  RETRY_EXECUTION: 'retry_execution',
  PAUSE: 'pause',
  RESUME: 'resume',
  UPDATE_SETTINGS: 'update_settings',
  MANAGE_SCHEDULE: 'manage_schedule',
};

export function isSensitiveWorkflowName(name: string): boolean {
  return SENSITIVE_NAME_RE.test(name || '');
}

export function normalizeControlStatus(input: {
  controlStatus?: string | null;
  isActive?: boolean;
  healthStatus?: string | null;
  hasIntegration?: boolean;
}): ControlWorkflowStatus {
  const raw = (input.controlStatus || '').toUpperCase();
  if (raw === 'PAUSED') return 'PAUSED';
  if (raw === 'UNKNOWN') return 'UNKNOWN';
  if (input.isActive === false || raw === 'INACTIVE') return 'INACTIVE';
  if ((input.healthStatus || '').toUpperCase() === 'FAILING' || raw === 'FAILED') return 'FAILED';
  if (input.hasIntegration === false && !raw) return 'UNKNOWN';
  return 'ACTIVE';
}

export function getDefaultPlatformCapabilities(
  platform: string,
  options?: { hasIntegration?: boolean; hasEndpointUrl?: boolean }
): ProviderCapabilitiesMap {
  const key = (platform || 'unknown').trim().toLowerCase();
  const hasInteg = options?.hasIntegration ?? true;
  const hasUrl = options?.hasEndpointUrl ?? false;

  if (!hasInteg) {
    const noInteg = 'No connected Integration record linked to this workflow.';
    return {
      platform,
      adapter_mode: 'UNLINKED',
      list_workflows: { supported: false, reason: noInteg },
      fetch_executions: { supported: false, reason: noInteg },
      activate: { supported: false, reason: noInteg },
      deactivate: { supported: false, reason: noInteg },
      trigger: { supported: false, reason: noInteg },
      retry_execution: { supported: false, reason: noInteg },
      pause: { supported: false, reason: noInteg },
      resume: { supported: false, reason: noInteg },
      update_settings: { supported: false, reason: noInteg },
      manage_schedule: { supported: false, reason: noInteg },
      webhook_ingest: { supported: true, reason: 'Signed inbound telemetry webhook supported.' },
    };
  }

  if (key === 'n8n') {
    return {
      platform: 'n8n',
      adapter_mode: 'FULL_REST',
      list_workflows: { supported: true, reason: 'n8n REST v1 GET /workflows' },
      fetch_executions: { supported: true, reason: 'n8n REST v1 GET /executions' },
      activate: { supported: true, reason: 'n8n REST v1 POST /workflows/{id}/activate', requires_approval: false },
      deactivate: { supported: true, reason: 'n8n REST v1 POST /workflows/{id}/deactivate', requires_approval: true },
      trigger: { supported: true, reason: 'n8n REST v1 POST /workflows/{id}/run', requires_approval: false },
      retry_execution: { supported: true, reason: 'n8n REST v1 POST /executions/{id}/retry', requires_approval: false },
      pause: { supported: false, reason: 'n8n uses active/inactive states rather than a separate pause endpoint; use Deactivate.' },
      resume: { supported: false, reason: 'Use Activate on deactivated n8n workflows.' },
      update_settings: { supported: true, reason: 'n8n REST v1 PUT /workflows/{id} settings merge', requires_approval: true },
      manage_schedule: { supported: false, reason: 'n8n schedules live inside trigger nodes rather than a standalone schedule endpoint.' },
      webhook_ingest: { supported: true, reason: 'HMAC-signed Zevkar webhook ingestion' },
    };
  }

  if (key === 'make') {
    return {
      platform: 'Make',
      adapter_mode: 'PARTIAL_REST',
      list_workflows: { supported: true, reason: 'Make v2 GET /scenarios' },
      fetch_executions: { supported: true, reason: 'Make v2 GET /scenarios/{id}/logs' },
      activate: { supported: true, reason: 'Make v2 POST /scenarios/{id}/start', requires_approval: false },
      deactivate: { supported: true, reason: 'Make v2 POST /scenarios/{id}/stop', requires_approval: true },
      trigger: { supported: true, reason: 'Make v2 POST /scenarios/{id}/run', requires_approval: false },
      retry_execution: { supported: false, reason: 'Make API v2 runs scenarios fresh rather than replaying historical log IDs.' },
      pause: { supported: false, reason: 'Use Deactivate (stop scenario) in Make.com.' },
      resume: { supported: false, reason: 'Use Activate (start scenario) in Make.com.' },
      update_settings: { supported: false, reason: 'Scenario settings editing requires the Make.com visual editor.' },
      manage_schedule: { supported: false, reason: 'Schedule interval changes require Make v2 team-scoped payloads.' },
      webhook_ingest: { supported: true, reason: 'Signed Zevkar webhook ingestion' },
    };
  }

  if (key === 'zapier') {
    return {
      platform: 'Zapier',
      adapter_mode: 'WEBHOOK_ONLY',
      list_workflows: { supported: false, reason: 'Standard Zapier accounts do not expose REST workflow listing.' },
      fetch_executions: { supported: false, reason: 'Zapier events arrive via inbound webhooks rather than REST polling.' },
      activate: { supported: false, reason: 'Remote Zap activation requires Zapier Partner / Enterprise CLI API.' },
      deactivate: { supported: false, reason: 'Remote Zap deactivation is unavailable via standard Zapier webhooks.' },
      trigger: {
        supported: hasUrl,
        reason: hasUrl
          ? 'Triggers configured Zapier Catch Hook webhook URL.'
          : 'Configure a Zapier Catch Hook URL on the integration to trigger externally.',
        requires_approval: true,
      },
      retry_execution: { supported: false, reason: 'Replay executions inside Zapier Task History.' },
      pause: { supported: false, reason: 'Zapier does not expose a public REST pause endpoint.' },
      resume: { supported: false, reason: 'Zapier does not expose a public REST resume endpoint.' },
      update_settings: { supported: false, reason: 'Zap settings must be edited inside Zapier.' },
      manage_schedule: { supported: false, reason: 'Schedule by Zapier is unavailable via public REST API.' },
      webhook_ingest: { supported: true, reason: 'HMAC-signed inbound Zapier webhook telemetry' },
    };
  }

  const noUrlReason = 'No signed HTTP control endpoint (instanceUrl) configured on this custom worker.';
  return {
    platform,
    adapter_mode: hasUrl ? 'HTTP_CONTROL' : 'WEBHOOK_ONLY',
    list_workflows: { supported: hasUrl, reason: hasUrl ? 'GET /workflows' : noUrlReason },
    fetch_executions: { supported: hasUrl, reason: hasUrl ? 'GET /executions' : noUrlReason },
    activate: { supported: hasUrl, reason: hasUrl ? 'POST /workflows/{id}/activate' : noUrlReason, requires_approval: false },
    deactivate: { supported: hasUrl, reason: hasUrl ? 'POST /workflows/{id}/deactivate' : noUrlReason, requires_approval: true },
    trigger: { supported: hasUrl, reason: hasUrl ? 'POST /workflows/{id}/trigger' : noUrlReason, requires_approval: false },
    retry_execution: { supported: hasUrl, reason: hasUrl ? 'POST /executions/{id}/retry' : noUrlReason, requires_approval: false },
    pause: { supported: hasUrl, reason: hasUrl ? 'POST /workflows/{id}/pause' : noUrlReason, requires_approval: true },
    resume: { supported: hasUrl, reason: hasUrl ? 'POST /workflows/{id}/resume' : noUrlReason, requires_approval: false },
    update_settings: { supported: hasUrl, reason: hasUrl ? 'PATCH /workflows/{id}/settings' : noUrlReason, requires_approval: true },
    manage_schedule: { supported: hasUrl, reason: hasUrl ? 'PUT /workflows/{id}/schedule' : noUrlReason, requires_approval: true },
    webhook_ingest: { supported: true, reason: 'Signed inbound Python/FastAPI webhook ingestion' },
  };
}

export function canUserDispatchControl(role?: Role | string | null): boolean {
  const r = (role || '').toUpperCase();
  return r === 'OWNER' || r === 'ADMIN' || r === 'DEVELOPER';
}

export function canUserApproveControl(role?: Role | string | null): boolean {
  const r = (role || '').toUpperCase();
  return r === 'OWNER' || r === 'ADMIN';
}

export function doesControlActionRequireApproval(
  workflowName: string,
  actionType: ControlActionType,
  capabilities: ProviderCapabilitiesMap
): boolean {
  const capKey = ACTION_CAPABILITY_KEY[actionType];
  const cap = capabilities[capKey] as ProviderCapabilityFlag | undefined;
  return Boolean(
    isSensitiveWorkflowName(workflowName) ||
      HIGH_RISK_ACTIONS.has(actionType) ||
      cap?.requires_approval
  );
}

export function evaluateControlActionPreflight(input: {
  workflow: ControlWorkflowItem;
  actionType: ControlActionType;
  role?: Role | string | null;
  confirmed: boolean;
}): { allowed: boolean; requiresApproval: boolean; reason?: string } {
  if (!canUserDispatchControl(input.role)) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: `Role '${input.role || 'VIEWER'}' has read-only Control Center permissions.`,
    };
  }
  const capKey = ACTION_CAPABILITY_KEY[input.actionType];
  const cap = input.workflow.capabilities[capKey] as ProviderCapabilityFlag | undefined;
  if (!cap || !cap.supported) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: cap?.reason || `Action ${input.actionType} is unavailable on ${input.workflow.platform}.`,
    };
  }
  if (input.actionType === 'ACTIVATE' && input.workflow.controlStatus === 'ACTIVE' && input.workflow.isActive) {
    return { allowed: false, requiresApproval: false, reason: 'Workflow is already ACTIVE.' };
  }
  if (input.actionType === 'DEACTIVATE' && input.workflow.controlStatus === 'INACTIVE' && !input.workflow.isActive) {
    return { allowed: false, requiresApproval: false, reason: 'Workflow is already INACTIVE.' };
  }
  if (input.actionType === 'PAUSE' && input.workflow.controlStatus === 'PAUSED') {
    return { allowed: false, requiresApproval: false, reason: 'Workflow is already PAUSED.' };
  }
  if (!input.confirmed) {
    return {
      allowed: false,
      requiresApproval: doesControlActionRequireApproval(
        input.workflow.name,
        input.actionType,
        input.workflow.capabilities
      ),
      reason: 'Explicit confirmation is required before dispatching a control action.',
    };
  }
  return {
    allowed: true,
    requiresApproval: doesControlActionRequireApproval(
      input.workflow.name,
      input.actionType,
      input.workflow.capabilities
    ),
  };
}

export function buildControlWorkflowsFromState(input: {
  workflows: Workflow[];
  integrations: Integration[];
  incidents: Incident[];
}): ControlWorkflowItem[] {
  const integMap = new Map(input.integrations.map((i) => [i.id, i]));
  const incCounts = new Map<string, number>();
  for (const inc of input.incidents) {
    if (inc.status !== 'RESOLVED' && inc.status !== 'IGNORED') {
      incCounts.set(inc.workflowId, (incCounts.get(inc.workflowId) || 0) + 1);
    }
  }

  return input.workflows.map((wf) => {
    const integ = wf.integrationId ? integMap.get(wf.integrationId) : undefined;
    const caps = getDefaultPlatformCapabilities(wf.platform, {
      hasIntegration: Boolean(integ),
      hasEndpointUrl: Boolean(integ?.instanceUrl),
    });
    return {
      id: wf.id,
      name: wf.name,
      platform: wf.platform,
      clientName: wf.clientName || 'Workspace',
      integrationId: wf.integrationId,
      integrationName: integ?.name,
      integrationStatus: integ?.status || (integ ? 'CONNECTED' : 'UNLINKED'),
      externalWorkflowId: wf.externalWorkflowId,
      isActive: wf.isActive,
      controlStatus: normalizeControlStatus({
        isActive: wf.isActive,
        healthStatus: wf.healthStatus,
        hasIntegration: Boolean(integ),
      }),
      healthStatus: wf.healthStatus,
      consecutiveFailures: wf.consecutiveFailures || 0,
      avgDurationMs: wf.avgDurationMs || 0,
      lastExecutionAt: wf.lastExecutionAt,
      lastSuccessfulAt: wf.lastSuccessfulAt,
      lastFailedAt: wf.lastFailedAt,
      nextScheduledAt: null,
      scheduleSummary: wf.platform === 'n8n' ? 'Trigger node schedule' : null,
      openIncidentsCount: incCounts.get(wf.id) || 0,
      capabilities: caps,
    };
  });
}

export function filterAndSortControlWorkflows(
  items: ControlWorkflowItem[],
  opts: {
    search?: string;
    platform?: string;
    status?: string;
    sortBy?: 'last_execution' | 'failures' | 'name' | 'status';
  }
): ControlWorkflowItem[] {
  const q = (opts.search || '').trim().toLowerCase();
  const plat = (opts.platform || 'ALL').trim().toLowerCase();
  const stat = (opts.status || 'ALL').trim().toUpperCase();

  const filtered = items.filter((item) => {
    if (plat !== 'all' && item.platform.toLowerCase() !== plat) return false;
    if (stat !== 'ALL' && item.controlStatus !== stat) return false;
    if (q) {
      const hay = `${item.name} ${item.platform} ${item.clientName} ${item.externalWorkflowId}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  const sortBy = opts.sortBy || 'last_execution';
  if (sortBy === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === 'failures') {
    sorted.sort((a, b) => b.consecutiveFailures - a.consecutiveFailures || a.name.localeCompare(b.name));
  } else if (sortBy === 'status') {
    sorted.sort((a, b) => a.controlStatus.localeCompare(b.controlStatus));
  } else {
    sorted.sort((a, b) => {
      const ta = a.lastExecutionAt ? new Date(a.lastExecutionAt).getTime() : 0;
      const tb = b.lastExecutionAt ? new Date(b.lastExecutionAt).getTime() : 0;
      return tb - ta;
    });
  }
  return sorted;
}

export function groupControlWorkflows(
  items: ControlWorkflowItem[],
  groupBy: 'none' | 'platform' | 'client'
): Array<{ groupLabel: string; items: ControlWorkflowItem[] }> {
  if (groupBy === 'none') {
    return [{ groupLabel: 'All Workflows', items }];
  }
  const map = new Map<string, ControlWorkflowItem[]>();
  for (const item of items) {
    const key = groupBy === 'platform' ? String(item.platform) : item.clientName || 'Workspace';
    const arr = map.get(key) || [];
    arr.push(item);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([groupLabel, groupItems]) => ({
    groupLabel,
    items: groupItems,
  }));
}

export function buildLocalControlAssistantAnswer(input: {
  question: string;
  workflows: ControlWorkflowItem[];
  incidents: Incident[];
  executions?: Execution[];
}): ControlAssistantAnswer {
  const q = (input.question || '').toLowerCase();
  const unhealthy = input.workflows.filter(
    (w) =>
      w.controlStatus === 'FAILED' ||
      w.controlStatus === 'UNKNOWN' ||
      w.healthStatus === 'FAILING' ||
      w.healthStatus === 'DEGRADED' ||
      w.consecutiveFailures > 0
  );
  const repeated = [...input.workflows]
    .filter((w) => w.consecutiveFailures >= 2)
    .sort((a, b) => b.consecutiveFailures - a.consecutiveFailures);

  const proposals: ControlAssistantProposal[] = unhealthy.slice(0, 3).map((wf) => {
    const canRetry = wf.capabilities.retry_execution.supported;
    const actionType: ControlActionType = canRetry
      ? 'RETRY_EXECUTION'
      : wf.capabilities.deactivate.supported && wf.consecutiveFailures >= 3
      ? 'DEACTIVATE'
      : 'TRIGGER';
    const cap = wf.capabilities[ACTION_CAPABILITY_KEY[actionType]] as ProviderCapabilityFlag;
    return {
      workflowId: wf.id,
      workflowName: wf.name,
      platform: String(wf.platform),
      actionType,
      supported: Boolean(cap?.supported),
      capabilityReason: cap?.reason,
      requiresApproval: doesControlActionRequireApproval(wf.name, actionType, wf.capabilities),
      requiresConfirmation: true,
      autoExecuted: false,
      reason:
        actionType === 'RETRY_EXECUTION'
          ? `Prepare safe retry for '${wf.name}' after checking error cause.`
          : actionType === 'DEACTIVATE'
          ? `Temporarily deactivate '${wf.name}' while failure rate is investigated.`
          : `Stage verification trigger for '${wf.name}'.`,
      impactSummary:
        'Stages an unexecuted Control Action through validation & confirmation (and Admin/Owner approval if sensitive).',
    };
  });

  const openIncidents = input.incidents.filter((i) => i.status !== 'RESOLVED' && i.status !== 'IGNORED');
  let answer = `Monitoring ${input.workflows.length} workflow(s): ${unhealthy.length} unhealthy, ${openIncidents.length} active incident(s).`;

  if (q.includes('unhealthy') || q.includes('failing') || q.includes('health')) {
    answer = unhealthy.length
      ? `Found ${unhealthy.length} unhealthy workflow(s): ${unhealthy.map((w) => `${w.name} (${w.platform}: ${w.healthStatus})`).join(', ')}.`
      : `All ${input.workflows.length} monitored workflows are currently healthy.`;
  } else if (q.includes('repeat') || q.includes('recurring')) {
    answer = repeated.length
      ? `Workflows with repeated failures: ${repeated.map((w) => `${w.name} (${w.consecutiveFailures} consecutive fails)`).join(', ')}.`
      : 'No workflows currently have repeated consecutive failures (>= 2).';
  } else if (q.includes('retry') || q.includes('what happens')) {
    const target = unhealthy[0] || input.workflows[0];
    if (target) {
      const sensitive = isSensitiveWorkflowName(target.name);
      answer =
        `Retrying '${target.name}' (${target.platform}) replays the failed execution node graph. ` +
        (sensitive
          ? 'Because this automation touches billing/CRM/email side effects, Admin/Owner approval and idempotency verification are mandatory.'
          : 'Confirm upstream payload validity before authorizing retry.');
    }
  } else if (q.includes('why') || q.includes('fail') || q.includes('prevent')) {
    const top = openIncidents[0];
    if (top) {
      answer = `'${top.workflowName}' failed with [${top.errorCategory}]: ${top.errorMessage.slice(0, 200)}. Guard against recurrence with backoff, schema validation, and SLA alert rules.`;
    }
  }

  return {
    answer,
    riskNotes: [
      'AI recommendations never execute directly; every action passes Control Engine validation and explicit confirmation.',
      'Sensitive workflows require Admin/Owner approval before provider dispatch.',
    ],
    preventiveRecommendations: [
      'Review consecutive failure thresholds in SLA & Alert Rules.',
      'Verify downstream webhook idempotency before replaying failed runs.',
    ],
    proposedActions: proposals,
    unhealthyCount: unhealthy.length,
    repeatedFailuresCount: repeated.length,
    isAiGenerated: false,
    modelUsed: 'deterministic-control-advisor-v1',
  };
}

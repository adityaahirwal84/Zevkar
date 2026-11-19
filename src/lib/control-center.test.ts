import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLocalControlAssistantAnswer,
  canUserApproveControl,
  canUserDispatchControl,
  evaluateControlActionPreflight,
  filterAndSortControlWorkflows,
  getDefaultPlatformCapabilities,
  groupControlWorkflows,
  normalizeControlStatus,
  type ControlWorkflowItem,
} from './control-center';

function makeWorkflow(overrides: Partial<ControlWorkflowItem> = {}): ControlWorkflowItem {
  const platform = overrides.platform || 'n8n';
  return {
    id: overrides.id || 'wf_1',
    name: overrides.name || 'Order Sync Pipeline',
    platform,
    clientName: overrides.clientName || 'Acme Retail',
    integrationId: 'int_1',
    integrationName: 'Prod n8n',
    integrationStatus: 'CONNECTED',
    externalWorkflowId: 'ext_1',
    isActive: true,
    controlStatus: 'ACTIVE',
    healthStatus: 'HEALTHY',
    consecutiveFailures: 0,
    avgDurationMs: 1200,
    lastExecutionAt: '2026-11-19T10:00:00Z',
    openIncidentsCount: 0,
    capabilities:
      overrides.capabilities ||
      getDefaultPlatformCapabilities(String(platform), { hasIntegration: true, hasEndpointUrl: false }),
    ...overrides,
  };
}

test('provider capability defaults honestly restrict unsupported actions', () => {
  const n8nCaps = getDefaultPlatformCapabilities('n8n', { hasIntegration: true });
  assert.equal(n8nCaps.activate.supported, true);
  assert.equal(n8nCaps.retry_execution.supported, true);
  assert.equal(n8nCaps.pause.supported, false);

  const zapCaps = getDefaultPlatformCapabilities('Zapier', { hasIntegration: true, hasEndpointUrl: false });
  assert.equal(zapCaps.activate.supported, false);
  assert.equal(zapCaps.trigger.supported, false);
  assert.equal(zapCaps.webhook_ingest.supported, true);

  const unlinkedCaps = getDefaultPlatformCapabilities('n8n', { hasIntegration: false });
  assert.equal(unlinkedCaps.activate.supported, false);
  assert.equal(unlinkedCaps.trigger.supported, false);
});

test('workflow control status normalization maps active, inactive, paused, and failed consistently', () => {
  assert.equal(normalizeControlStatus({ isActive: false, healthStatus: 'HEALTHY' }), 'INACTIVE');
  assert.equal(normalizeControlStatus({ isActive: true, healthStatus: 'FAILING' }), 'FAILED');
  assert.equal(normalizeControlStatus({ isActive: true, controlStatus: 'PAUSED' }), 'PAUSED');
  assert.equal(normalizeControlStatus({ isActive: true, healthStatus: 'HEALTHY', hasIntegration: false }), 'UNKNOWN');
});

test('preflight enforces RBAC, capability gating, explicit confirmation, and sensitive approvals', () => {
  const billingWf = makeWorkflow({ name: 'Stripe Invoice Billing Sync' });

  // Viewer cannot dispatch
  const viewerCheck = evaluateControlActionPreflight({
    workflow: billingWf,
    actionType: 'TRIGGER',
    role: 'VIEWER',
    confirmed: true,
  });
  assert.equal(viewerCheck.allowed, false);
  assert.equal(canUserDispatchControl('VIEWER'), false);

  // Unsupported action blocked
  const pauseCheck = evaluateControlActionPreflight({
    workflow: billingWf,
    actionType: 'PAUSE',
    role: 'OWNER',
    confirmed: true,
  });
  assert.equal(pauseCheck.allowed, false);
  assert.match(pauseCheck.reason || '', /pause/i);

  // Missing confirmation blocked
  const unconfirmed = evaluateControlActionPreflight({
    workflow: billingWf,
    actionType: 'TRIGGER',
    role: 'ADMIN',
    confirmed: false,
  });
  assert.equal(unconfirmed.allowed, false);
  assert.equal(unconfirmed.requiresApproval, true);

  // Confirmed action on financial workflow requires Admin/Owner approval
  const confirmed = evaluateControlActionPreflight({
    workflow: billingWf,
    actionType: 'TRIGGER',
    role: 'ADMIN',
    confirmed: true,
  });
  assert.equal(confirmed.allowed, true);
  assert.equal(confirmed.requiresApproval, true);
  assert.equal(canUserApproveControl('ADMIN'), true);
  assert.equal(canUserApproveControl('VIEWER'), false);
});

test('filtering, sorting, grouping, and deterministic AI assistant never auto-execute', () => {
  const wf1 = makeWorkflow({
    id: 'wf_1',
    name: 'Stripe Payment Retry',
    platform: 'n8n',
    controlStatus: 'FAILED',
    healthStatus: 'FAILING',
    consecutiveFailures: 4,
    lastExecutionAt: '2026-11-19T09:00:00Z',
  });
  const wf2 = makeWorkflow({
    id: 'wf_2',
    name: 'CRM Lead Sync',
    platform: 'Make',
    controlStatus: 'ACTIVE',
    healthStatus: 'HEALTHY',
    consecutiveFailures: 0,
    lastExecutionAt: '2026-11-19T11:00:00Z',
  });

  const failedOnly = filterAndSortControlWorkflows([wf1, wf2], { status: 'FAILED', sortBy: 'failures' });
  assert.equal(failedOnly.length, 1);
  assert.equal(failedOnly[0].id, 'wf_1');

  const grouped = groupControlWorkflows([wf1, wf2], 'platform');
  assert.equal(grouped.length, 2);

  const assistantRes = buildLocalControlAssistantAnswer({
    question: 'Which workflows are currently unhealthy?',
    workflows: [wf1, wf2],
    incidents: [],
  });
  assert.equal(assistantRes.unhealthyCount, 1);
  assert.ok(assistantRes.proposedActions.length >= 1);
  assert.equal(assistantRes.proposedActions[0].autoExecuted, false);
  assert.equal(assistantRes.proposedActions[0].requiresConfirmation, true);
});

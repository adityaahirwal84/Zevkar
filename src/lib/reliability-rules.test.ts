import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSlaCompliance,
  createDefaultSlaPolicy,
  evaluateReliabilityRules,
  isRestrictedNetworkTarget,
  maskWebhookTarget,
  severityMeetsMinimum,
  validateAlertChannelInput,
} from './reliability-rules';
import type { Execution, Incident, ReliabilityRule, Workflow } from '../types';

const nowMs = Date.parse('2026-11-18T18:00:00.000Z');

const sampleWorkflows: Workflow[] = [
  {
    id: 'wf_1',
    agencyId: 'ag_1',
    clientId: 'cli_1',
    clientName: 'Northstar',
    integrationId: 'int_1',
    platform: 'n8n',
    externalWorkflowId: 'n8n-101',
    name: 'Stripe Invoice Sync',
    isActive: true,
    healthStatus: 'FAILING',
    consecutiveFailures: 4,
    avgDurationMs: 1200,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'wf_2',
    agencyId: 'ag_1',
    clientId: 'cli_1',
    clientName: 'Northstar',
    integrationId: 'int_1',
    platform: 'n8n',
    externalWorkflowId: 'n8n-102',
    name: 'CRM Lead Enrichment',
    isActive: true,
    healthStatus: 'HEALTHY',
    consecutiveFailures: 0,
    avgDurationMs: 850,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
];

const sampleExecutions: Execution[] = [
  {
    id: 'ex_1',
    workflowId: 'wf_1',
    workflowName: 'Stripe Invoice Sync',
    clientName: 'Northstar',
    platform: 'n8n',
    status: 'FAILED',
    startedAt: '2026-11-18T17:45:00.000Z',
    durationMs: 1500,
    retryCount: 1,
  },
  {
    id: 'ex_2',
    workflowId: 'wf_2',
    workflowName: 'CRM Lead Enrichment',
    clientName: 'Northstar',
    platform: 'n8n',
    status: 'SUCCESS',
    startedAt: '2026-11-18T17:50:00.000Z',
    durationMs: 650,
    retryCount: 0,
  },
];

const sampleIncidents: Incident[] = [
  {
    id: 'inc_1',
    agencyId: 'ag_1',
    clientId: 'cli_1',
    clientName: 'Northstar',
    workflowId: 'wf_1',
    workflowName: 'Stripe Invoice Sync',
    platform: 'n8n',
    executionId: 'ex_1',
    errorCategory: 'AUTH_FAILURE',
    errorMessage: '401 Unauthorized',
    severity: 'CRITICAL',
    status: 'OPEN',
    firstDetectedAt: '2026-11-18T17:15:00.000Z',
    lastDetectedAt: '2026-11-18T17:45:00.000Z',
    occurrenceCount: 4,
    recoveryAttempts: [],
  },
];

test('validateAlertChannelInput enforces proper URLs and email addresses', () => {
  assert.equal(
    validateAlertChannelInput({
      name: 'Ops Slack',
      channelType: 'SLACK',
      targetUrl: 'https://hooks.slack.com/services/T000/B000/SECRET1234',
    }).valid,
    true
  );
  assert.equal(
    validateAlertChannelInput({
      name: 'Bad Hook',
      channelType: 'CUSTOM_WEBHOOK',
      targetUrl: 'ftp://internal.host/hook',
    }).valid,
    false
  );
  assert.equal(
    validateAlertChannelInput({
      name: 'Ops Digest',
      channelType: 'EMAIL_DIGEST',
      targetUrl: 'oncall@northstar.io',
    }).valid,
    true
  );
  assert.equal(
    validateAlertChannelInput({
      name: 'Ops Digest',
      channelType: 'EMAIL_DIGEST',
      targetUrl: 'not-an-email',
    }).valid,
    false
  );
});

test('maskWebhookTarget and SSRF checks protect sensitive URLs', () => {
  const masked = maskWebhookTarget('SLACK', 'https://hooks.slack.com/services/T00/B00/XYZ1234');
  assert.ok(masked.startsWith('https://hooks.slack.com/••••'));
  assert.ok(!masked.includes('SECRET'));
  assert.ok(!masked.includes('/services/'));

  const maskedEmail = maskWebhookTarget('EMAIL_DIGEST', 'oncall@zevkar.ai');
  assert.equal(maskedEmail, 'on••••@zevkar.ai');

  assert.equal(isRestrictedNetworkTarget('http://127.0.0.1:8080/hook'), true);
  assert.equal(isRestrictedNetworkTarget('http://169.254.169.254/latest/meta-data'), true);
  assert.equal(isRestrictedNetworkTarget('https://hooks.slack.com/services/T1/B1/abc'), false);
});

test('computeSlaCompliance accurately reports breaching state and error budget on failing workspace', () => {
  const policy = createDefaultSlaPolicy('ag_1');
  const report = computeSlaCompliance(
    policy,
    {
      workflows: sampleWorkflows,
      executions: sampleExecutions,
      incidents: sampleIncidents,
      recoveryRequests: [],
    },
    nowMs
  );

  assert.equal(report.currentSuccessRatePercent, 50);
  assert.equal(report.status, 'BREACHING');
  assert.equal(report.breachingWorkflows.length, 1);
  assert.equal(report.breachingWorkflows[0].workflowId, 'wf_1');
  assert.equal(report.errorBudgetRemainingPercent, 0);

  const cleanReport = computeSlaCompliance(
    policy,
    { workflows: [], executions: [], incidents: [], recoveryRequests: [] },
    nowMs
  );
  assert.equal(cleanReport.currentSuccessRatePercent, 100);
  assert.equal(cleanReport.status, 'COMPLIANT');
  assert.equal(cleanReport.errorBudgetRemainingPercent, 100);
});

test('evaluateReliabilityRules triggers matching rules and honors cooldown periods', () => {
  const policy = createDefaultSlaPolicy('ag_1');
  const slaReport = computeSlaCompliance(
    policy,
    {
      workflows: sampleWorkflows,
      executions: sampleExecutions,
      incidents: sampleIncidents,
    },
    nowMs
  );

  const rules: ReliabilityRule[] = [
    {
      id: 'rule_1',
      agencyId: 'ag_1',
      name: 'Consecutive Failure Guardrail',
      conditionType: 'CONSECUTIVE_FAILURES',
      thresholdValue: 3,
      severity: 'HIGH',
      actionType: 'OPEN_RECOVERY_REQUEST',
      targetChannelIds: ['ch_1'],
      cooldownMinutes: 15,
      isEnabled: true,
      triggerCount: 0,
      createdAt: '2026-11-18T12:00:00.000Z',
      updatedAt: '2026-11-18T12:00:00.000Z',
    },
    {
      id: 'rule_2',
      agencyId: 'ag_1',
      name: 'Recent Cooldown Rule',
      conditionType: 'SLA_BREACH',
      thresholdValue: 99,
      severity: 'CRITICAL',
      actionType: 'NOTIFY_CHANNELS',
      targetChannelIds: ['ch_1'],
      cooldownMinutes: 30,
      isEnabled: true,
      lastTriggeredAt: '2026-11-18T17:50:00.000Z',
      triggerCount: 1,
      createdAt: '2026-11-18T12:00:00.000Z',
      updatedAt: '2026-11-18T17:50:00.000Z',
    },
  ];

  const triggered = evaluateReliabilityRules(
    rules,
    {
      workflows: sampleWorkflows,
      executions: sampleExecutions,
      incidents: sampleIncidents,
      slaReport,
    },
    nowMs,
    false
  );

  assert.equal(triggered.length, 1);
  assert.equal(triggered[0].rule.id, 'rule_1');
  assert.equal(triggered[0].shouldOpenRecoveryRequest, true);
  assert.deepEqual(triggered[0].matchedWorkflowIds, ['wf_1']);
  assert.deepEqual(triggered[0].matchedIncidentIds, ['inc_1']);

  assert.equal(severityMeetsMinimum('CRITICAL', 'HIGH'), true);
  assert.equal(severityMeetsMinimum('MEDIUM', 'HIGH'), false);
});

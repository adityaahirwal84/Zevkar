import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessRecoveryRisk,
  buildDeterministicRecommendation,
  calculateBackoffDelaySeconds,
  computeRecoveryMetrics,
  createDefaultRecoveryPolicy,
  generateRecoveryIdempotencyKey,
  validateRecoveryExecutionPreconditions,
} from './recovery-engine';
import type { RecoveryRequest } from '../types';

test('calculateBackoffDelaySeconds computes exponential, fixed, and immediate delays', () => {
  assert.equal(
    calculateBackoffDelaySeconds({
      strategy: 'RETRY_EXECUTION',
      attemptNumber: 2,
      baseDelaySeconds: 60,
      useExponentialBackoff: true,
    }),
    0
  );
  assert.equal(
    calculateBackoffDelaySeconds({
      strategy: 'RETRY_AFTER_DELAY',
      attemptNumber: 2,
      baseDelaySeconds: 45,
      useExponentialBackoff: true,
    }),
    45
  );
  assert.equal(
    calculateBackoffDelaySeconds({
      strategy: 'RETRY_EXPONENTIAL_BACKOFF',
      attemptNumber: 1,
      baseDelaySeconds: 30,
      useExponentialBackoff: true,
    }),
    30
  );
  assert.equal(
    calculateBackoffDelaySeconds({
      strategy: 'RETRY_EXPONENTIAL_BACKOFF',
      attemptNumber: 3,
      baseDelaySeconds: 30,
      useExponentialBackoff: true,
    }),
    120
  );
});

test('buildDeterministicRecommendation identifies non-recoverable schema mismatches and high-risk auth failures', () => {
  const schemaRec = buildDeterministicRecommendation('SCHEMA_MISMATCH', 'Lead Sync', 'Missing required field');
  assert.equal(schemaRec.isRecoverable, false);
  assert.equal(schemaRec.suggestedStrategy, 'MARK_NON_RECOVERABLE');
  assert.equal(schemaRec.maxRecommendedRetries, 0);

  const authRec = buildDeterministicRecommendation('AUTH_FAILURE', 'Stripe Settlement', '401 Unauthorized');
  assert.equal(authRec.isRecoverable, true);
  assert.equal(authRec.suggestedStrategy, 'MANUAL_RECOVERY');
  assert.equal(authRec.expectedRiskLevel, 'HIGH');
});

test('assessRecoveryRisk enforces human approval for financial workflows even when policy autoRecoveryEnabled is true', () => {
  const policy = {
    ...createDefaultRecoveryPolicy('ag_1'),
    approvalRequired: false,
    autoRecoveryEnabled: true,
  };
  const risk = assessRecoveryRisk({
    incident: { severity: 'LOW', errorCategory: 'RATE_LIMIT', workflowName: 'Stripe Invoice Sync' },
    workflow: { name: 'Stripe Invoice Sync' },
    diagnosis: { isRecoverable: true, expectedRiskLevel: 'LOW', requiresHumanApproval: false },
    policy,
    strategy: 'RETRY_EXECUTION',
  });
  assert.equal(risk.isSensitiveWorkflow, true);
  assert.equal(risk.requiresApproval, true);
  assert.equal(risk.riskLevel, 'HIGH');
});

test('validateRecoveryExecutionPreconditions enforces approval, retry limit, cooldown, and concurrency lock', () => {
  const policy = createDefaultRecoveryPolicy('ag_1');
  const baseReq: RecoveryRequest = {
    id: 'rreq_1',
    agencyId: 'ag_1',
    incidentId: 'inc_1',
    workflowId: 'wf_1',
    strategy: 'RETRY_EXECUTION',
    status: 'PENDING_APPROVAL',
    isRecoverable: true,
    riskLevel: 'MEDIUM',
    maxRetryAttempts: 3,
    retryCount: 0,
    delaySeconds: 0,
    requiresApproval: true,
    idempotencyKey: 'k1',
    resultVerified: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Unapproved
  const res1 = validateRecoveryExecutionPreconditions({
    request: baseReq,
    policy,
    hasApprovedGate: false,
    nowMs: 100000,
  });
  assert.equal(res1.ok, false);
  if (!res1.ok) assert.equal(res1.statusCode, 403);

  // Cooldown active
  const resCooldown = validateRecoveryExecutionPreconditions({
    request: { ...baseReq, status: 'FAILED', cooldownUntil: new Date(200000).toISOString() },
    policy,
    hasApprovedGate: true,
    nowMs: 150000,
  });
  assert.equal(resCooldown.ok, false);
  if (!resCooldown.ok) assert.equal(resCooldown.statusCode, 429);

  // Max retries exceeded
  const resLimit = validateRecoveryExecutionPreconditions({
    request: { ...baseReq, status: 'FAILED', retryCount: 3 },
    policy,
    hasApprovedGate: true,
    nowMs: 250000,
  });
  assert.equal(resLimit.ok, false);
  if (!resLimit.ok) assert.equal(resLimit.statusCode, 409);

  // Valid
  const resOk = validateRecoveryExecutionPreconditions({
    request: { ...baseReq, status: 'APPROVED' },
    policy,
    hasApprovedGate: true,
    nowMs: 250000,
  });
  assert.equal(resOk.ok, true);
});

test('generateRecoveryIdempotencyKey & computeRecoveryMetrics produce deterministic outputs', () => {
  const k1 = generateRecoveryIdempotencyKey('rreq_1', 1);
  const k2 = generateRecoveryIdempotencyKey('rreq_1', 1);
  const k3 = generateRecoveryIdempotencyKey('rreq_1', 2);
  assert.equal(k1, k2);
  assert.notEqual(k1, k3);
  assert.equal(k1.length, 64);

  const metrics = computeRecoveryMetrics([
    { status: 'SUCCEEDED' } as RecoveryRequest,
    { status: 'SUCCEEDED' } as RecoveryRequest,
    { status: 'FAILED' } as RecoveryRequest,
    { status: 'PENDING_APPROVAL' } as RecoveryRequest,
    { status: 'CANCELLED' } as RecoveryRequest,
  ]);
  assert.equal(metrics.totalRequests, 5);
  assert.equal(metrics.pendingApprovals, 1);
  assert.equal(metrics.successfulRecoveries, 2);
  assert.equal(metrics.failedRecoveries, 1);
  assert.equal(metrics.cancelledRecoveries, 1);
  assert.equal(metrics.recoverySuccessRate, 66.7);
});

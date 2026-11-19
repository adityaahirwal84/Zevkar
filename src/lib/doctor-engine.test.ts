import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyError, calculateHealthScore, evaluateRecoverySafety, generateIdempotencyKey } from './doctor-engine';

test('classifyError detects auth failures and sets HIGH severity with approval requirement', () => {
  const result = classifyError('Invalid API Key provided in HTTP header Authorization', 401);
  assert.equal(result.category, 'AUTH_FAILURE');
  assert.equal(result.severity, 'HIGH');
  assert.equal(result.requiresApproval, true);
});

test('classifyError detects rate limit 429 and recommends backoff', () => {
  const result = classifyError('Too many requests, quota exceeded for current minute', 429);
  assert.equal(result.category, 'RATE_LIMIT');
  assert.equal(result.severity, 'MEDIUM');
  assert.equal(result.requiresApproval, false);
});

test('classifyError detects database connection errors with CRITICAL severity', () => {
  const result = classifyError('Postgres connection pool exhausted or deadlock on table leads', 500);
  assert.equal(result.category, 'DATABASE_FAILURE');
  assert.equal(result.severity, 'CRITICAL');
  assert.equal(result.requiresApproval, true);
});

test('calculateHealthScore returns 100 for zero executions and computes correctly for mixed executions', () => {
  assert.equal(calculateHealthScore({ totalExecutions: 0, failedExecutions: 0, consecutiveFailures: 0, criticalIncidents: 0 }), 100);

  // 100 total, 5 failed, no consecutive or critical
  const score = calculateHealthScore({ totalExecutions: 100, failedExecutions: 5, consecutiveFailures: 0, criticalIncidents: 0 });
  assert.equal(score, 95);

  // Compounded with 2 consecutive failures and 1 critical incident
  const penalizedScore = calculateHealthScore({ totalExecutions: 100, failedExecutions: 5, consecutiveFailures: 2, criticalIncidents: 1 });
  // 95 - (2*7=14) - (1*15=15) = 66
  assert.equal(penalizedScore, 66);
});

test('evaluateRecoverySafety blocks customer-facing or financial workflows from blind retry', () => {
  const check = evaluateRecoverySafety({
    workflowName: 'Stripe Invoice Settlement to QuickBooks',
    errorCategory: 'TIMEOUT',
    consecutiveFailures: 1,
    isFinancialOrCustomerFacing: true,
  });

  assert.equal(check.isSafeToAutoRetry, false);
  assert.match(check.riskReason ?? '', /transactional/);
});

test('evaluateRecoverySafety allows safe auto-retry for transient rate limits with low consecutive failures', () => {
  const check = evaluateRecoverySafety({
    workflowName: 'Internal Slack Sync',
    errorCategory: 'RATE_LIMIT',
    consecutiveFailures: 1,
    isFinancialOrCustomerFacing: false,
  });

  assert.equal(check.isSafeToAutoRetry, true);
  assert.equal(check.riskReason, undefined);
});

test('generateIdempotencyKey generates consistent keys', () => {
  const key = generateIdempotencyKey('wf_123', 'exec_456', 'retry');
  assert.equal(key, 'recov_wf_123_exec_456_retry');
});

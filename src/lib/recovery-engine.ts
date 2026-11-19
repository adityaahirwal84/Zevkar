import crypto from 'crypto';
import type {
  AIDiagnosis,
  ErrorCategory,
  Incident,
  RecoveryMetrics,
  RecoveryPolicy,
  RecoveryRequest,
  RecoveryStrategy,
  Severity,
  Workflow,
} from '../types';

export const SUPPORTED_RECOVERY_STRATEGIES: RecoveryStrategy[] = [
  'RETRY_EXECUTION',
  'RETRY_AFTER_DELAY',
  'RETRY_EXPONENTIAL_BACKOFF',
  'MANUAL_RECOVERY',
  'MARK_NON_RECOVERABLE',
  'ESCALATE_HUMAN',
];

export const RETRY_STRATEGIES: RecoveryStrategy[] = [
  'RETRY_EXECUTION',
  'RETRY_AFTER_DELAY',
  'RETRY_EXPONENTIAL_BACKOFF',
];

export const ACTIVE_RECOVERY_STATUSES = new Set<string>([
  'PENDING_APPROVAL',
  'APPROVED',
  'SCHEDULED',
  'EXECUTING',
  'VERIFYING',
]);

export function createDefaultRecoveryPolicy(agencyId: string): RecoveryPolicy {
  return {
    id: `pol_${agencyId}`,
    agencyId,
    maxRetryAttempts: 3,
    retryDelaySeconds: 60,
    useExponentialBackoff: true,
    cooldownSeconds: 120,
    approvalRequired: true,
    autoRecoveryEnabled: false,
    allowedStrategies: [...SUPPORTED_RECOVERY_STRATEGIES],
    updatedAt: new Date().toISOString(),
  };
}

export function isSensitiveWorkflowName(workflowName: string): boolean {
  const lower = (workflowName || '').toLowerCase();
  const tokens = [
    'stripe',
    'invoice',
    'payment',
    'payout',
    'ledger',
    'billing',
    'refund',
    'hubspot',
    'crm',
    'patient',
    'emr',
    'auth',
    'delete',
    'postgres',
    'database',
  ];
  return tokens.some((t) => lower.includes(t));
}

export function generateRequestIdempotencyKey(
  incidentId: string,
  strategy: RecoveryStrategy,
  occurrenceCount: number
): string {
  return crypto
    .createHash('sha256')
    .update(`req:${incidentId}:${strategy}:${occurrenceCount}`)
    .digest('hex');
}

export function generateRecoveryIdempotencyKey(recoveryRequestId: string, attemptNumber: number): string {
  return crypto
    .createHash('sha256')
    .update(`attempt:${recoveryRequestId}:${attemptNumber}`)
    .digest('hex');
}

export function calculateBackoffDelaySeconds(params: {
  strategy: RecoveryStrategy;
  attemptNumber: number;
  baseDelaySeconds: number;
  useExponentialBackoff: boolean;
  customDelaySeconds?: number;
}): number {
  const base = Math.max(0, Math.floor(params.customDelaySeconds ?? params.baseDelaySeconds));
  if (params.strategy === 'RETRY_EXECUTION') return 0;
  if (params.strategy === 'RETRY_AFTER_DELAY') return base;
  if (params.strategy === 'RETRY_EXPONENTIAL_BACKOFF') {
    const effectiveBase = base > 0 ? base : 30;
    if (!params.useExponentialBackoff) return effectiveBase;
    const exponent = Math.max(0, Math.floor(params.attemptNumber) - 1);
    return Math.min(3600, effectiveBase * 2 ** exponent);
  }
  return 0;
}

export function buildDeterministicRecommendation(
  errorCategory: ErrorCategory,
  workflowName: string,
  _errorMessage: string
): {
  isRecoverable: boolean;
  suggestedStrategy: RecoveryStrategy;
  recommendationReason: string;
  expectedRiskLevel: Severity;
  requiredUserAction: string;
  maxRecommendedRetries: number;
} {
  const sensitive = isSensitiveWorkflowName(workflowName);

  if (errorCategory === 'AUTH_FAILURE') {
    return {
      isRecoverable: true,
      suggestedStrategy: 'MANUAL_RECOVERY',
      recommendationReason:
        'Authentication credentials were rejected. Blind automated retries will fail until secrets or OAuth tokens are rotated.',
      expectedRiskLevel: 'HIGH',
      requiredUserAction:
        'Rotate API key or refresh OAuth token in integration vault, then approve manual retry.',
      maxRecommendedRetries: 1,
    };
  }
  if (errorCategory === 'RATE_LIMIT') {
    return {
      isRecoverable: true,
      suggestedStrategy: 'RETRY_EXPONENTIAL_BACKOFF',
      recommendationReason:
        'Upstream HTTP 429 throttling is transient and recovers safely after exponential backoff cooldown.',
      expectedRiskLevel: sensitive ? 'HIGH' : 'MEDIUM',
      requiredUserAction:
        'Verify downstream endpoint idempotency before approving exponential backoff retry.',
      maxRecommendedRetries: 3,
    };
  }
  if (errorCategory === 'SCHEMA_MISMATCH' || errorCategory === 'INVALID_PAYLOAD') {
    return {
      isRecoverable: false,
      suggestedStrategy: 'MARK_NON_RECOVERABLE',
      recommendationReason:
        'Payload validation or schema structure failed; replaying the exact same payload will fail identically.',
      expectedRiskLevel: 'MEDIUM',
      requiredUserAction:
        'Repair upstream field mapping and mark this execution non-recoverable.',
      maxRecommendedRetries: 0,
    };
  }
  if (errorCategory === 'DATABASE_FAILURE') {
    return {
      isRecoverable: true,
      suggestedStrategy: sensitive ? 'ESCALATE_HUMAN' : 'MANUAL_RECOVERY',
      recommendationReason:
        'Database lock or constraint failure requires inspection to avoid corrupting or duplicating persistent records.',
      expectedRiskLevel: 'CRITICAL',
      requiredUserAction:
        'Check database transaction state and serialize concurrent writes before approving recovery.',
      maxRecommendedRetries: 1,
    };
  }
  if (errorCategory === 'TIMEOUT' || errorCategory === 'NETWORK_FAILURE') {
    return {
      isRecoverable: true,
      suggestedStrategy: 'RETRY_AFTER_DELAY',
      recommendationReason:
        'Transient network or gateway timeout detected. Delayed retry after cooldown is suitable once upstream availability returns.',
      expectedRiskLevel: sensitive ? 'HIGH' : 'MEDIUM',
      requiredUserAction:
        'Confirm remote request did not commit partial state prior to approving delayed retry.',
      maxRecommendedRetries: 2,
    };
  }
  return {
    isRecoverable: true,
    suggestedStrategy: sensitive ? 'ESCALATE_HUMAN' : 'MANUAL_RECOVERY',
    recommendationReason: `Failure category ${errorCategory} requires operator inspection before external replay.`,
    expectedRiskLevel: sensitive ? 'CRITICAL' : 'HIGH',
    requiredUserAction: 'Inspect failed execution node payload and confirm safe to re-run.',
    maxRecommendedRetries: 1,
  };
}

export function assessRecoveryRisk(params: {
  incident: Pick<Incident, 'severity' | 'errorCategory' | 'workflowName'>;
  workflow?: Pick<Workflow, 'name'>;
  diagnosis?: Pick<AIDiagnosis, 'isRecoverable' | 'expectedRiskLevel' | 'requiresHumanApproval'>;
  policy: RecoveryPolicy;
  strategy: RecoveryStrategy;
}): {
  riskLevel: Severity;
  isRecoverable: boolean;
  requiresApproval: boolean;
  isSensitiveWorkflow: boolean;
  factors: string[];
} {
  const wfName = params.workflow?.name || params.incident.workflowName || '';
  const sensitive = isSensitiveWorkflowName(wfName);
  const sev = (params.incident.severity || 'MEDIUM') as Severity;
  const cat = params.incident.errorCategory;

  const diagRecoverable = params.diagnosis?.isRecoverable ?? true;
  const diagRisk = params.diagnosis?.expectedRiskLevel ?? 'HIGH';
  const diagApproval = params.diagnosis?.requiresHumanApproval ?? true;

  const factors: string[] = [];
  if (sensitive) factors.push('Workflow handles financial, CRM, customer, auth, or database mutations.');
  if (cat === 'AUTH_FAILURE' || cat === 'DATABASE_FAILURE') {
    factors.push(`Error category ${cat} requires verified state or credential rotation.`);
  }
  if (sev === 'HIGH' || sev === 'CRITICAL') {
    factors.push(`Incident severity is ${sev}.`);
  }
  if (!diagRecoverable) {
    factors.push('Diagnosis marked this failure non-recoverable.');
  }
  if (params.policy.approvalRequired) {
    factors.push('Organization recovery policy requires human approval.');
  }
  if (!params.policy.autoRecoveryEnabled) {
    factors.push('Organization auto-recovery is disabled.');
  }

  const rank: Record<Severity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  let computedRisk: Severity = 'LOW';
  for (const cand of [sev, diagRisk]) {
    if ((rank[cand] || 0) > rank[computedRisk]) computedRisk = cand;
  }
  if (sensitive || cat === 'DATABASE_FAILURE') {
    computedRisk = computedRisk === 'CRITICAL' ? 'CRITICAL' : 'HIGH';
  }
  if (cat === 'AUTH_FAILURE' && rank[computedRisk] < 3) {
    computedRisk = 'HIGH';
  }

  const isRecoverable = Boolean(diagRecoverable && params.strategy !== 'MARK_NON_RECOVERABLE');
  const requiresApproval = Boolean(
    params.policy.approvalRequired ||
      !params.policy.autoRecoveryEnabled ||
      sensitive ||
      diagApproval ||
      cat === 'AUTH_FAILURE' ||
      cat === 'DATABASE_FAILURE' ||
      computedRisk === 'HIGH' ||
      computedRisk === 'CRITICAL' ||
      params.strategy === 'MANUAL_RECOVERY' ||
      params.strategy === 'ESCALATE_HUMAN'
  );

  return {
    riskLevel: computedRisk,
    isRecoverable,
    requiresApproval,
    isSensitiveWorkflow: sensitive,
    factors,
  };
}

export function validateRecoveryExecutionPreconditions(params: {
  request: RecoveryRequest;
  policy: RecoveryPolicy;
  hasApprovedGate: boolean;
  nowMs?: number;
}): { ok: true } | { ok: false; statusCode: number; error: string } {
  const { request, policy, hasApprovedGate } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (['CANCELLED', 'REJECTED', 'SUCCEEDED', 'NON_RECOVERABLE'].includes(request.status)) {
    return {
      ok: false,
      statusCode: 409,
      error: `Recovery request cannot execute from terminal status '${request.status}'.`,
    };
  }
  if (request.status === 'EXECUTING' || request.status === 'VERIFYING') {
    return {
      ok: false,
      statusCode: 409,
      error: 'Recovery execution is already in progress for this request.',
    };
  }
  if (!request.isRecoverable || request.strategy === 'MARK_NON_RECOVERABLE') {
    return {
      ok: false,
      statusCode: 400,
      error: 'Incident is marked non-recoverable and cannot be retried.',
    };
  }
  if (request.requiresApproval && !hasApprovedGate) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Human approval is required before executing this recovery request.',
    };
  }
  const effectiveMax = Math.min(request.maxRetryAttempts, policy.maxRetryAttempts);
  if (request.retryCount >= effectiveMax) {
    return {
      ok: false,
      statusCode: 409,
      error: `Maximum retry attempts reached (${request.retryCount}/${effectiveMax}).`,
    };
  }
  if (request.cooldownUntil) {
    const cdMs = Date.parse(request.cooldownUntil);
    if (!Number.isNaN(cdMs) && cdMs > nowMs) {
      const remaining = Math.ceil((cdMs - nowMs) / 1000);
      return {
        ok: false,
        statusCode: 429,
        error: `Recovery cooldown active. Retry allowed in ${remaining}s.`,
      };
    }
  }
  return { ok: true };
}

export function computeRecoveryMetrics(requests: RecoveryRequest[]): RecoveryMetrics {
  const totalRequests = requests.length;
  const pendingApprovals = requests.filter((r) => r.status === 'PENDING_APPROVAL').length;
  const inProgressRecoveries = requests.filter((r) =>
    ['APPROVED', 'SCHEDULED', 'EXECUTING', 'VERIFYING'].includes(r.status)
  ).length;
  const successfulRecoveries = requests.filter((r) => r.status === 'SUCCEEDED').length;
  const failedRecoveries = requests.filter((r) => r.status === 'FAILED').length;
  const cancelledRecoveries = requests.filter((r) => r.status === 'CANCELLED').length;
  const rejectedRecoveries = requests.filter((r) => r.status === 'REJECTED').length;
  const nonRecoverableCount = requests.filter((r) => r.status === 'NON_RECOVERABLE').length;

  const completed = successfulRecoveries + failedRecoveries;
  const recoverySuccessRate =
    completed > 0 ? Math.round((successfulRecoveries / completed) * 1000) / 10 : 0;

  return {
    totalRequests,
    pendingApprovals,
    inProgressRecoveries,
    successfulRecoveries,
    failedRecoveries,
    cancelledRecoveries,
    rejectedRecoveries,
    nonRecoverableCount,
    recoverySuccessRate,
  };
}

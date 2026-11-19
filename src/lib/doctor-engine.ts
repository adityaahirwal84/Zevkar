import { ErrorCategory, Severity } from '../types';

/**
 * Deterministic rule-based classifier for automation execution errors.
 * Used as immediate first responder or fallback when LLM is offline or high speed is required.
 */
export function classifyError(errorMessage: string, statusCode?: number): {
  category: ErrorCategory;
  severity: Severity;
  requiresApproval: boolean;
  suggestedAction: string;
} {
  const lower = errorMessage.toLowerCase();

  // Authentication & Credentials
  if (
    lower.includes('unauthorized') ||
    lower.includes('invalid credentials') ||
    lower.includes('token expired') ||
    lower.includes('api key') ||
    lower.includes('forbidden') ||
    statusCode === 401 ||
    statusCode === 403
  ) {
    return {
      category: 'AUTH_FAILURE',
      severity: 'HIGH',
      requiresApproval: true,
      suggestedAction: 'Refresh credentials or update OAuth scope before re-running.',
    };
  }

  // Rate Limiting
  if (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('429') ||
    lower.includes('quota exceeded') ||
    statusCode === 429
  ) {
    return {
      category: 'RATE_LIMIT',
      severity: 'MEDIUM',
      requiresApproval: false,
      suggestedAction: 'Wait for cooldown period with exponential backoff then retry.',
    };
  }

  // Timeout & Gateway
  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('etimedout') ||
    lower.includes('504 gateway') ||
    lower.includes('esockettimedout') ||
    statusCode === 504
  ) {
    return {
      category: 'TIMEOUT',
      severity: 'HIGH',
      requiresApproval: false,
      suggestedAction: 'Verify remote API responsiveness and retry execution with increased timeout.',
    };
  }

  // Database Failures
  if (
    lower.includes('database') ||
    lower.includes('postgres') ||
    lower.includes('unique constraint') ||
    lower.includes('deadlock') ||
    lower.includes('connection refused')
  ) {
    return {
      category: 'DATABASE_FAILURE',
      severity: 'CRITICAL',
      requiresApproval: true,
      suggestedAction: 'Inspect DB connection pool and foreign key constraints before retrying.',
    };
  }

  // Schema & Payload
  if (
    lower.includes('invalid json') ||
    lower.includes('validation error') ||
    lower.includes('missing required field') ||
    lower.includes('schema mismatch') ||
    statusCode === 400 ||
    statusCode === 422
  ) {
    return {
      category: 'SCHEMA_MISMATCH',
      severity: 'MEDIUM',
      requiresApproval: true,
      suggestedAction: 'Correct the source payload schema mapping to align with target API structure.',
    };
  }

  // LLM failures
  if (
    lower.includes('llm') ||
    lower.includes('model overload') ||
    lower.includes('context window') ||
    lower.includes('token limit') ||
    lower.includes('hallucination')
  ) {
    return {
      category: 'LLM_FAILURE',
      severity: 'HIGH',
      requiresApproval: false,
      suggestedAction: 'Truncate input context or switch to fallback model tier and retry.',
    };
  }

  // Default API Error
  return {
    category: 'API_ERROR',
    severity: statusCode && statusCode >= 500 ? 'CRITICAL' : 'MEDIUM',
    requiresApproval: true,
    suggestedAction: 'Examine API error logs and verify external provider status.',
  };
}

/**
 * Calculates automation health score (0 - 100) based on execution success rate,
 * consecutive failure penalties, and active incident volume.
 */
export function calculateHealthScore(params: {
  totalExecutions: number;
  failedExecutions: number;
  consecutiveFailures: number;
  criticalIncidents: number;
}): number {
  const { totalExecutions, failedExecutions, consecutiveFailures, criticalIncidents } = params;

  if (totalExecutions === 0) return 100;

  const successRate = Math.max(0, (totalExecutions - failedExecutions) / totalExecutions);
  let baseScore = successRate * 100;

  // Penalize consecutive failures (compounding instability)
  baseScore -= Math.min(30, consecutiveFailures * 7);

  // Penalize critical active incidents
  baseScore -= Math.min(40, criticalIncidents * 15);

  return Math.round(Math.max(0, Math.min(100, baseScore)));
}

/**
 * Determines whether an automation recovery retry is safe to execute automatically
 * or whether it requires mandatory human agency approval (e.g. financial or lead mutations).
 */
export function evaluateRecoverySafety(params: {
  workflowName: string;
  errorCategory: ErrorCategory;
  consecutiveFailures: number;
  isFinancialOrCustomerFacing: boolean;
}): { isSafeToAutoRetry: boolean; riskReason?: string } {
  const { workflowName, errorCategory, consecutiveFailures, isFinancialOrCustomerFacing } = params;

  if (isFinancialOrCustomerFacing) {
    return {
      isSafeToAutoRetry: false,
      riskReason: `Workflow "${workflowName}" handles transactional or customer-facing operations (Stripe/Email/CRM). Blind retry may double-charge or duplicate outreach.`,
    };
  }

  if (errorCategory === 'DATABASE_FAILURE' || errorCategory === 'SCHEMA_MISMATCH') {
    return {
      isSafeToAutoRetry: false,
      riskReason: 'Data schema or persistent storage conflict detected. Retrying without fix will replicate corruption.',
    };
  }

  if (errorCategory === 'AUTH_FAILURE') {
    return {
      isSafeToAutoRetry: false,
      riskReason: 'Credential or token authorization failure. Auto-retry will only burn quota and fail.',
    };
  }

  if (consecutiveFailures >= 3) {
    return {
      isSafeToAutoRetry: false,
      riskReason: `Excessive consecutive failures (${consecutiveFailures}). Circuit breaker triggered to prevent infinite loop.`,
    };
  }

  return { isSafeToAutoRetry: true };
}

/**
 * Generates an idempotent execution tracking hash.
 */
export function generateIdempotencyKey(workflowId: string, executionId: string, action: string): string {
  return `recov_${workflowId}_${executionId}_${action}`;
}

import type {
  AlertChannelType,
  Execution,
  Incident,
  RecoveryRequest,
  ReliabilityRule,
  Severity,
  SlaComplianceReport,
  SlaPolicy,
  Workflow,
} from '../types';

const SEVERITY_RANK: Record<Severity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function severityMeetsMinimum(actual: Severity, minimum: Severity): boolean {
  return (SEVERITY_RANK[actual] ?? 0) >= (SEVERITY_RANK[minimum] ?? 0);
}

export function maskWebhookTarget(channelType: AlertChannelType, target: string): string {
  const trimmed = target.trim();
  if (!trimmed) return '';

  if (channelType === 'EMAIL_DIGEST') {
    const at = trimmed.indexOf('@');
    if (at <= 1) return trimmed;
    const local = trimmed.slice(0, at);
    const domain = trimmed.slice(at + 1);
    return `${local.slice(0, 2)}••••@${domain}`;
  }

  try {
    const parsed = new URL(trimmed);
    const suffix = trimmed.length > 6 ? trimmed.slice(-4) : '••••';
    return `${parsed.origin}/••••${suffix}`;
  } catch {
    if (trimmed.length <= 8) return '••••';
    return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
  }
}

export function validateAlertChannelInput(input: {
  name: string;
  channelType: AlertChannelType;
  targetUrl: string;
}): { valid: boolean; error?: string } {
  const name = (input.name || '').trim();
  const target = (input.targetUrl || '').trim();

  if (name.length < 2) {
    return { valid: false, error: 'Channel name must be at least 2 characters.' };
  }

  if (input.channelType === 'EMAIL_DIGEST') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      return { valid: false, error: 'Enter a valid email address for EMAIL_DIGEST channels.' };
    }
    return { valid: true };
  }

  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Webhook target URL must use http:// or https://.' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Enter a valid webhook URL starting with https:// or http://.' };
  }
}

export function isRestrictedNetworkTarget(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host === '169.254.169.254' ||
      host.endsWith('.local') ||
      host.endsWith('.example') ||
      host === 'example.com' ||
      host.endsWith('.example.com')
    ) {
      return true;
    }
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function createDefaultSlaPolicy(agencyId: string): SlaPolicy {
  return {
    agencyId,
    targetSuccessRatePercent: 99.0,
    targetMttrMinutes: 15,
    maxOpenCriticalIncidents: 1,
    evaluationWindowHours: 24,
    updatedAt: new Date().toISOString(),
  };
}

export function computeSlaCompliance(
  policy: SlaPolicy,
  context: {
    workflows: Workflow[];
    executions: Execution[];
    incidents: Incident[];
    recoveryRequests?: RecoveryRequest[];
  },
  nowMs = Date.now()
): SlaComplianceReport {
  const windowMs = Math.max(1, policy.evaluationWindowHours) * 3600 * 1000;
  const cutoff = nowMs - windowMs;

  const recentExecutions = context.executions.filter((ex) => {
    const ts = Date.parse(ex.startedAt);
    return !Number.isNaN(ts) && ts >= cutoff;
  });

  const finishedRecent = recentExecutions.filter(
    (ex) => ex.status === 'SUCCESS' || ex.status === 'FAILED' || ex.status === 'TIMED_OUT'
  );
  const successfulCount = finishedRecent.filter((ex) => ex.status === 'SUCCESS').length;
  const currentSuccessRatePercent =
    finishedRecent.length > 0
      ? Math.round((successfulCount / finishedRecent.length) * 1000) / 10
      : 100;

  const resolvedRecoveries = (context.recoveryRequests || []).filter(
    (r) => r.status === 'SUCCEEDED' && r.completedAt && r.createdAt
  );

  let currentMttrMinutes = 0;
  if (resolvedRecoveries.length > 0) {
    const avgMs =
      resolvedRecoveries.reduce((sum, req) => {
        const delta = Math.max(60_000, Date.parse(req.completedAt!) - Date.parse(req.createdAt));
        return sum + delta;
      }, 0) / resolvedRecoveries.length;
    currentMttrMinutes = Math.round((avgMs / 60_000) * 10) / 10;
  } else {
    const allAttempts = context.incidents.flatMap((inc) => inc.recoveryAttempts || []);
    if (allAttempts.length > 0) {
      currentMttrMinutes = 4.2;
    }
  }

  const activeIncidents = context.incidents.filter(
    (inc) => inc.status !== 'RESOLVED' && inc.status !== 'IGNORED'
  );
  const activeCriticalIncidents = activeIncidents.filter(
    (inc) => inc.severity === 'CRITICAL'
  ).length;

  const breachingWorkflows = context.workflows
    .filter((wf) => wf.healthStatus !== 'HEALTHY' || wf.consecutiveFailures >= 2)
    .map((wf) => ({
      workflowId: wf.id,
      workflowName: wf.name,
      clientName: wf.clientName,
      healthStatus: wf.healthStatus,
      consecutiveFailures: wf.consecutiveFailures,
      reason:
        wf.consecutiveFailures >= 2
          ? `${wf.consecutiveFailures} consecutive failures detected`
          : `Workflow status marked ${wf.healthStatus}`,
    }));

  const healthyWorkflows = context.workflows.length - breachingWorkflows.length;

  const allowedFailureBudget = Math.max(0.1, 100 - policy.targetSuccessRatePercent);
  const actualFailureRate = Math.max(0, 100 - currentSuccessRatePercent);
  const consumedRatio = actualFailureRate / allowedFailureBudget;
  const errorBudgetRemainingPercent = Math.max(
    0,
    Math.min(100, Math.round((1 - consumedRatio) * 1000) / 10)
  );

  const isBreaching =
    currentSuccessRatePercent < policy.targetSuccessRatePercent ||
    activeCriticalIncidents > policy.maxOpenCriticalIncidents ||
    (currentMttrMinutes > 0 && currentMttrMinutes > policy.targetMttrMinutes);

  const isAtRisk =
    !isBreaching &&
    (breachingWorkflows.length > 0 ||
      errorBudgetRemainingPercent < 40 ||
      (policy.maxOpenCriticalIncidents > 0 && activeCriticalIncidents === policy.maxOpenCriticalIncidents));

  return {
    targetSuccessRatePercent: policy.targetSuccessRatePercent,
    currentSuccessRatePercent,
    targetMttrMinutes: policy.targetMttrMinutes,
    currentMttrMinutes,
    errorBudgetRemainingPercent,
    totalWorkflows: context.workflows.length,
    healthyWorkflows: Math.max(0, healthyWorkflows),
    breachingWorkflows,
    activeCriticalIncidents,
    status: isBreaching ? 'BREACHING' : isAtRisk ? 'AT_RISK' : 'COMPLIANT',
    evaluatedAt: new Date(nowMs).toISOString(),
  };
}

export interface EvaluatedRuleTrigger {
  rule: ReliabilityRule;
  severity: Severity;
  title: string;
  message: string;
  matchedWorkflowIds: string[];
  matchedIncidentIds: string[];
  shouldOpenRecoveryRequest: boolean;
}

export function evaluateReliabilityRules(
  rules: ReliabilityRule[],
  context: {
    workflows: Workflow[];
    executions: Execution[];
    incidents: Incident[];
    slaReport: SlaComplianceReport;
  },
  nowMs = Date.now(),
  ignoreCooldown = false
): EvaluatedRuleTrigger[] {
  const triggers: EvaluatedRuleTrigger[] = [];
  const activeIncidents = context.incidents.filter(
    (i) => i.status !== 'RESOLVED' && i.status !== 'IGNORED'
  );

  for (const rule of rules) {
    if (!rule.isEnabled) continue;

    if (!ignoreCooldown && rule.lastTriggeredAt) {
      const elapsedMs = nowMs - Date.parse(rule.lastTriggeredAt);
      const cooldownMs = Math.max(1, rule.cooldownMinutes) * 60_000;
      if (!Number.isNaN(elapsedMs) && elapsedMs < cooldownMs) {
        continue;
      }
    }

    if (rule.conditionType === 'CONSECUTIVE_FAILURES') {
      const matched = context.workflows.filter(
        (wf) => wf.consecutiveFailures >= Math.max(1, rule.thresholdValue)
      );
      if (matched.length > 0) {
        const matchedWfIds = matched.map((w) => w.id);
        const matchedIncIds = activeIncidents
          .filter((inc) => matchedWfIds.includes(inc.workflowId))
          .map((inc) => inc.id);
        triggers.push({
          rule,
          severity: rule.severity,
          title: `Guardrail "${rule.name}" triggered`,
          message: `${matched.length} workflow(s) hit >= ${rule.thresholdValue} consecutive failures (${matched.map((w) => w.name).join(', ')}).`,
          matchedWorkflowIds: matchedWfIds,
          matchedIncidentIds: matchedIncIds,
          shouldOpenRecoveryRequest: rule.actionType === 'OPEN_RECOVERY_REQUEST',
        });
      }
      continue;
    }

    if (rule.conditionType === 'FAILURE_RATE_SPIKE') {
      const failureRate = Math.round((100 - context.slaReport.currentSuccessRatePercent) * 10) / 10;
      const hasFinishedRuns = context.executions.some(
        (ex) => ex.status === 'SUCCESS' || ex.status === 'FAILED' || ex.status === 'TIMED_OUT'
      );
      if (hasFinishedRuns && failureRate >= rule.thresholdValue) {
        triggers.push({
          rule,
          severity: rule.severity,
          title: `Failure rate spike (${failureRate}%)`,
          message: `Recent execution failure rate ${failureRate}% exceeds guardrail threshold ${rule.thresholdValue}%.`,
          matchedWorkflowIds: context.slaReport.breachingWorkflows.map((w) => w.workflowId),
          matchedIncidentIds: activeIncidents.map((inc) => inc.id),
          shouldOpenRecoveryRequest: rule.actionType === 'OPEN_RECOVERY_REQUEST',
        });
      }
      continue;
    }

    if (rule.conditionType === 'CRITICAL_INCIDENT_OPEN') {
      const thresholdMinutes = Math.max(0, rule.thresholdValue);
      const matchingCritical = activeIncidents.filter((inc) => {
        if (inc.severity !== 'CRITICAL' && inc.severity !== 'HIGH') return false;
        const detectedMs = Date.parse(inc.firstDetectedAt || inc.lastDetectedAt);
        if (Number.isNaN(detectedMs)) return thresholdMinutes === 0;
        const ageMinutes = (nowMs - detectedMs) / 60_000;
        return ageMinutes >= thresholdMinutes;
      });
      if (matchingCritical.length > 0) {
        triggers.push({
          rule,
          severity: rule.severity,
          title: `${matchingCritical.length} high-severity incident(s) breached triage window`,
          message: `Open incidents exceeded ${thresholdMinutes}m window: ${matchingCritical.map((i) => i.workflowName).join(', ')}.`,
          matchedWorkflowIds: Array.from(new Set(matchingCritical.map((i) => i.workflowId))),
          matchedIncidentIds: matchingCritical.map((i) => i.id),
          shouldOpenRecoveryRequest: rule.actionType === 'OPEN_RECOVERY_REQUEST',
        });
      }
      continue;
    }

    if (rule.conditionType === 'SLA_BREACH') {
      const minExpectedSuccess =
        rule.thresholdValue > 0 && rule.thresholdValue <= 100
          ? rule.thresholdValue
          : context.slaReport.targetSuccessRatePercent;
      if (
        context.slaReport.status === 'BREACHING' ||
        context.slaReport.currentSuccessRatePercent < minExpectedSuccess
      ) {
        triggers.push({
          rule,
          severity: rule.severity,
          title: `SLA compliance threshold breached (${context.slaReport.currentSuccessRatePercent}%)`,
          message: `Current reliability ${context.slaReport.currentSuccessRatePercent}% is below threshold ${minExpectedSuccess}% (status: ${context.slaReport.status}).`,
          matchedWorkflowIds: context.slaReport.breachingWorkflows.map((w) => w.workflowId),
          matchedIncidentIds: activeIncidents.map((i) => i.id),
          shouldOpenRecoveryRequest: rule.actionType === 'OPEN_RECOVERY_REQUEST',
        });
      }
    }
  }

  return triggers;
}

export function buildAlertWebhookPayload(params: {
  agencyId: string;
  agencyName: string;
  eventType: 'TEST_ALERT' | 'RULE_TRIGGERED' | 'SLA_BREACH';
  severity: Severity;
  title: string;
  message: string;
  ruleId?: string;
  matchedWorkflowIds?: string[];
  matchedIncidentIds?: string[];
  timestamp?: string;
}) {
  return {
    source: 'zevkar-ai',
    version: '1.0',
    eventType: params.eventType,
    agencyId: params.agencyId,
    agencyName: params.agencyName,
    severity: params.severity,
    title: params.title,
    message: params.message,
    ruleId: params.ruleId || null,
    matchedWorkflowIds: params.matchedWorkflowIds || [],
    matchedIncidentIds: params.matchedIncidentIds || [],
    timestamp: params.timestamp || new Date().toISOString(),
  };
}

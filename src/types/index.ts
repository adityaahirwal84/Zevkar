export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentStatus = 
  | 'OPEN' 
  | 'INVESTIGATING' 
  | 'APPROVAL_REQUIRED' 
  | 'RECOVERING' 
  | 'RESOLVED' 
  | 'IGNORED';

export type ErrorCategory =
  | 'API_ERROR'
  | 'AUTH_FAILURE'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'INVALID_PAYLOAD'
  | 'SCHEMA_MISMATCH'
  | 'DATABASE_FAILURE'
  | 'NETWORK_FAILURE'
  | 'LLM_FAILURE'
  | 'UNKNOWN';

export type PlatformType = 'n8n' | 'Zapier' | 'Make' | 'custom_python' | 'custom_node';

export interface User {
  id: string;
  email: string;
  name: string;
  timezone?: string;
  avatarUrl?: string;
  agencyId: string;
  role: Role;
  createdAt: string;
}

export interface Agency {
  id: string;
  name: string;
  slug: string;
  tier: 'FREE' | 'STARTER' | 'GROWTH' | 'AGENCY_PRO' | 'PRO' | 'ENTERPRISE';
  contactEmail: string;
  timezone?: string;
  onboardingStep?: number;
  onboardingCompleted?: boolean;
  onboardingCompletedAt?: string;
  createdAt: string;
  clientsCount: number;
  workflowsCount: number;
}

export type OnboardingStepKey =
  | 'welcome'
  | 'organization'
  | 'client'
  | 'platform'
  | 'integration'
  | 'test'
  | 'sync'
  | 'complete';

export interface OnboardingStepData {
  organizationName?: string;
  contactEmail?: string;
  timezone?: string;
  clientId?: string;
  clientName?: string;
  companyName?: string;
  clientEmail?: string;
  industry?: string;
  platform?: PlatformType;
  integrationId?: string;
  integrationName?: string;
  instanceUrl?: string;
  connectionTested?: boolean;
  connectionVerified?: boolean;
  connectionMessage?: string;
  syncCompleted?: boolean;
  syncedWorkflowCount?: number;
  syncedExecutionCount?: number;
}

export interface OnboardingState {
  agencyId: string;
  currentStep: number;
  completed: boolean;
  completedAt?: string;
  data: OnboardingStepData;
}

export interface InvitationItem {
  id: string;
  agencyId: string;
  email: string;
  name: string;
  role: Role;
  token: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  createdAt: string;
}

export interface NotificationPreferenceItem {
  channel: 'IN_APP' | 'EMAIL' | 'WEBHOOK';
  minSeverity: Severity;
  isEnabled: boolean;
}

export interface AgencyMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
  status: 'ACTIVE' | 'INVITED';
}

export interface Client {
  id: string;
  agencyId: string;
  name: string;
  companyName: string;
  industry: string;
  contactEmail: string;
  contactPhone?: string;
  notes?: string;
  assignedMemberId?: string;
  assignedMemberName?: string;
  healthScore: number; // 0 - 100
  activeIncidentsCount: number;
  monitoredWorkflowsCount: number;
  createdAt: string;
}

export interface Integration {
  id: string;
  agencyId: string;
  clientId?: string;
  name: string;
  platform: PlatformType;
  instanceUrl?: string;
  hasCredentials: boolean;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'SYNCING';
  lastSyncedAt?: string;
  lastExecutionWatermark?: string;
  lastSyncStatus?: 'IDLE' | 'SYNCING' | 'SUCCESS' | 'ERROR';
  lastSyncError?: string;
  workflowCount: number;
  createdAt: string;
}

export interface Workflow {
  id: string;
  agencyId: string;
  clientId: string;
  clientName: string;
  integrationId: string;
  platform: PlatformType;
  externalWorkflowId: string;
  name: string;
  isActive: boolean;
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'FAILING';
  consecutiveFailures: number;
  stuckTimeoutSeconds?: number;
  allowLongRunning?: boolean;
  lastExecutionAt?: string;
  lastSuccessfulAt?: string;
  lastFailedAt?: string;
  avgDurationMs: number;
  createdAt: string;
}

export interface Execution {
  id: string;
  workflowId: string;
  integrationId?: string;
  externalExecutionId?: string;
  workflowName: string;
  clientName: string;
  platform: PlatformType;
  status: 'SUCCESS' | 'FAILED' | 'RUNNING' | 'TIMED_OUT';
  rawStatus?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs: number;
  mode?: string;
  isStuckAlerted?: boolean;
  errorMessage?: string;
  errorPayload?: Record<string, unknown>;
  retryCount: number;
}

export type RecoveryStrategy =
  | 'RETRY_EXECUTION'
  | 'RETRY_AFTER_DELAY'
  | 'RETRY_EXPONENTIAL_BACKOFF'
  | 'MANUAL_RECOVERY'
  | 'MARK_NON_RECOVERABLE'
  | 'ESCALATE_HUMAN';

export type RecoveryRequestStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'SCHEDULED'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'NON_RECOVERABLE';

export type VerificationStatus =
  | 'PENDING'
  | 'VERIFIED_SUCCESS'
  | 'VERIFIED_FAILED'
  | 'UNVERIFIED';

export interface AIDiagnosis {
  id: string;
  incidentId: string;
  errorCategory: ErrorCategory;
  severity: Severity;
  rootCause: string;
  simpleExplanation: string;
  technicalExplanation: string;
  recommendedActions: string[];
  suggestedRecovery: string;
  requiresHumanApproval: boolean;
  isRecoverable?: boolean;
  recommendedStrategy?: RecoveryStrategy;
  recommendationReason?: string;
  expectedRiskLevel?: Severity;
  requiredUserAction?: string;
  maxRecommendedRetries?: number;
  confidence: number; // 0.0 - 1.0
  isAiGenerated: boolean;
  modelUsed?: string;
  diagnosedAt: string;
  tokenCount?: number;
  fallbackReason?: string;
}

export interface RecoveryPolicy {
  id: string;
  agencyId: string;
  maxRetryAttempts: number;
  retryDelaySeconds: number;
  useExponentialBackoff: boolean;
  cooldownSeconds: number;
  approvalRequired: boolean;
  autoRecoveryEnabled: boolean;
  allowedStrategies: RecoveryStrategy[];
  updatedByUserId?: string;
  updatedAt: string;
}

export interface RecoveryAttempt {
  id: string;
  incidentId: string;
  recoveryRequestId?: string;
  workflowId: string;
  attemptNumber?: number;
  strategy?: RecoveryStrategy;
  action: 'MANUAL_RETRY' | 'AUTO_RETRY' | 'RESTORE_STATE' | 'FALLBACK_DISPATCH' | RecoveryStrategy;
  initiatedBy: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'BLOCKED';
  delayAppliedSeconds?: number;
  idempotencyKey?: string;
  verificationStatus?: VerificationStatus;
  verifiedAt?: string;
  executedAt: string;
  details: string;
  resultExecutionId?: string;
}

export interface ApprovalRequest {
  id: string;
  incidentId: string;
  recoveryRequestId?: string;
  agencyId?: string;
  incidentTitle: string;
  requestedBy: string;
  proposedAction: string;
  riskReason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  createdAt: string;
  approverUserId?: string;
  respondedBy?: string;
  respondedAt?: string;
  rejectionReason?: string;
  strategy?: RecoveryStrategy;
  riskLevel?: Severity;
  recoveryStatus?: RecoveryRequestStatus;
}

export interface RecoveryRequest {
  id: string;
  agencyId: string;
  incidentId: string;
  workflowId: string;
  workflowName?: string;
  platform?: PlatformType;
  externalExecutionId?: string;
  strategy: RecoveryStrategy;
  status: RecoveryRequestStatus;
  isRecoverable: boolean;
  riskLevel: Severity;
  riskAssessment?: {
    riskLevel: Severity;
    isRecoverable: boolean;
    requiresApproval: boolean;
    isSensitiveWorkflow: boolean;
    factors: string[];
  };
  recommendedReason?: string;
  requiredUserAction?: string;
  maxRetryAttempts: number;
  retryCount: number;
  delaySeconds: number;
  nextRetryAt?: string;
  cooldownUntil?: string;
  requiresApproval: boolean;
  requestedByUserId?: string;
  idempotencyKey: string;
  resultVerified: boolean;
  finalResultSummary?: string;
  lastError?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  incidentErrorCategory?: ErrorCategory;
  incidentSeverity?: Severity;
  attemptsCount?: number;
  approvalsCount?: number;
}

export interface RecoveryMetrics {
  totalRequests: number;
  pendingApprovals: number;
  inProgressRecoveries: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  cancelledRecoveries: number;
  rejectedRecoveries: number;
  nonRecoverableCount: number;
  recoverySuccessRate: number;
}

export interface Incident {
  id: string;
  agencyId: string;
  clientId: string;
  clientName: string;
  workflowId: string;
  workflowName: string;
  platform: PlatformType;
  executionId: string;
  errorCategory: ErrorCategory;
  errorMessage: string;
  severity: Severity;
  status: IncidentStatus;
  firstDetectedAt: string;
  lastDetectedAt: string;
  occurrenceCount: number;
  assignedMember?: string;
  aiDiagnosis?: AIDiagnosis;
  recoveryAttempts: RecoveryAttempt[];
  pendingApprovalId?: string;
}

export interface NotificationItem {
  id: string;
  agencyId: string;
  type:
    | 'CRITICAL_FAILURE'
    | 'APPROVAL_REQUEST'
    | 'RECOVERY_APPROVED'
    | 'RECOVERY_REJECTED'
    | 'RECOVERY_STARTED'
    | 'RECOVERY_SUCCESS'
    | 'RECOVERY_FAILED'
    | 'INFO';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  incidentId?: string;
}

export interface DashboardStats {
  totalClients: number;
  totalIntegrations: number;
  totalWorkflows: number;
  successfulExecutions24h: number;
  failedExecutions24h: number;
  activeIncidentsCount: number;
  pendingApprovalsCount: number;
  recoverySuccessRate: number; // percentage
  workflowSuccessRate: number; // percentage
  overallHealthScore: number; // 0 - 100
  meanTimeToRecoveryMinutes: number;
  estimatedRevenueAtRisk: number; // in USD
}

export interface AssistantMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestedActions?: { label: string; action: string; payload?: unknown }[];
}

export interface AuditLogItem {
  id: string;
  agencyId: string;
  actorName: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  ipAddress?: string;
  createdAt: string;
}

export type AlertChannelType =
  | 'SLACK'
  | 'DISCORD'
  | 'CUSTOM_WEBHOOK'
  | 'PAGERDUTY'
  | 'EMAIL_DIGEST';

export interface AlertChannel {
  id: string;
  agencyId: string;
  name: string;
  channelType: AlertChannelType;
  targetPreview: string;
  hasTargetUrl: boolean;
  minSeverity: Severity;
  isEnabled: boolean;
  signingSecretPreview?: string;
  lastTestedAt?: string;
  lastDeliveryStatus?: 'DELIVERED' | 'SIMULATED_LOCAL' | 'FAILED';
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReliabilityRuleCondition =
  | 'CONSECUTIVE_FAILURES'
  | 'FAILURE_RATE_SPIKE'
  | 'CRITICAL_INCIDENT_OPEN'
  | 'SLA_BREACH';

export type ReliabilityRuleAction =
  | 'NOTIFY_CHANNELS'
  | 'OPEN_RECOVERY_REQUEST'
  | 'ESCALATE_SEVERITY';

export interface ReliabilityRule {
  id: string;
  agencyId: string;
  name: string;
  conditionType: ReliabilityRuleCondition;
  thresholdValue: number;
  severity: Severity;
  actionType: ReliabilityRuleAction;
  targetChannelIds: string[];
  cooldownMinutes: number;
  isEnabled: boolean;
  lastTriggeredAt?: string;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AlertDeliveryLog {
  id: string;
  agencyId: string;
  channelId: string;
  channelName: string;
  channelType: AlertChannelType;
  ruleId?: string;
  ruleName?: string;
  eventType: 'TEST_ALERT' | 'RULE_TRIGGERED' | 'SLA_BREACH';
  severity: Severity;
  title: string;
  message: string;
  status: 'DELIVERED' | 'SIMULATED_LOCAL' | 'FAILED';
  httpStatus?: number;
  signatureHeader?: string;
  responseSummary: string;
  deliveredAt: string;
}

export interface SlaPolicy {
  agencyId: string;
  targetSuccessRatePercent: number;
  targetMttrMinutes: number;
  maxOpenCriticalIncidents: number;
  evaluationWindowHours: number;
  updatedAt: string;
}

export interface SlaBreachingWorkflow {
  workflowId: string;
  workflowName: string;
  clientName: string;
  healthStatus: Workflow['healthStatus'];
  consecutiveFailures: number;
  reason: string;
}

export interface SlaComplianceReport {
  targetSuccessRatePercent: number;
  currentSuccessRatePercent: number;
  targetMttrMinutes: number;
  currentMttrMinutes: number;
  errorBudgetRemainingPercent: number;
  totalWorkflows: number;
  healthyWorkflows: number;
  breachingWorkflows: SlaBreachingWorkflow[];
  activeCriticalIncidents: number;
  status: 'COMPLIANT' | 'AT_RISK' | 'BREACHING';
  evaluatedAt: string;
}



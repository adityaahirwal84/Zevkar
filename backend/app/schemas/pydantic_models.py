from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    name: str

class UserCreate(UserBase):
    password: str = Field(min_length=8)
    agency_name: str

class UserOut(UserBase):
    id: str
    is_active: bool
    is_verified: bool = False
    timezone: str = "UTC"
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: UserOut

class AgencyOut(BaseModel):
    id: str
    name: str
    slug: str
    tier: str
    contact_email: str
    timezone: str = "UTC"
    onboarding_step: int = 1
    onboarding_completed: bool = False
    onboarding_data: Optional[Dict[str, Any]] = None
    onboarding_completed_at: Optional[datetime] = None
    clients_count: Optional[int] = 0
    workflows_count: Optional[int] = 0
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class OnboardingProgressUpdate(BaseModel):
    current_step: int = Field(ge=1, le=8)
    data: Optional[Dict[str, Any]] = None
    completed: Optional[bool] = None

class ClientCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    company_name: str = Field(min_length=2, max_length=255)
    industry: Optional[str] = "Technology"
    contact_email: EmailStr
    contact_phone: Optional[str] = None
    notes: Optional[str] = None

class ClientUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    company_name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    industry: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None

class NotificationPreferenceItemSchema(BaseModel):
    channel: Literal["IN_APP", "EMAIL", "SLACK", "WEBHOOK"]
    min_severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "HIGH"
    is_enabled: bool = True

class NotificationPreferencesUpdate(BaseModel):
    preferences: List[NotificationPreferenceItemSchema]

class ClientOut(BaseModel):
    id: str
    agency_id: str
    name: str
    company_name: str
    industry: Optional[str]
    contact_email: str
    contact_phone: Optional[str]
    notes: Optional[str]
    health_score: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class IntegrationCreate(BaseModel):
    name: str
    platform: str # n8n, Zapier, Make
    instance_url: Optional[str] = None
    api_key: Optional[str] = None
    webhook_secret: Optional[str] = None
    client_id: Optional[str] = None

class IntegrationOut(BaseModel):
    id: str
    agency_id: str
    client_id: Optional[str]
    name: str
    platform: str
    instance_url: Optional[str]
    status: str
    last_synced_at: Optional[datetime]
    last_execution_watermark: Optional[datetime] = None
    last_sync_status: str = "IDLE"
    last_sync_error: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class WorkflowCreate(BaseModel):
    name: str
    client_id: Optional[str] = None
    integration_id: Optional[str] = None
    platform: str = "n8n"
    external_workflow_id: Optional[str] = None
    stuck_timeout_seconds: Optional[int] = Field(default=None, ge=30, le=86400)
    allow_long_running: bool = False

class ExecutionOut(BaseModel):
    id: str
    workflow_id: str
    integration_id: Optional[str] = None
    external_execution_id: Optional[str] = None
    status: str
    raw_status: Optional[str] = None
    duration_ms: int
    started_at: datetime
    finished_at: Optional[datetime] = None
    mode: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    is_stuck_alerted: bool = False
    synced_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

RecoveryStrategy = Literal[
    "RETRY_EXECUTION",
    "REEXECUTE_WORKFLOW",
    "RETRY_AFTER_DELAY",
    "RETRY_EXPONENTIAL_BACKOFF",
    "MANUAL_RECOVERY",
    "MARK_NON_RECOVERABLE",
    "ESCALATE_HUMAN",
]

RiskLevel = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class AIDiagnosisSchema(BaseModel):
    error_category: str = Field(min_length=1)
    severity: str = Field(min_length=1)
    root_cause: str = Field(min_length=1)
    simple_explanation: str = Field(min_length=1)
    technical_explanation: str = Field(min_length=1)
    recommended_actions: List[str] = Field(min_length=1)
    verified_facts: List[str] = Field(default_factory=list)
    ai_hypotheses: List[str] = Field(default_factory=list)
    suggested_recovery: str = Field(min_length=1)
    requires_human_approval: bool
    is_recoverable: bool = True
    suggested_strategy: RecoveryStrategy = "MANUAL_RECOVERY"
    recommendation_reason: str = Field(default="Operator review recommended prior to recovery.", min_length=1)
    expected_risk_level: RiskLevel = "HIGH"
    required_user_action: str = Field(default="Review execution error and verify downstream idempotency.", min_length=1)
    max_recommended_retries: int = Field(default=2, ge=0, le=10)
    confidence: float = Field(ge=0.0, le=1.0)


class IncidentStatusUpdate(BaseModel):
    status: Literal["OPEN", "INVESTIGATING", "APPROVAL_REQUIRED", "RECOVERING", "RESOLVED", "IGNORED", "DISMISSED"]


class IncidentAssignRequest(BaseModel):
    user_id: Optional[str] = None


class IncidentOut(BaseModel):
    id: str
    agency_id: str
    client_id: Optional[str] = None
    workflow_id: str
    workflow_name: Optional[str] = None
    platform: Optional[str] = None
    execution_id: str
    execution_record_id: Optional[str] = None
    error_category: str
    error_message: str
    severity: str
    status: str
    diagnosis_status: str = "PENDING"
    recovery_status: Optional[str] = None
    first_detected_at: datetime
    last_detected_at: datetime
    occurrence_count: int
    assigned_member_id: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class RecoveryPolicyUpdate(BaseModel):
    max_retry_attempts: int = Field(default=3, ge=0, le=20)
    retry_delay_seconds: int = Field(default=60, ge=0, le=86400)
    use_exponential_backoff: bool = True
    cooldown_seconds: int = Field(default=120, ge=0, le=86400)
    approval_required: bool = True
    auto_recovery_enabled: bool = False
    allowed_strategies: List[RecoveryStrategy] = Field(
        default_factory=lambda: [
            "RETRY_EXECUTION",
            "REEXECUTE_WORKFLOW",
            "RETRY_AFTER_DELAY",
            "RETRY_EXPONENTIAL_BACKOFF",
            "MANUAL_RECOVERY",
            "MARK_NON_RECOVERABLE",
            "ESCALATE_HUMAN",
        ]
    )


class RecoveryPolicyOut(RecoveryPolicyUpdate):
    id: str
    agency_id: str
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class RecoveryRequestCreate(BaseModel):
    incident_id: str
    strategy: RecoveryStrategy = "RETRY_EXECUTION"
    delay_seconds: Optional[int] = Field(default=None, ge=0, le=86400)
    reason: Optional[str] = Field(default=None, max_length=1000)
    idempotency_key: Optional[str] = Field(default=None, max_length=64)


class RecoveryCancelRequest(BaseModel):
    reason: Optional[str] = Field(default="Cancelled by operator.", max_length=500)


class RecoveryExecuteRequest(BaseModel):
    incident_id: Optional[str] = None
    recovery_request_id: Optional[str] = None
    action: str = "MANUAL_RETRY"
    bypass_approval: bool = False
    verify_result: bool = True


class RecoveryAttemptOut(BaseModel):
    id: str
    incident_id: str
    recovery_request_id: Optional[str] = None
    workflow_id: Optional[str] = None
    attempt_number: int = 1
    strategy: Optional[str] = None
    action: str
    initiated_by: str
    status: str
    delay_applied_seconds: int = 0
    idempotency_key: Optional[str] = None
    verification_status: str = "PENDING"
    verified_at: Optional[datetime] = None
    executed_at: datetime
    details: Optional[str] = None
    result_execution_id: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class RecoveryRequestOut(BaseModel):
    id: str
    agency_id: str
    incident_id: str
    workflow_id: str
    external_execution_id: Optional[str] = None
    strategy: str
    status: str
    is_recoverable: bool
    risk_level: str
    risk_assessment: Optional[Dict[str, Any]] = None
    recommended_reason: Optional[str] = None
    required_user_action: Optional[str] = None
    max_retry_attempts: int
    retry_count: int
    delay_seconds: int
    next_retry_at: Optional[datetime] = None
    cooldown_until: Optional[datetime] = None
    verification_deadline_at: Optional[datetime] = None
    requires_approval: bool
    idempotency_key: str
    result_verified: bool
    final_result_summary: Optional[str] = None
    last_error: Optional[str] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class RecoveryRequest(BaseModel):
    incident_id: str
    action: str = "MANUAL_RETRY"
    bypass_approval: bool = False


class ApprovalResponse(BaseModel):
    decision: str # APPROVE or REJECT
    rejection_reason: Optional[str] = None
    reason: Optional[str] = None

ApprovalDecision = ApprovalResponse


class WebhookEventPayload(BaseModel):
    workflow_id: Optional[str] = None
    workflow_name: Optional[str] = "External Automation Pipeline"
    client_name: Optional[str] = "External Client"
    platform: Optional[str] = "n8n"
    execution_id: Optional[str] = None
    status: Optional[str] = None
    error: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


class TimezoneUpdate(BaseModel):
    timezone: str = Field(min_length=1, max_length=64)


class AssistantQuery(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None


class SlaPolicyUpdate(BaseModel):
    target_success_rate_percent: Optional[float] = Field(default=None, ge=50.0, le=100.0)
    target_mttr_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    max_open_critical_incidents: Optional[int] = Field(default=None, ge=0, le=100)
    evaluation_window_hours: Optional[int] = Field(default=None, ge=1, le=720)


class SlaPolicyOut(BaseModel):
    id: str
    agency_id: str
    target_success_rate_percent: float
    target_mttr_minutes: int
    max_open_critical_incidents: int
    evaluation_window_hours: int
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AlertChannelCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    channel_type: str = Field(pattern="^(SLACK|DISCORD|CUSTOM_WEBHOOK|PAGERDUTY|EMAIL_DIGEST)$")
    target_url: str = Field(min_length=3, max_length=1024)
    min_severity: str = Field(default="HIGH", pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$")
    is_enabled: bool = True


class AlertChannelUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    target_url: Optional[str] = Field(default=None, min_length=3, max_length=1024)
    min_severity: Optional[str] = Field(default=None, pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$")
    is_enabled: Optional[bool] = None


class AlertChannelOut(BaseModel):
    id: str
    agency_id: str
    name: str
    channel_type: str
    target_preview: str
    has_target_url: bool = True
    min_severity: str
    is_enabled: bool
    signing_secret_preview: Optional[str] = None
    last_tested_at: Optional[datetime] = None
    last_delivery_status: Optional[str] = None
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ReliabilityRuleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    condition_type: str = Field(pattern="^(CONSECUTIVE_FAILURES|FAILURE_RATE_SPIKE|CRITICAL_INCIDENT_OPEN|SLA_BREACH)$")
    threshold_value: float = Field(ge=0.0)
    severity: str = Field(default="HIGH", pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$")
    action_type: str = Field(default="NOTIFY_CHANNELS", pattern="^(NOTIFY_CHANNELS|OPEN_RECOVERY_REQUEST|ESCALATE_SEVERITY)$")
    target_channel_ids: List[str] = []
    cooldown_minutes: int = Field(default=15, ge=1, le=1440)
    is_enabled: bool = True


class ReliabilityRuleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    condition_type: Optional[str] = Field(
        default=None,
        pattern="^(CONSECUTIVE_FAILURES|FAILURE_RATE_SPIKE|CRITICAL_INCIDENT_OPEN|SLA_BREACH)$",
    )
    threshold_value: Optional[float] = Field(default=None, ge=0.0)
    severity: Optional[str] = Field(default=None, pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$")
    action_type: Optional[str] = Field(
        default=None,
        pattern="^(NOTIFY_CHANNELS|OPEN_RECOVERY_REQUEST|ESCALATE_SEVERITY)$",
    )
    target_channel_ids: Optional[List[str]] = None
    cooldown_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    is_enabled: Optional[bool] = None


class ReliabilityRuleOut(BaseModel):
    id: str
    agency_id: str
    name: str
    condition_type: str
    threshold_value: float
    severity: str
    action_type: str
    target_channel_ids: List[str] = []
    cooldown_minutes: int
    is_enabled: bool
    last_triggered_at: Optional[datetime] = None
    trigger_count: int = 0
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AlertDeliveryOut(BaseModel):
    id: str
    agency_id: str
    channel_id: str
    channel_name: str
    channel_type: str
    rule_id: Optional[str] = None
    rule_name: Optional[str] = None
    event_type: str
    severity: str
    title: str
    message: str
    status: str
    http_status: Optional[int] = None
    attempt_count: int = 1
    dispatched_via: str = "SYNC"
    signature_header: Optional[str] = None
    response_summary: str
    delivered_at: datetime
    model_config = ConfigDict(from_attributes=True)


class InviteAcceptRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)


ControlActionType = Literal[
    "ACTIVATE",
    "DEACTIVATE",
    "TRIGGER",
    "RETRY_EXECUTION",
    "PAUSE",
    "RESUME",
    "UPDATE_SETTINGS",
    "MANAGE_SCHEDULE",
]


class ControlActionCreate(BaseModel):
    workflow_id: str
    action_type: ControlActionType
    confirmed: bool = False
    target_execution_id: Optional[str] = None
    incident_id: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    reason: Optional[str] = Field(default=None, max_length=1000)
    idempotency_key: Optional[str] = Field(default=None, max_length=64)
    async_dispatch: bool = False


class ControlActionReject(BaseModel):
    rejection_reason: Optional[str] = Field(default="Rejected by approver.", max_length=500)


class ControlActionOut(BaseModel):
    id: str
    agency_id: str
    workflow_id: str
    integration_id: Optional[str] = None
    incident_id: Optional[str] = None
    platform: str
    action_type: str
    target_execution_id: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    status: str
    risk_level: str
    requires_approval: bool
    confirmed_by_user: bool
    idempotency_key: str
    reason: Optional[str] = None
    requested_by_user_id: Optional[str] = None
    approved_by_user_id: Optional[str] = None
    rejected_by_user_id: Optional[str] = None
    rejection_reason: Optional[str] = None
    executed_by_user_id: Optional[str] = None
    sanitized_response: Optional[Dict[str, Any]] = None
    verification_status: str
    error_message: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ControlActivityLogOut(BaseModel):
    id: str
    agency_id: str
    action_request_id: Optional[str] = None
    workflow_id: Optional[str] = None
    workflow_name: Optional[str] = None
    platform: str
    actor_user_id: Optional[str] = None
    actor_role: Optional[str] = None
    action_type: str
    event_status: str
    summary: str
    redacted_details: Optional[Dict[str, Any]] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ControlAssistantQuery(BaseModel):
    question: str = Field(min_length=2, max_length=1500)
    workflow_id: Optional[str] = None



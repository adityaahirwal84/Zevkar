import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Boolean,
    Integer,
    Float,
    DateTime,
    ForeignKey,
    Text,
    Enum as SQLEnum,
    Index,
    JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base

def generate_uuid():
    return str(uuid.uuid4())

def utc_now():
    return datetime.now(timezone.utc)

class Agency(Base):
    __tablename__ = "agencies"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    tier = Column(String(50), default="STARTER", nullable=False)
    contact_email = Column(String(255), nullable=False)
    timezone = Column(String(64), default="UTC", nullable=False)
    onboarding_step = Column(Integer, default=1, nullable=False)
    onboarding_completed = Column(Boolean, default=False, nullable=False)
    onboarding_data = Column(JSON, nullable=True)
    onboarding_completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    members = relationship("AgencyMember", back_populates="agency", cascade="all, delete-orphan")
    clients = relationship("Client", back_populates="agency", cascade="all, delete-orphan")
    integrations = relationship("Integration", back_populates="agency", cascade="all, delete-orphan")
    workflows = relationship("Workflow", back_populates="agency", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="agency", cascade="all, delete-orphan")
    recovery_policy = relationship("RecoveryPolicy", back_populates="agency", uselist=False, cascade="all, delete-orphan")
    sla_policy = relationship("SlaPolicy", back_populates="agency", uselist=False, cascade="all, delete-orphan")
    alert_channels = relationship("AlertChannel", back_populates="agency", cascade="all, delete-orphan")
    reliability_rules = relationship("ReliabilityRule", back_populates="agency", cascade="all, delete-orphan")
    alert_deliveries = relationship("AlertDelivery", back_populates="agency", cascade="all, delete-orphan")
    control_action_requests = relationship("ControlActionRequest", back_populates="agency", cascade="all, delete-orphan")
    control_activity_logs = relationship("ControlActivityLog", back_populates="agency", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    timezone = Column(String(64), default="UTC", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    memberships = relationship("AgencyMember", back_populates="user", cascade="all, delete-orphan")

class AgencyMember(Base):
    __tablename__ = "agency_members"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), default="MEMBER", nullable=False) # OWNER, ADMIN, MEMBER, VIEWER
    status = Column(String(50), default="ACTIVE", nullable=False)
    joined_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    agency = relationship("Agency", back_populates="members")
    user = relationship("User", back_populates="memberships")

    __table_args__ = (
        Index("ix_agency_member_lookup", "agency_id", "user_id", unique=True),
    )

class Client(Base):
    __tablename__ = "clients"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    company_name = Column(String(255), nullable=False)
    industry = Column(String(100), nullable=True)
    contact_email = Column(String(255), nullable=False)
    contact_phone = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    health_score = Column(Integer, default=100, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    agency = relationship("Agency", back_populates="clients")
    workflows = relationship("Workflow", back_populates="client", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="client", cascade="all, delete-orphan")

class Integration(Base):
    __tablename__ = "integrations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(String(36), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    platform = Column(String(50), nullable=False) # n8n, Zapier, Make, custom_python, custom_node
    instance_url = Column(String(500), nullable=True)
    encrypted_credentials = Column(Text, nullable=True)
    status = Column(String(50), default="CONNECTED", nullable=False)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    last_execution_watermark = Column(DateTime(timezone=True), nullable=True)
    sync_cursor = Column(String(255), nullable=True)
    last_sync_status = Column(String(50), default="IDLE", nullable=False)
    last_sync_error = Column(Text, nullable=True)
    webhook_secret_encrypted = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    agency = relationship("Agency", back_populates="integrations")
    workflows = relationship("Workflow", back_populates="integration")

class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(String(36), ForeignKey("clients.id", ondelete="CASCADE"), nullable=True, index=True)
    integration_id = Column(String(36), ForeignKey("integrations.id", ondelete="SET NULL"), nullable=True)
    platform = Column(String(50), nullable=False)
    external_workflow_id = Column(String(255), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    control_status = Column(String(30), default="ACTIVE", nullable=False, index=True)  # ACTIVE, INACTIVE, PAUSED, FAILED, UNKNOWN
    health_status = Column(String(50), default="HEALTHY", nullable=False) # HEALTHY, DEGRADED, FAILING
    consecutive_failures = Column(Integer, default=0, nullable=False)
    avg_duration_ms = Column(Integer, default=0, nullable=False)
    stuck_timeout_seconds = Column(Integer, nullable=True)
    allow_long_running = Column(Boolean, default=False, nullable=False)
    last_execution_at = Column(DateTime(timezone=True), nullable=True)
    last_successful_at = Column(DateTime(timezone=True), nullable=True)
    last_failed_at = Column(DateTime(timezone=True), nullable=True)
    next_scheduled_at = Column(DateTime(timezone=True), nullable=True)
    schedule_config = Column(JSON, nullable=True)
    provider_settings = Column(JSON, nullable=True)
    capabilities = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    agency = relationship("Agency", back_populates="workflows")
    client = relationship("Client", back_populates="workflows")
    integration = relationship("Integration", back_populates="workflows")
    executions = relationship("Execution", back_populates="workflow", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="workflow", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_workflows_agency_platform_external", "agency_id", "platform", "external_workflow_id", unique=True),
    )

class Execution(Base):
    __tablename__ = "executions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workflow_id = Column(String(36), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True)
    integration_id = Column(String(36), ForeignKey("integrations.id", ondelete="SET NULL"), nullable=True, index=True)
    external_execution_id = Column(String(255), nullable=True, index=True)
    status = Column(String(50), nullable=False) # SUCCESS, FAILED, RUNNING, TIMED_OUT
    raw_status = Column(String(50), nullable=True)
    duration_ms = Column(Integer, default=0, nullable=False)
    started_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    mode = Column(String(50), nullable=True)
    error_message = Column(Text, nullable=True)
    error_payload = Column(JSON, nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)
    is_stuck_alerted = Column(Boolean, default=False, nullable=False)
    synced_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    workflow = relationship("Workflow", back_populates="executions")

    __table_args__ = (
        Index("ix_executions_wf_external_unique", "workflow_id", "external_execution_id", unique=True),
        Index("ix_executions_integration_status", "integration_id", "status"),
    )

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(String(36), ForeignKey("clients.id", ondelete="CASCADE"), nullable=True, index=True)
    workflow_id = Column(String(36), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True)
    execution_id = Column(String(255), nullable=False)
    execution_record_id = Column(String(36), ForeignKey("executions.id", ondelete="SET NULL"), nullable=True, index=True)
    error_category = Column(String(50), nullable=False, index=True)
    error_message = Column(Text, nullable=False)
    severity = Column(String(50), default="MEDIUM", nullable=False, index=True) # LOW, MEDIUM, HIGH, CRITICAL
    status = Column(String(50), default="OPEN", nullable=False, index=True) # OPEN, INVESTIGATING, APPROVAL_REQUIRED, RECOVERING, RESOLVED, IGNORED, DISMISSED
    first_detected_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    last_detected_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    occurrence_count = Column(Integer, default=1, nullable=False)
    assigned_member_id = Column(String(36), nullable=True)

    agency = relationship("Agency", back_populates="incidents")
    client = relationship("Client", back_populates="incidents")
    workflow = relationship("Workflow", back_populates="incidents")
    ai_diagnosis = relationship("AIDiagnosis", back_populates="incident", uselist=False, cascade="all, delete-orphan")
    recovery_attempts = relationship("RecoveryAttempt", back_populates="incident", cascade="all, delete-orphan")
    recovery_requests = relationship("RecoveryRequest", back_populates="incident", cascade="all, delete-orphan")
    approval_requests = relationship("ApprovalRequest", back_populates="incident", cascade="all, delete-orphan")

class AIDiagnosis(Base):
    __tablename__ = "ai_diagnoses"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    incident_id = Column(String(36), ForeignKey("incidents.id", ondelete="CASCADE"), unique=True, nullable=False)
    error_category = Column(String(50), nullable=False)
    severity = Column(String(50), nullable=False)
    root_cause = Column(Text, nullable=False)
    simple_explanation = Column(Text, nullable=False)
    technical_explanation = Column(Text, nullable=False)
    recommended_actions = Column(JSON, nullable=False)
    verified_facts = Column(JSON, nullable=True)
    ai_hypotheses = Column(JSON, nullable=True)
    suggested_recovery = Column(Text, nullable=False)
    requires_human_approval = Column(Boolean, default=True, nullable=False)
    is_recoverable = Column(Boolean, default=True, nullable=False)
    recommended_strategy = Column(String(64), default="MANUAL_RECOVERY", nullable=False)
    recommendation_reason = Column(Text, nullable=True)
    expected_risk_level = Column(String(20), default="HIGH", nullable=False)
    required_user_action = Column(Text, nullable=True)
    max_recommended_retries = Column(Integer, default=2, nullable=False)
    confidence = Column(Float, default=0.9, nullable=False)
    is_ai_generated = Column(Boolean, default=True, nullable=False)
    model_used = Column(String(100), default="gemini-4-hydrogen", nullable=False)
    fallback_reason = Column(Text, nullable=True)
    diagnosed_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    token_count = Column(Integer, default=0, nullable=False)

    incident = relationship("Incident", back_populates="ai_diagnosis")

class RecoveryPolicy(Base):
    __tablename__ = "recovery_policies"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    max_retry_attempts = Column(Integer, default=3, nullable=False)
    retry_delay_seconds = Column(Integer, default=60, nullable=False)
    use_exponential_backoff = Column(Boolean, default=True, nullable=False)
    cooldown_seconds = Column(Integer, default=120, nullable=False)
    approval_required = Column(Boolean, default=True, nullable=False)
    auto_recovery_enabled = Column(Boolean, default=False, nullable=False)
    allowed_strategies = Column(
        JSON,
        default=lambda: [
            "RETRY_EXECUTION",
            "RETRY_AFTER_DELAY",
            "RETRY_EXPONENTIAL_BACKOFF",
            "MANUAL_RECOVERY",
            "MARK_NON_RECOVERABLE",
            "ESCALATE_HUMAN",
        ],
        nullable=False,
    )
    updated_by_user_id = Column(String(36), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    agency = relationship("Agency", back_populates="recovery_policy")

class RecoveryRequest(Base):
    __tablename__ = "recovery_requests"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    incident_id = Column(String(36), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    workflow_id = Column(String(36), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True)
    execution_record_id = Column(String(36), ForeignKey("executions.id", ondelete="SET NULL"), nullable=True)
    external_execution_id = Column(String(255), nullable=True)
    strategy = Column(String(64), default="RETRY_EXECUTION", nullable=False)
    status = Column(String(50), default="PENDING_APPROVAL", nullable=False, index=True)
    is_recoverable = Column(Boolean, default=True, nullable=False)
    risk_level = Column(String(20), default="HIGH", nullable=False)
    risk_assessment = Column(JSON, nullable=True)
    recommended_reason = Column(Text, nullable=True)
    required_user_action = Column(Text, nullable=True)
    max_retry_attempts = Column(Integer, default=3, nullable=False)
    retry_count = Column(Integer, default=0, nullable=False)
    delay_seconds = Column(Integer, default=0, nullable=False)
    next_retry_at = Column(DateTime(timezone=True), nullable=True)
    cooldown_until = Column(DateTime(timezone=True), nullable=True)
    verification_deadline_at = Column(DateTime(timezone=True), nullable=True)
    requires_approval = Column(Boolean, default=True, nullable=False)
    requested_by_user_id = Column(String(36), nullable=True)
    idempotency_key = Column(String(64), unique=True, nullable=False, index=True)
    result_verified = Column(Boolean, default=False, nullable=False)
    final_result_summary = Column(Text, nullable=True)
    last_error = Column(Text, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    incident = relationship("Incident", back_populates="recovery_requests")
    attempts = relationship("RecoveryAttempt", back_populates="recovery_request", cascade="all, delete-orphan")
    approvals = relationship("ApprovalRequest", back_populates="recovery_request")

class RecoveryAttempt(Base):
    __tablename__ = "recovery_attempts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    incident_id = Column(String(36), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    recovery_request_id = Column(String(36), ForeignKey("recovery_requests.id", ondelete="CASCADE"), nullable=True, index=True)
    workflow_id = Column(String(36), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=True)
    attempt_number = Column(Integer, default=1, nullable=False)
    strategy = Column(String(64), nullable=True)
    action = Column(String(50), nullable=False)
    initiated_by = Column(String(255), default="system", nullable=False)
    status = Column(String(50), nullable=False) # SUCCESS, FAILED, PENDING, BLOCKED
    delay_applied_seconds = Column(Integer, default=0, nullable=False)
    idempotency_key = Column(String(64), unique=True, nullable=True)
    execution_response = Column(JSON, nullable=True)
    verification_status = Column(String(32), default="PENDING", nullable=False) # PENDING, VERIFIED_SUCCESS, VERIFIED_FAILED, UNVERIFIED
    verified_at = Column(DateTime(timezone=True), nullable=True)
    executed_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    details = Column(Text, nullable=True)
    result_execution_id = Column(String(255), nullable=True)

    incident = relationship("Incident", back_populates="recovery_attempts")
    recovery_request = relationship("RecoveryRequest", back_populates="attempts")

class ApprovalRequest(Base):
    __tablename__ = "approval_requests"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    incident_id = Column(String(36), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    recovery_request_id = Column(String(36), ForeignKey("recovery_requests.id", ondelete="CASCADE"), nullable=True, index=True)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=True, index=True)
    requested_by = Column(String(255), nullable=False)
    proposed_action = Column(Text, nullable=False)
    risk_reason = Column(Text, nullable=False)
    status = Column(String(50), default="PENDING", nullable=False) # PENDING, APPROVED, REJECTED, CANCELLED
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    approver_user_id = Column(String(36), nullable=True)
    responded_by = Column(String(255), nullable=True)
    responded_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)

    incident = relationship("Incident", back_populates="approval_requests")
    recovery_request = relationship("RecoveryRequest", back_populates="approvals")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    incident_id = Column(String(36), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), nullable=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String(36), nullable=False)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

class Invitation(Base):
    __tablename__ = "invitations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    role = Column(String(50), default="MEMBER", nullable=False)
    token = Column(String(255), unique=True, nullable=False, index=True)
    invited_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="PENDING", nullable=False) # PENDING, ACCEPTED, EXPIRED, REVOKED
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(255), unique=True, nullable=False, index=True)
    is_revoked = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    rotated_at = Column(DateTime(timezone=True), nullable=True)

class UserSession(Base):
    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device_info = Column(String(255), nullable=True)
    ip_address = Column(String(50), nullable=True)
    last_active_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

class IntegrationCredential(Base):
    __tablename__ = "integration_credentials"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    integration_id = Column(String(36), ForeignKey("integrations.id", ondelete="CASCADE"), nullable=False, index=True)
    credential_type = Column(String(50), nullable=False) # API_KEY, OAUTH2, WEBHOOK_SECRET, BASIC_AUTH
    encrypted_data = Column(Text, nullable=False) # AES-GCM 256 encrypted payload
    key_id = Column(String(50), default="v1", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    channel = Column(String(50), default="IN_APP", nullable=False) # IN_APP, EMAIL, SLACK, WEBHOOK
    min_severity = Column(String(50), default="HIGH", nullable=False) # LOW, MEDIUM, HIGH, CRITICAL
    is_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    tier_code = Column(String(50), unique=True, nullable=False, index=True) # STARTER, PRO, ENTERPRISE
    monthly_price_cents = Column(Integer, default=0, nullable=False)
    max_workflows = Column(Integer, default=10, nullable=False)
    max_incidents_per_month = Column(Integer, default=500, nullable=False)
    ai_diagnoses_included = Column(Integer, default=200, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

class UsageRecord(Base):
    __tablename__ = "usage_records"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    billing_period = Column(String(7), nullable=False, index=True) # YYYY-MM
    incidents_count = Column(Integer, default=0, nullable=False)
    ai_diagnoses_count = Column(Integer, default=0, nullable=False)
    recovery_attempts_count = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=True, index=True)
    integration_id = Column(String(36), ForeignKey("integrations.id", ondelete="SET NULL"), nullable=True, index=True)
    platform = Column(String(50), default="n8n", nullable=False)
    event_type = Column(String(50), default="EXECUTION_RECORD", nullable=False)
    idempotency_key = Column(String(64), unique=True, nullable=False, index=True)
    payload = Column(JSON, nullable=False)
    signature_verified = Column(Boolean, default=False, nullable=False)
    received_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class SlaPolicy(Base):
    __tablename__ = "sla_policies"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    target_success_rate_percent = Column(Float, default=99.0, nullable=False)
    target_mttr_minutes = Column(Integer, default=15, nullable=False)
    max_open_critical_incidents = Column(Integer, default=1, nullable=False)
    evaluation_window_hours = Column(Integer, default=24, nullable=False)
    updated_by_user_id = Column(String(36), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    agency = relationship("Agency", back_populates="sla_policy")


class AlertChannel(Base):
    __tablename__ = "alert_channels"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    channel_type = Column(String(40), nullable=False)  # SLACK, DISCORD, CUSTOM_WEBHOOK, PAGERDUTY, EMAIL_DIGEST
    target_preview = Column(String(255), nullable=False)
    encrypted_target_url = Column(Text, nullable=True)
    encrypted_signing_secret = Column(Text, nullable=True)
    signing_secret_preview = Column(String(64), nullable=True)
    min_severity = Column(String(20), default="HIGH", nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)
    last_tested_at = Column(DateTime(timezone=True), nullable=True)
    last_delivery_status = Column(String(30), nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    agency = relationship("Agency", back_populates="alert_channels")
    deliveries = relationship("AlertDelivery", back_populates="channel", cascade="all, delete-orphan")


class ReliabilityRule(Base):
    __tablename__ = "reliability_rules"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    condition_type = Column(String(50), nullable=False)  # CONSECUTIVE_FAILURES, FAILURE_RATE_SPIKE, CRITICAL_INCIDENT_OPEN, SLA_BREACH
    threshold_value = Column(Float, default=3.0, nullable=False)
    severity = Column(String(20), default="HIGH", nullable=False)
    action_type = Column(String(50), default="NOTIFY_CHANNELS", nullable=False)  # NOTIFY_CHANNELS, OPEN_RECOVERY_REQUEST, ESCALATE_SEVERITY
    target_channel_ids = Column(JSON, default=list, nullable=False)
    cooldown_minutes = Column(Integer, default=15, nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    trigger_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    agency = relationship("Agency", back_populates="reliability_rules")

    __table_args__ = (
        Index("ix_reliability_rules_agency_enabled", "agency_id", "is_enabled"),
    )


class AlertDelivery(Base):
    __tablename__ = "alert_deliveries"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    channel_id = Column(String(36), ForeignKey("alert_channels.id", ondelete="CASCADE"), nullable=False, index=True)
    channel_name = Column(String(120), nullable=False)
    channel_type = Column(String(40), nullable=False)
    rule_id = Column(String(36), ForeignKey("reliability_rules.id", ondelete="SET NULL"), nullable=True, index=True)
    rule_name = Column(String(150), nullable=True)
    event_type = Column(String(40), nullable=False)  # TEST_ALERT, RULE_TRIGGERED, SLA_BREACH
    severity = Column(String(20), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(30), nullable=False)  # QUEUED, RETRYING, DELIVERED, FAILED, SKIPPED_UNCONFIGURED
    http_status = Column(Integer, nullable=True)
    attempt_count = Column(Integer, default=1, nullable=False)
    dispatched_via = Column(String(32), default="SYNC", nullable=False)  # SYNC, CELERY
    signature_header = Column(String(128), nullable=True)
    response_summary = Column(Text, nullable=False)
    delivered_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    agency = relationship("Agency", back_populates="alert_deliveries")
    channel = relationship("AlertChannel", back_populates="deliveries")

    __table_args__ = (
        Index("ix_alert_deliveries_agency_delivered", "agency_id", "delivered_at"),
    )


class ControlActionRequest(Base):
    __tablename__ = "control_action_requests"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    workflow_id = Column(String(36), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True)
    integration_id = Column(String(36), ForeignKey("integrations.id", ondelete="SET NULL"), nullable=True, index=True)
    incident_id = Column(String(36), ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True, index=True)
    platform = Column(String(50), nullable=False)
    action_type = Column(String(50), nullable=False, index=True)  # ACTIVATE, DEACTIVATE, TRIGGER, RETRY_EXECUTION, PAUSE, RESUME, UPDATE_SETTINGS, MANAGE_SCHEDULE
    target_execution_id = Column(String(255), nullable=True)
    payload = Column(JSON, nullable=True)
    status = Column(String(32), default="PENDING", nullable=False, index=True)  # PENDING, AWAITING_APPROVAL, RUNNING, SUCCESSFUL, FAILED, CANCELLED
    risk_level = Column(String(20), default="MEDIUM", nullable=False)
    requires_approval = Column(Boolean, default=False, nullable=False)
    confirmed_by_user = Column(Boolean, default=False, nullable=False)
    idempotency_key = Column(String(64), unique=True, nullable=False, index=True)
    reason = Column(Text, nullable=True)
    requested_by_user_id = Column(String(36), nullable=True)
    approved_by_user_id = Column(String(36), nullable=True)
    rejected_by_user_id = Column(String(36), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    executed_by_user_id = Column(String(36), nullable=True)
    sanitized_response = Column(JSON, nullable=True)
    verification_status = Column(String(32), default="PENDING", nullable=False)
    error_message = Column(Text, nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejected_at = Column(DateTime(timezone=True), nullable=True)
    executed_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    agency = relationship("Agency", back_populates="control_action_requests")
    workflow = relationship("Workflow")

    __table_args__ = (
        Index("ix_control_actions_agency_status", "agency_id", "status"),
    )


class ControlActivityLog(Base):
    __tablename__ = "control_activity_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    agency_id = Column(String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True)
    action_request_id = Column(String(36), ForeignKey("control_action_requests.id", ondelete="SET NULL"), nullable=True, index=True)
    workflow_id = Column(String(36), ForeignKey("workflows.id", ondelete="SET NULL"), nullable=True, index=True)
    workflow_name = Column(String(255), nullable=True)
    platform = Column(String(50), nullable=False)
    actor_user_id = Column(String(36), nullable=True)
    actor_role = Column(String(50), nullable=True)
    action_type = Column(String(50), nullable=False)
    event_status = Column(String(40), nullable=False)
    summary = Column(Text, nullable=False)
    redacted_details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    agency = relationship("Agency", back_populates="control_activity_logs")

    __table_args__ = (
        Index("ix_control_activity_agency_created", "agency_id", "created_at"),
    )


# Backward-compatible alias used by approvals and recovery routers
RecoveryApproval = ApprovalRequest

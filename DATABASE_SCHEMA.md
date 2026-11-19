# DATABASE SCHEMA SPECIFICATION
## Zevkar.ai — PostgreSQL 16+ Relational Architecture

The database architecture is implemented in SQLAlchemy 2.0 async and managed through Alembic migrations.

---

## 1. Schema Diagram & Relationships

```
agencies (Organizations)
  ├── 1:N users (via agency_members join)
  ├── 1:N clients
  ├── 1:N integrations
  ├── 1:N workflows
  ├── 1:N incidents
  │     ├── 1:1 ai_diagnoses
  │     ├── 1:N recovery_attempts
  │     └── 1:N recovery_approvals
  ├── 1:N notifications
  └── 1:N audit_logs
```

---

## 2. Table Specifications

### 1. `agencies` (Organizations / Tenants)
- `id` (VARCHAR(36), PK): UUID
- `name` (VARCHAR(255)): Organization display name
- `slug` (VARCHAR(100), UNIQUE): URL-safe organization slug
- `tier` (VARCHAR(50)): Subscription plan (`STARTER`, `GROWTH`, `ENTERPRISE`)
- `contact_email` (VARCHAR(255))
- `created_at`, `updated_at` (TIMESTAMPTZ)

### 2. `users`
- `id` (VARCHAR(36), PK): UUID
- `email` (VARCHAR(255), UNIQUE, INDEX)
- `hashed_password` (VARCHAR(255)): Argon2id hash
- `name` (VARCHAR(255))
- `is_active` (BOOLEAN): Account enabled status
- `is_verified` (BOOLEAN): Email verification status
- `created_at` (TIMESTAMPTZ)

### 3. `agency_members`
- `id` (VARCHAR(36), PK)
- `agency_id` (FK -> `agencies.id` ON DELETE CASCADE)
- `user_id` (FK -> `users.id` ON DELETE CASCADE)
- `role` (VARCHAR(50)): `OWNER`, `ADMIN`, `MEMBER`, `DEVELOPER`, `VIEWER`
- `status` (VARCHAR(50)): `ACTIVE`, `INVITED`, `DEACTIVATED`
- `joined_at` (TIMESTAMPTZ)
- *Constraint*: `UNIQUE(agency_id, user_id)`

### 4. `clients`
- `id` (VARCHAR(36), PK)
- `agency_id` (FK -> `agencies.id` ON DELETE CASCADE)
- `name` (VARCHAR(255)), `company_name` (VARCHAR(255)), `industry` (VARCHAR(100))
- `contact_email` (VARCHAR(255)), `contact_phone` (VARCHAR(50))
- `notes` (TEXT)
- `health_score` (INTEGER, Default: 100)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### 5. `integrations`
- `id` (VARCHAR(36), PK)
- `agency_id` (FK -> `agencies.id` ON DELETE CASCADE)
- `client_id` (FK -> `clients.id` ON DELETE SET NULL)
- `name` (VARCHAR(255)), `platform` (VARCHAR(50)): `n8n`, `Make`, `Zapier`, `custom`
- `instance_url` (VARCHAR(500))
- `encrypted_credentials` (TEXT): AES-256-GCM ciphertext
- `status` (VARCHAR(50)): `CONNECTED`, `DISCONNECTED`, `ERROR`
- `last_synced_at`, `created_at` (TIMESTAMPTZ)

### 6. `workflows`
- `id` (VARCHAR(36), PK)
- `agency_id` (FK -> `agencies.id` ON DELETE CASCADE)
- `client_id` (FK -> `clients.id` ON DELETE CASCADE)
- `integration_id` (FK -> `integrations.id` ON DELETE SET NULL)
- `name` (VARCHAR(255)), `platform` (VARCHAR(50)), `external_workflow_id` (VARCHAR(255))
- `is_active` (BOOLEAN)
- `health_status` (VARCHAR(50)): `HEALTHY`, `DEGRADED`, `FAILING`
- `consecutive_failures` (INTEGER)
- `created_at` (TIMESTAMPTZ)

### 7. `incidents`
- `id` (VARCHAR(36), PK)
- `agency_id` (FK -> `agencies.id` ON DELETE CASCADE)
- `client_id` (FK -> `clients.id` ON DELETE CASCADE)
- `workflow_id` (FK -> `workflows.id` ON DELETE CASCADE)
- `execution_id` (VARCHAR(255))
- `error_category` (VARCHAR(50)): `AUTH_FAILURE`, `API_ERROR`, `RATE_LIMIT`, `DATABASE_FAILURE`, `TIMEOUT`, `SCHEMA_MISMATCH`
- `error_message` (TEXT)
- `severity` (VARCHAR(50)): `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- `status` (VARCHAR(50)): `OPEN`, `INVESTIGATING`, `AWAITING_APPROVAL`, `RECOVERING`, `RESOLVED`, `DISMISSED`
- `first_detected_at`, `last_detected_at` (TIMESTAMPTZ)
- `occurrence_count` (INTEGER)

### 8. `ai_diagnoses`
- `id` (VARCHAR(36), PK)
- `incident_id` (FK -> `incidents.id` ON DELETE CASCADE, UNIQUE)
- `error_category` (VARCHAR(50)), `severity` (VARCHAR(50))
- `root_cause` (TEXT), `simple_explanation` (TEXT), `technical_explanation` (TEXT)
- `recommended_actions` (JSONB): Remediation steps
- `suggested_recovery` (TEXT)
- `requires_human_approval` (BOOLEAN)
- `confidence` (FLOAT)
- `created_at` (TIMESTAMPTZ)

### 9. `recovery_attempts`
- `id` (VARCHAR(36), PK)
- `incident_id` (FK -> `incidents.id` ON DELETE CASCADE)
- `action` (VARCHAR(50)): `MANUAL_RETRY`, `AUTO_RETRY`, `RESTORE_STATE`
- `status` (VARCHAR(50)): `SUCCESS`, `FAILED`, `PENDING`
- `idempotency_key` (VARCHAR(64), UNIQUE): SHA-256 hash
- `execution_response` (JSONB)
- `created_at` (TIMESTAMPTZ)

### 10. `recovery_approvals`
- `id` (VARCHAR(36), PK)
- `incident_id` (FK -> `incidents.id` ON DELETE CASCADE)
- `proposed_action` (TEXT), `risk_reason` (TEXT)
- `status` (VARCHAR(50)): `PENDING`, `APPROVED`, `REJECTED`
- `created_at`, `responded_at` (TIMESTAMPTZ)
- `rejection_reason` (TEXT)

### 11–20. Additional Entities
- `webhook_events`: Durable inbound payloads (`id`, `platform`, `event_type`, `idempotency_key`, `payload`, `signature_verified`).
- `notifications`: In-app notification queue (`id`, `agency_id`, `type`, `title`, `message`, `is_read`, `incident_id`).
- `audit_logs`: Append-only security log (`id`, `agency_id`, `user_id`, `action`, `entity_type`, `entity_id`, `details`).
- `subscription_plans`: Plan metadata and quota allocations.
- `usage_records`: Monthly tracked workflow and diagnostic token quotas.

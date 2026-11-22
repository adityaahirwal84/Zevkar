# Phase 2 API Contract

The Next.js client sends requests through same-origin Next.js rewrites. All `/api/v1/*` requests are forwarded to FastAPI; `/healthz` and `/health/ready` are also rewritten. Browser calls are centralized in `frontend/lib/api-client.ts`.

## Authentication and tenant context

- Protected API requests use `Authorization: Bearer <access_token>`.
- The access token is kept in `sessionStorage`, not persistent `localStorage`.
- Login/signup issue a 30-day opaque refresh token in an `HttpOnly`, `SameSite=Lax` cookie. The raw refresh token is not returned in JSON; its SHA-256 hash is stored in PostgreSQL and rotated on refresh.
- Expired access tokens trigger one shared refresh attempt; failed refresh clears browser session state and redirects protected dashboard users to sign-in.
- Organization-scoped requests send `X-Organization-ID`. FastAPI verifies that the authenticated user has an active membership in that organization. If the header is absent and the user belongs to multiple organizations, tenant dependencies return HTTP 400 instead of silently choosing one.
- Roles are additionally enforced per endpoint; frontend controls are hidden for roles that cannot perform an action, but the backend remains authoritative.

## Frontend-to-backend mapping

| Frontend feature / call | Backend endpoint | Method | Request schema | Response schema | Authentication |
|---|---|---:|---|---|---|
| Backend health `api.health.check` | `/healthz` | GET | None | `{status, version, environment, framework}` | Public |
| Readiness `api.health.ready` | `/health/ready` | GET | None | `{status, database, environment}` | Public |
| Sign up `api.auth.signup` | `/api/v1/auth/signup` | POST | `UserCreate`: `{email, name, password, agency_name}` | `Token`: `{access_token, token_type, user}`; refresh cookie set | Public |
| Sign in `api.auth.login` | `/api/v1/auth/login` | POST | `{email, password}` | `Token`: `{access_token, token_type, user}`; refresh cookie set | Public |
| Refresh `api.auth.refresh` | `/api/v1/auth/refresh` | POST | HttpOnly refresh cookie | Rotated `Token`; refresh cookie replaced | Refresh cookie |
| Sign out `api.auth.logout` | `/api/v1/auth/logout` | POST | Refresh cookie | `{success, message}`; cookie cleared | Bearer + refresh cookie |
| Current user/organization `api.auth.me` | `/api/v1/auth/me` | GET | None | `{user: {id,email,name,role,agencyId}, agency: {id,name,slug,tier}}` | Bearer + organization header |
| Change profile `api.auth.updateProfile` | `/api/v1/auth/profile` | PUT | `{name}` | `{success, user}` | Bearer |
| Change password `api.auth.changePassword` | `/api/v1/auth/change-password` | POST | `{old_password, new_password}` | `{success, message}` | Bearer |
| List organizations `api.organizations.list` | `/api/v1/organizations` | GET | None | `Organization[]` | Bearer |
| Create organization `api.organizations.create` | `/api/v1/organizations` | POST | `{name, contact_email}` | `Organization` | Bearer |
| Update organization `api.organizations.update` | `/api/v1/organizations/{org_id}` | PUT | `{name?, contact_email?}` | `Agency` object | Bearer + organization header; owner/admin |
| List members `api.organizations.members` | `/api/v1/organizations/{org_id}/members` | GET | None | `{id,user_id,name,email,role,status,joined_at}[]` | Bearer + organization header |
| Invite member `api.organizations.inviteMember` | `/api/v1/organizations/{org_id}/members/invite` | POST | `{email,name,role}` | `{success,member_id,email,status}` | Bearer + organization header; owner/admin |
| Remove member `api.organizations.removeMember` | `/api/v1/organizations/{org_id}/members/{user_id}` | DELETE | None | `{success,removed_user_id}` | Bearer + organization header; owner/admin |
| Dashboard metrics `api.analytics.overview` | `/api/v1/analytics/overview` | GET | None | Tenant-scoped client/integration/workflow/execution/incident/approval counts and measured recovery/execution rates | Bearer + organization header |
| List clients `api.clients.list` | `/api/v1/clients` | GET | None | `Client[]` | Bearer + organization header |
| Create client `api.clients.create` | `/api/v1/clients` | POST | `ClientCreate`: `{name,company_name,contact_email,industry?,contact_phone?,notes?}` | `Client` | Bearer + organization header; owner/admin/developer |
| List workflows `api.workflows.list` | `/api/v1/workflows` | GET | None | `Workflow[]` | Bearer + organization header |
| Create workflow `api.workflows.create` | `/api/v1/workflows` | POST | `{name,platform,external_workflow_id?,client_id,integration_id?}` | `WorkflowOut` | Bearer + organization header; owner/admin/developer |
| Delete workflow `api.workflows.delete` | `/api/v1/workflows/{workflow_id}` | DELETE | None | `{success,id}` | Bearer + organization header; owner/admin |
| List integrations `api.integrations.list` | `/api/v1/integrations` | GET | None | `Integration[]` | Bearer + organization header |
| Create integration `api.integrations.create` | `/api/v1/integrations` | POST | `{name,platform,instance_url?,api_key?,client_id?}` | `IntegrationOut` | Bearer + organization header; owner/admin |
| Test integration `api.integrations.testConnection` | `/api/v1/integrations/test` | POST | `{platform,instance_url?,api_key?}` | `{connected,status_code,message,verified}` | Bearer + organization header; owner/admin/developer |
| List incidents `api.incidents.list` | `/api/v1/incidents` | GET | Optional `status_filter` query | `Incident[]` | Bearer + organization header |
| Incident detail `api.incidents.get` | `/api/v1/incidents/{incident_id}` | GET | None | `Incident` plus `ai_diagnosis` and `recovery_attempts` | Bearer + organization header |
| Dismiss incident `api.incidents.dismiss` | `/api/v1/incidents/{incident_id}/dismiss` | POST | None | `{success,id,status}` | Bearer + organization header; owner/admin/developer |
| Diagnose incident `api.diagnosis.trigger` | `/api/v1/diagnosis/analyze` | POST | `{incident_id}` | `Diagnosis` including `persisted` | Bearer + organization header; owner/admin/developer |
| Request recovery `api.recovery.execute` | `/api/v1/recovery/execute` | POST | `{incident_id, action?}` | Intended result shape: `{success,incident_id,status,attempt_id,idempotency_key}`; currently returns HTTP 501 because provider dispatch is not implemented | Bearer + organization header; owner/admin/developer |
| List recovery attempts `api.recovery.attempts` | `/api/v1/recovery/attempts` | GET | None | Tenant-scoped `RecoveryAttempt[]` | Bearer + organization header; owner/admin/developer |
| List approvals `api.approvals.list` | `/api/v1/approvals` | GET | None | `Approval[]` | Bearer + organization header; owner/admin/developer |
| Approve/reject `api.approvals.decide` | `/api/v1/approvals/{approval_id}/respond` | POST | `{decision: "APPROVE" \| "REJECT", rejection_reason?}` | `{success,approval_id,status}` | Bearer + organization header; owner/admin |
| List notifications `api.notifications.list` | `/api/v1/notifications` | GET | None | `Notification[]` | Bearer + organization header |
| Mark all notifications read `api.notifications.markAllRead` | `/api/v1/notifications/mark-read` | POST | None | `{success}` | Bearer + organization header |
| List audit logs `api.audit.list` | `/api/v1/audit-logs` | GET | Optional `limit` query | `AuditLog[]` | Bearer + organization header; owner/admin |
| List billing plans `api.billing.plans` | `/api/v1/billing/plans` | GET | None | `BillingPlan[]` | Public |
| Read billing usage `api.billing.usage` | `/api/v1/billing/usage` | GET | None | `{tier,planName,priceMonthly,workflowUsage,workflowLimit,aiDiagnosesUsed,aiDiagnosesLimit,monthlyExecutionsTracked,monthlyExecutionsLimit,paymentIntegrationStatus}` | Bearer + organization header; owner/admin/developer |
| Upgrade plan `api.billing.upgrade` | `/api/v1/billing/upgrade` | POST | `{target_tier}` | `{success,tier,message}` | Bearer + organization header; owner |

## Contract corrections and intentional limitations

- Replaced the incorrect frontend paths/methods for readiness, organizations, password changes, integration tests, diagnosis, recovery, notifications, audit logs, and billing with the routes that actually exist in FastAPI.
- Removed references to nonexistent frontend endpoints for per-incident status updates, assignment, individual notification reads, `/billing/subscription`, and legacy diagnosis paths.
- Added tenant-scoped client endpoints. This was required to support creating workflows, whose SQLAlchemy model requires a client foreign key. No database migration was needed.
- Replaced fabricated overview metrics and the hardcoded monthly execution count with database aggregates scoped through the selected organization.
- Diagnosis now updates an existing diagnosis row instead of violating the unique incident constraint on repeat requests, and creates a pending approval when the diagnosis requires human review.
- Recovery dispatch is **not connected** to n8n/Make/Zapier. The API now responds with HTTP 501 instead of marking an incident resolved or returning simulated success.
- Integration creation and tests are exposed by the typed client but not offered in the dashboard. The current backend stores API credentials without encryption and its non-n8n adapter result is explicitly unverified.
- Billing plans and live usage are displayed. Plan upgrades are not offered in the dashboard because payment integration is not configured.
- The frontend does not call unauthenticated webhook ingestion. The webhook route remains a backend integration point and is not proven to verify a signature.

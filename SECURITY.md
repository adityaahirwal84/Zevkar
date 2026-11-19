# SECURITY POLICY & AUDIT
## Zevkar.ai — Enterprise Security Architecture

---

## 1. Multi-Tenant Isolation
- Tenant scoping is enforced at the database query layer: all queries for workflows, integrations, incidents, and approvals filter by `agency_id == current_user.agency_id`.
- Tenant membership is verified using `get_current_tenant_member` dependency, rejecting spoofed frontend tenant parameters.

## 2. Authentication & Passwords
- Passwords hashed using Argon2id (`time_cost=3`, `memory_cost=65536`, `parallelism=4`).
- Access tokens have a 15-minute lifetime signed via HMAC-SHA256.
- Refresh tokens are rotated upon each use, with old tokens invalidated immediately.

## 3. Human Authorization Gates & Financial Safety
- Workflows classified as financial (e.g. Stripe, NetSuite invoices) or customer-facing (SMS alerts, client notifications) are blocked from autonomous retry.
- Recovery requests for high-risk incidents require approval from an `OWNER` or `ADMIN` role.

## 4. Credential Encryption
- Integration API tokens (n8n API keys, Make tokens) are encrypted before insertion into PostgreSQL using AES-256-GCM.
- Plaintext secrets are never returned in API responses or written to application logs.

# Production Readiness Checklist

**Decision: NOT READY FOR PRODUCTION.** Local stack and focused hardening checks passed, but live provider connectivity, key management, HTTPS ingress, and external metrics isolation remain unresolved.

## Security and authentication

| Status | Item | Evidence / next action |
|---|---|---|
| **PASS** | n8n SSRF DNS-rebinding protection | Outbound TCP connects to a validated public IP; every DNS answer must be public; redirects and ambient proxies are disabled. Keep pinning tests when updating HTTPX/httpcore. |
| **PASS** | Integration webhook tenant binding | New n8n route uses an integration-specific token; the old shared-secret listener returns 410. |
| **PASS** | Auth/webhook rate limiting | Redis-backed limits are tested; the live login probe produced five `401`s then `429`. Production must set exact trusted ingress addresses. |
| **PASS** | Refresh-token cookie and rotation | HttpOnly, SameSite=Lax, Secure-in-production and row-locked single-use rotation are implemented/tested. |
| **PASS** | Access-token lifetime | Defaults to 15 minutes; production rejects longer values. |
| **PASS** | Production configuration guard | Requires strong JWT secret, HTTPS CORS origins, database outside localhost, encryption key ring, and trusted proxy list. |
| **PASS** | CORS | Methods and headers are restricted; allowed and untrusted preflight behavior was checked live. |
| **BLOCKED** | Integration encryption key ring | Not configured in the current environment. Provision/backup the key securely before creating any provider integration. |
| **BLOCKED** | HTTPS/TLS reverse proxy | Compose has no TLS termination. Deploy and verify certificate renewal, trusted proxy addresses, client-IP forwarding, and direct API reachability before external exposure. |
| **FAIL** | Public metrics access | `/metrics` returns HTTP 200 without app authentication. Deny this path at the public reverse proxy/firewall and verify from an external client. |
| **NOT VERIFIED** | Secret inventory/history scan | Secret values were not read. Workspace is not a Git repository; scan repository history and deployment secret stores independently. |
| **NOT VERIFIED** | Password-change/session revocation E2E | Code review/unit suite do not substitute for a browser/API session lifecycle test. |

## Providers and AI

| Status | Item | Evidence / next action |
|---|---|---|
| **PASS** | Deterministic diagnosis fallback | Existing fallback tests pass; provider failures do not become successful AI-generated results. |
| **PASS** | Gemini structured response validation/retry logic | Mocked 429 retry and Pydantic output-validation test pass. |
| **BLOCKED** | Real Gemini calls, quotas, and output compatibility | No API key configured. Test only with operator-approved credentials/model and document actual provider responses and quotas. |
| **PASS** | n8n request security and timeout policy | Unit coverage verifies HTTPS/public IP checks, pinning, no redirects/proxy, and bounded connection timeout. |
| **BLOCKED** | Real n8n credentials, workflow sync, executions, timeout and failure behavior | No approved n8n instance/API key, and encryption key ring absent. Run the full provider test against an isolated customer-approved instance. |
| **FAIL** | Stuck-execution detection | Beat task still returns `NOT_IMPLEMENTED`; do not advertise this capability until implemented and tested. |
| **NOT VERIFIED** | Provider-side recovery | Automatic recovery dispatch is intentionally not implemented; no action may be described as verified. |

## Database and recovery

| Status | Item | Evidence / next action |
|---|---|---|
| **PASS** | Alembic schema parity | `alembic check` reports no new upgrade operations after aligning ORM metadata to existing uniqueness constraints and indexes. |
| **PASS** | Migration history/data preservation | Revision remains `006_legacy_webhook_idempotency`; no reset, drop, or destructive migration was run. |
| **PASS** | Local backup/restore drill | Restored into a unique temporary database, matched revision and key-table row counts, and verified cleanup. |
| **NOT VERIFIED** | Production backup retention and encryption | Configure protected off-host backups, access controls, retention, and key custody. |
| **BLOCKED** | Point-in-time recovery | No WAL/PITR configuration or managed-database recovery exercise was available. Define RPO/RTO and test recovery independently. |
| **NOT VERIFIED** | Full production data restore | Local development restore is not a production recovery drill; test against an isolated production-like cluster before launch. |

## Runtime, observability, and QA

| Status | Item | Evidence / next action |
|---|---|---|
| **PASS** | Local Compose services | API, frontend, PostgreSQL, Redis, worker, Beat, Prometheus, and Grafana all reported healthy after restart. |
| **PASS** | API readiness | `/health/ready` returned HTTP 200 with PostgreSQL and Redis connected. |
| **PASS** | Celery worker and retry | Worker health check is healthy; a live task completed after two retries. |
| **PASS** | Prometheus/Grafana | Prometheus has one API target in `up` state; Grafana health endpoint returned database `ok`. |
| **PASS** | Backend tests | 50 passed, 4 existing deprecation/configuration warnings. |
| **PASS** | Frontend type-check/build | TypeScript check and Next.js 15 production build passed. |
| **PASS** | Login-page browser rendering | Login form rendered with styling. |
| **NOT VERIFIED** | Browser login/logout/session expiry/organization switch E2E | Existing browser profile contained a valid session; no test credentials were used and no current user session was modified. Add isolated Playwright test credentials and exercise all flows. |
| **NOT VERIFIED** | External TLS/CORS/browser console | Local CORS was checked; no production domain, TLS proxy, or external browser deployment was available. |
| **BLOCKED** | Error monitoring/alert delivery in production | Local Prometheus/Grafana endpoints are healthy; production alert routing, retention, and incident delivery have not been configured or verified. |

## Go-live gates

Do not mark production ready until all of these are closed:

1. Configure and escrow the production AES-256 integration key ring.
2. Verify real n8n synchronization and webhook events using an isolated authorized n8n instance.
3. Verify real Gemini requests, structured output, quotas, retries, and deterministic fallback using approved credentials.
4. Deploy HTTPS ingress, set exact `TRUSTED_PROXY_IPS`, verify client-IP forwarding, and block public `/metrics`.
5. Add Playwright E2E coverage for login, refresh/expiry, logout, and organization switching using isolated test data.
6. Configure protected off-host backups, retention, and PITR; complete a production-like restore drill with defined RPO/RTO.
7. Implement and test stuck-execution detection or explicitly remove that capability from the production contract.
8. Complete a secret-history/config scan and verify production monitoring/alert delivery.

Until then, keep the deployment private and do not claim real n8n/Gemini connectivity or production recovery readiness.

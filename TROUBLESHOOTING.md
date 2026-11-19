# TROUBLESHOOTING GUIDE
## Zevkar.ai — Common Operational Scenarios

---

## 1. Vite WebSocket "WebSocket closed without opened"
- **Cause**: In reverse-proxied preview environments (Google AI Studio Cloud Run), client HMR connections to raw WS ports are blocked.
- **Remediation**: Set `DISABLE_HMR=true` in `.env`. The custom plugin in `vite.config.ts` cleanly stubs the dev client transport, preventing any failed handshake while keeping React transforms and CSS styles active.

## 2. Gemini Diagnosis Returns Fallback Result
- **Cause**: Upstream quota spike (`503 UNAVAILABLE`) or `PERMISSION_DENIED` due to insufficient OAuth scopes on the API token.
- **Inspection**: Check `fallbackReason` field in the incident response payload (`GET /api/v1/incidents/{id}`).
- **Remediation**: Ensure `GEMINI_API_KEY` is provided from a Google AI Studio project with the Generative Language API enabled.

## 3. Server Aborts on Startup in Production Mode
- **Log Message**: `[Zevkar] FATAL: Production Configuration Error(s) Detected`
- **Cause**: Running with `NODE_ENV=production` without providing persistent `DATABASE_URL` or `REDIS_URL`.
- **Remediation**: For local demo preview, set `NODE_ENV=development`. For production deployment, provide valid PostgreSQL and Redis connection strings in `.env`.

# TESTING GUIDE
## Zevkar.ai — Test Suites & Verification

---

## 1. Unit Tests
- **Location**: `src/lib/doctor-engine.test.ts` & `backend/tests/test_backend.py`
- **Execution**:
  ```bash
  npx --yes tsx --test src/lib/doctor-engine.test.ts
  ```
- **Coverage**:
  - `classifyError`: Identifies HTTP 401 (AUTH_FAILURE), HTTP 429 (RATE_LIMIT), PostgreSQL deadlock (DATABASE_FAILURE).
  - `calculateHealthScore`: Correctly computes 0–100 fleet health based on failure weight and consecutive errors.
  - `evaluateRecoverySafety`: Evaluates financial risk gates and customer-facing workflows.
  - `generateIdempotencyKey`: Generates consistent SHA-256 idempotency hashes.

## 2. Tenancy & Schema Tests
- **Location**: `backend/tests/test_tenancy.py`
- **Execution**:
  ```bash
  python3 -m pytest backend/tests/
  ```
- **Coverage**: Validates tenant isolation constraints, Pydantic schema constraints, and cross-tenant boundaries.

## 3. Headless Browser End-to-End Tests
- **Tool**: Playwright CLI (`npx playwright-cli`)
- **Execution**:
  ```bash
  npx playwright-cli open "http://localhost:3000"
  ```
- **Coverage**: Verified complete zero-console-error rendering of all 13 SaaS dashboard modules.

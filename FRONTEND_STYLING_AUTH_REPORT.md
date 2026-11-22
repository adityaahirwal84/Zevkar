# Frontend Styling and Authentication Report

## Root causes

### Tailwind styles

The frontend is using **Tailwind CSS v4** (`tailwindcss` and `@tailwindcss/postcss` 4.3.3 were installed). `globals.css` imported `tailwindcss`, so its theme variables and preflight/reset CSS appeared in the delivered asset, but the Next.js app had no PostCSS configuration to run Tailwind's PostCSS plugin. The generated stylesheet consequently contained no utility rules for classes used by the pages. The browser loaded CSS successfully, but layout, spacing, typography, and component styles did not apply.

Added the Tailwind v4 `@tailwindcss/postcss` plugin configuration and an explicit source directive for the App Router source directory. No UI components were rewritten.

### Refresh-token 401

`AuthProvider` attempted `POST /api/v1/auth/refresh` during initialization on every route when no access token was in `sessionStorage`, including the public login page. For an unauthenticated visitor, no refresh cookie is expected, and the backend correctly responds 401. This was not a cookie-path or fetch-credentials mismatch.

The provider now skips session bootstrap on `/` and `/login` when there is no stored access token. Protected routes still try the HttpOnly refresh cookie when needed; an absent or expired cookie is rejected, the session is cleared, and the dashboard redirects to login. Authentication requirements were not loosened.

Cookie and request configuration were verified from source and runtime:

- Browser API calls use `credentials: 'include'` and same-origin Next.js rewrites.
- Refresh cookie is HttpOnly, scoped to `/api/v1/auth`, and `SameSite=Lax`.
- `Secure` is enabled in production and omitted for local HTTP development.
- Logout expires the same cookie path.

## Files changed

- [frontend/postcss.config.mjs](./frontend/postcss.config.mjs) — configures the Tailwind v4 PostCSS plugin.
- [frontend/app/globals.css](./frontend/app/globals.css) — explicitly scans the App Router source directory.
- [frontend/app/providers.tsx](./frontend/app/providers.tsx) — avoids a pointless refresh-cookie probe on public pages without an access token.
- [backend/tests/test_phase2_api_contract.py](./backend/tests/test_phase2_api_contract.py) — asserts refresh-cookie scope/security attributes and logout cookie expiry.
- [FRONTEND_STYLING_AUTH_REPORT.md](./FRONTEND_STYLING_AUTH_REPORT.md) — this report.

## Validation and actual results

### CSS and browser

- `npm run build` — **passed**, Next.js 15.5.28 production build.
- `npx tsc --noEmit` — **passed**.
- Parsed the generated production CSS: **270 CSS rules**; required utilities `.min-h-screen`, `.flex`, `.items-center`, `.justify-center`, `.rounded-2xl`, `.bg-indigo-600`, `.text-2xl`, and `.w-full` were present.
- Rebuilt and restarted only the frontend Compose service. The stylesheet actually served at `http://localhost:3000/login` returned HTTP 200 and contained the same required utility selectors.
- Browser computed styles on the login page confirmed flex layout, a padded card, 24px heading, and styled indigo full-width button. The home page computed styles confirmed the flex hero layout, spacing, 36px heading, and responsive grid.
- Reloading the login page on the updated server produced **zero** refresh endpoint requests for an unauthenticated visitor. The earlier stale asset was replaced with the rebuilt CSS asset.
- On a protected dashboard with no valid session, the refresh request is still correctly rejected and the user is redirected to login. No protected content is granted.

### Authentication

- Browser login with invalid credentials displayed the backend's `Invalid email or password` response instead of a success state.
- Through the real same-origin Next.js API rewrite, an isolated temporary test account completed signup (201), logout (200), valid login (200), refresh/rotation (200), and logout (200); the refresh cookie was removed. The test user and organization were then deleted and cleanup was verified.
- A browser page reload on the already-authenticated dashboard retained the session and showed the database-ready dashboard. The existing browser session was not logged out or otherwise altered.
- `python -m pytest -q tests/test_phase2_api_contract.py` — **6 passed**.
- `python -m pytest -q` — **31 passed**, 4 warnings (existing Pydantic/passlib/pytest-asyncio deprecations).
- Docker Compose reported the frontend container healthy. `GET http://localhost:8000/health/ready` returned HTTP 200 with PostgreSQL and Redis connected.

## Commands executed

```powershell
Set-Location 'C:\Users\vinod\Downloads\ai-automation-doctor-platform\frontend'
npm run build
npx tsc --noEmit
```

Additional verification used a Node/PostCSS script against the generated stylesheet and against the CSS served from `http://localhost:3000/login`.

```powershell
Set-Location 'C:\Users\vinod\Downloads\ai-automation-doctor-platform'
docker compose build frontend
docker compose up -d --no-deps frontend
docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Health}}'
```

```powershell
Set-Location 'C:\Users\vinod\Downloads\ai-automation-doctor-platform\backend'
python -m pytest -q tests/test_phase2_api_contract.py
python -m pytest -q
```

An inline Python `urllib`/cookie-jar test exercised the real signup, login, refresh rotation, logout, and cleanup flow through the frontend rewrite. Browser verification used the shared localhost page and computed-style inspection. A temporary verification server on port 3002 was stopped after testing.

## CSP note

The reported `content_js` `unsafe-eval` message was not reproduced as an application-origin error during the updated page checks. No application CSP was weakened or changed. Since the message names a content script rather than an application file, confirm its source by retesting with browser extensions disabled; attribution to a specific extension was not independently verified.

## Limitations

The valid login/refresh/logout lifecycle was exercised with an isolated temporary account through the real frontend proxy and then cleaned up. The existing browser account was preserved, so its Sign out button was not clicked. No browser extension configuration was changed.

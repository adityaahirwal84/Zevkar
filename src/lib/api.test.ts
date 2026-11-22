import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apiJson,
  ApiError,
  authFetch,
  getAccessToken,
  normalizeApiResponse,
  setAccessToken,
} from './api';

const originalFetch = globalThis.fetch;

test('normalizeApiResponse converts nested FastAPI snake_case fields to frontend camelCase', () => {
  assert.deepEqual(
    normalizeApiResponse({
      agency_id: 'agency-1',
      recent_executions: [{ workflow_id: 'workflow-1', duration_ms: 42 }],
      error_payload: { remote_field: 'preserved as camelCase for UI consumption' },
    }),
    {
      agencyId: 'agency-1',
      recentExecutions: [{ workflowId: 'workflow-1', durationMs: 42 }],
      errorPayload: { remoteField: 'preserved as camelCase for UI consumption' },
    }
  );
});

test('authFetch sends the in-memory access token and includes same-origin cookies', async () => {
  const calls: Array<{ url: string; authorization: string | null; credentials: RequestCredentials | undefined }> = [];
  setAccessToken('access-session');
  globalThis.fetch = (async (input, init) => {
    calls.push({
      url: String(input),
      authorization: new Headers(init?.headers).get('Authorization'),
      credentials: init?.credentials,
    });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;

  try {
    const response = await authFetch('/api/v1/workflows');
    assert.equal(response.status, 200);
    assert.equal(calls[0].authorization, 'Bearer access-session');
    assert.equal(calls[0].credentials, 'include');
    assert.equal(getAccessToken(), 'access-session');
  } finally {
    setAccessToken(null);
    globalThis.fetch = originalFetch;
  }
});

test('authFetch never sends the access token or cookies to an unconfigured origin', async () => {
  let authorization: string | null = null;
  let credentials: RequestCredentials | undefined;
  setAccessToken('access-session');
  globalThis.fetch = (async (_input, init) => {
    authorization = new Headers(init?.headers).get('Authorization');
    credentials = init?.credentials;
    return new Response('[]', { status: 200 });
  }) as typeof fetch;

  try {
    await authFetch('https://outside.example/resource');
    assert.equal(authorization, null);
    assert.equal(credentials, 'omit');
  } finally {
    setAccessToken(null);
    globalThis.fetch = originalFetch;
  }
});

test('authFetch refreshes once after 401 and retries with the returned access_token', async () => {
  const calls: Array<{ url: string; authorization: string | null }> = [];
  setAccessToken('expired-access');
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const authorization = new Headers(init?.headers).get('Authorization');
    calls.push({ url, authorization });

    if (url.endsWith('/api/v1/auth/refresh')) {
      return Response.json({ access_token: 'rotated-access', refresh_token: null });
    }
    if (authorization === 'Bearer expired-access') {
      return Response.json({ detail: 'Expired' }, { status: 401 });
    }
    return Response.json([{ id: 'workflow-1' }]);
  }) as typeof fetch;

  try {
    const workflows = await apiJson<Array<{ id: string }>>('/api/v1/workflows');
    assert.deepEqual(workflows, [{ id: 'workflow-1' }]);
    assert.equal(getAccessToken(), 'rotated-access');
    assert.equal(calls.filter((call) => call.url.endsWith('/api/v1/auth/refresh')).length, 1);
    assert.deepEqual(
      calls.filter((call) => call.url.endsWith('/api/v1/workflows')).map((call) => call.authorization),
      ['Bearer expired-access', 'Bearer rotated-access']
    );
  } finally {
    setAccessToken(null);
    globalThis.fetch = originalFetch;
  }
});

test('403 responses do not trigger token refresh', async () => {
  const calls: string[] = [];
  setAccessToken('valid-access');
  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return Response.json({ detail: 'Insufficient role' }, { status: 403 });
  }) as typeof fetch;

  try {
    const response = await authFetch('/api/v1/workflows');
    assert.equal(response.status, 403);
    assert.equal(calls.length, 1);
  } finally {
    setAccessToken(null);
    globalThis.fetch = originalFetch;
  }
});

test('apiJson surfaces FastAPI error details without refreshing login requests', async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return Response.json({ detail: 'Invalid email or password' }, { status: 401 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      apiJson('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'user@example.com' }) }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 401 &&
        error.message === 'Invalid email or password'
    );
    assert.equal(calls.length, 1);
  } finally {
    setAccessToken(null);
    globalThis.fetch = originalFetch;
  }
});

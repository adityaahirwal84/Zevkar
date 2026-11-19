import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../../frontend/lib/api-client';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

test('frontend api-client sends Bearer token, updates SLA/alerts, handles invitation endpoints, and parses ApiError', async () => {
  const origWindow = (globalThis as any).window;
  const origLocalStorage = (globalThis as any).localStorage;
  const origFetch = globalThis.fetch;

  const memStorage = createMemoryStorage();
  memStorage.setItem('access_token', 'tok_initial_123');
  memStorage.setItem('refresh_token', 'rt_initial_456');

  (globalThis as any).window = {};
  (globalThis as any).localStorage = memStorage;

  const recordedCalls: Array<{ url: string; method: string; auth?: string | null }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers || {});
    recordedCalls.push({
      url,
      method: init?.method || 'GET',
      auth: headers.get('Authorization'),
    });

    if (url.endsWith('/api/v1/sla/report') && headers.get('Authorization') === 'Bearer tok_initial_123') {
      // Simulate expired token on first request to verify automatic refresh flow
      return new Response(JSON.stringify({ detail: 'Expired token' }), { status: 401 });
    }
    if (url.endsWith('/api/v1/auth/refresh')) {
      return new Response(
        JSON.stringify({ access_token: 'tok_refreshed_789', refresh_token: 'rt_refreshed_999' }),
        { status: 200 }
      );
    }
    if (url.endsWith('/api/v1/sla/report')) {
      return new Response(JSON.stringify({ status: 'COMPLIANT', currentSuccessRatePercent: 99.6 }), { status: 200 });
    }
    if (url.endsWith('/api/v1/alerts/rules/rule_1') && init?.method === 'PUT') {
      return new Response(JSON.stringify({ id: 'rule_1', is_enabled: false }), { status: 200 });
    }
    if (url.endsWith('/api/v1/orgs/invitations/inv_tok_1/accept') && init?.method === 'POST') {
      return new Response(JSON.stringify({ success: true, agency_id: 'ag_1', role: 'MEMBER' }), { status: 200 });
    }
    if (url.endsWith('/api/v1/alerts/channels')) {
      return new Response(JSON.stringify({ detail: 'Loopback hosts are prohibited' }), { status: 400 });
    }
    if (url.endsWith('/api/v1/workflows/wf_1/timeout') && init?.method === 'PATCH') {
      return new Response(JSON.stringify({ id: 'wf_1', stuck_timeout_seconds: 1800, allow_long_running: true }), {
        status: 200,
      });
    }
    if (url.endsWith('/api/v1/incidents/inc_1/diagnose') && init?.method === 'POST') {
      return new Response(
        JSON.stringify({
          id: 'diag_1',
          verified_facts: ['Execution ID: exec_1'],
          ai_hypotheses: ['Upstream rate limit'],
          is_ai_generated: true,
        }),
        { status: 200 }
      );
    }
    if (url.endsWith('/api/v1/incidents/inc_1/status') && init?.method === 'PUT') {
      return new Response(JSON.stringify({ success: true, id: 'inc_1', status: 'INVESTIGATING' }), { status: 200 });
    }
    if (url.endsWith('/api/v1/recovery/requests/rec_1/verify') && init?.method === 'POST') {
      return new Response(
        JSON.stringify({ success: true, status: 'SUCCEEDED', verification_status: 'VERIFIED_SUCCESS' }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    const report = await api.sla.getReport();
    assert.equal(report.status, 'COMPLIANT');
    assert.equal(memStorage.getItem('access_token'), 'tok_refreshed_789');

    const updatedRule = await api.alerts.updateRule('rule_1', { is_enabled: false });
    assert.equal(updatedRule.is_enabled, false);

    const inviteAccept = await api.orgs.acceptInvitation('inv_tok_1', {
      name: 'Jordan Lee',
      password: 'Password123!',
    });
    assert.equal(inviteAccept.role, 'MEMBER');

    const timeoutRes = await api.workflows.updateTimeout('wf_1', {
      stuck_timeout_seconds: 1800,
      allow_long_running: true,
    });
    assert.equal(timeoutRes.stuck_timeout_seconds, 1800);

    const diagRes = await api.diagnosis.trigger('inc_1');
    assert.equal(diagRes.verified_facts[0], 'Execution ID: exec_1');

    const statusRes = await api.incidents.updateStatus('inc_1', 'INVESTIGATING');
    assert.equal(statusRes.status, 'INVESTIGATING');

    const verifyRes = await api.recovery.verifyRequest('rec_1');
    assert.equal(verifyRes.verification_status, 'VERIFIED_SUCCESS');

    await assert.rejects(
      () =>
        api.alerts.createChannel({
          name: 'Local SSRF',
          channel_type: 'CUSTOM_WEBHOOK',
          target_url: 'http://127.0.0.1:8080/hook',
        }),
      (err: unknown) => err instanceof ApiError && err.status === 400 && err.message.includes('Loopback')
    );

    assert.ok(recordedCalls.some((c) => c.url.endsWith('/api/v1/auth/refresh')));
    assert.ok(recordedCalls.some((c) => c.url.endsWith('/api/v1/alerts/rules/rule_1') && c.method === 'PUT'));
    assert.ok(recordedCalls.some((c) => c.url.endsWith('/api/v1/workflows/wf_1/timeout') && c.method === 'PATCH'));
    assert.ok(recordedCalls.some((c) => c.url.endsWith('/api/v1/recovery/requests/rec_1/verify') && c.method === 'POST'));
  } finally {
    globalThis.fetch = origFetch;
    (globalThis as any).window = origWindow;
    (globalThis as any).localStorage = origLocalStorage;
  }
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deduplicateExecutions,
  evaluateStuckExecutions,
  extractN8nErrorDetails,
  fetchN8nPaginated,
  normalizeN8nExecution,
  validateExternalN8nUrl,
} from './n8n-sync';
import { Workflow } from '../types';

describe('n8n Sync Engine Pure Logic', () => {
  it('blocks private/SSRF integration URLs and allows public HTTPS URLs', () => {
    assert.equal(validateExternalN8nUrl('https://n8n.acme.com/'), 'https://n8n.acme.com');
    assert.throws(() => validateExternalN8nUrl('http://127.0.0.1:5678'));
    assert.throws(() => validateExternalN8nUrl('http://169.254.169.254/latest/meta-data'));
    assert.throws(() => validateExternalN8nUrl('ftp://n8n.acme.com'));
  });

  it('extracts structured node error details and normalizes execution timestamps', () => {
    const raw = {
      id: 7741,
      workflowId: 'wf_ext_99',
      status: 'error',
      startedAt: '2026-05-01T10:00:00.000Z',
      stoppedAt: '2026-05-01T10:00:03.500Z',
      mode: 'webhook',
      data: {
        resultData: {
          lastNodeExecuted: 'NetSuite HTTP',
          error: {
            message: '429 Too Many Requests',
            httpCode: 429,
          },
        },
      },
    };

    const details = extractN8nErrorDetails(raw);
    assert.equal(details.errorMessage, '[NetSuite HTTP] 429 Too Many Requests');

    const normalized = normalizeN8nExecution(raw, {
      workflowId: 'wf_1',
      integrationId: 'int_1',
      workflowName: 'Stripe Sync',
      clientName: 'FinEdge Global',
    });
    assert.equal(normalized.status, 'FAILED');
    assert.equal(normalized.durationMs, 3500);
    assert.equal(normalized.externalExecutionId, '7741');
  });

  it('deduplicates executions while updating running -> terminal state transitions', () => {
    const initial = [
      normalizeN8nExecution(
        { id: '10', workflowId: 'w1', status: 'running', startedAt: '2026-05-01T10:00:00Z' },
        { workflowId: 'wf_1', integrationId: 'int_1', workflowName: 'Flow A', clientName: 'Acme' }
      ),
    ];

    const incoming = [
      normalizeN8nExecution(
        {
          id: '10',
          workflowId: 'w1',
          status: 'success',
          startedAt: '2026-05-01T10:00:00Z',
          stoppedAt: '2026-05-01T10:00:02Z',
        },
        { workflowId: 'wf_1', integrationId: 'int_1', workflowName: 'Flow A', clientName: 'Acme' }
      ),
      normalizeN8nExecution(
        {
          id: '11',
          workflowId: 'w1',
          status: 'error',
          startedAt: '2026-05-01T10:05:00Z',
          stoppedAt: '2026-05-01T10:05:01Z',
        },
        { workflowId: 'wf_1', integrationId: 'int_1', workflowName: 'Flow A', clientName: 'Acme' }
      ),
    ];

    const result = deduplicateExecutions(initial, incoming);
    assert.equal(result.merged.length, 2);
    assert.equal(result.addedCount, 1);
    assert.equal(result.updatedCount, 1);
    assert.equal(result.merged[1].status, 'SUCCESS');
  });

  it('handles cursor pagination and 429 Retry-After backoff cleanly', async () => {
    const delays: number[] = [];
    let callCount = 0;

    const result = await fetchN8nPaginated<{ id: string }>(
      async (cursor) => {
        callCount += 1;
        if (callCount === 1) {
          return { status: 429, retryAfterHeader: '0.2' };
        }
        if (!cursor) {
          return { status: 200, data: [{ id: 'a' }], nextCursor: 'cur_2' };
        }
        return { status: 200, data: [{ id: 'b' }], nextCursor: null };
      },
      {
        sleepFn: async (ms) => {
          delays.push(ms);
        },
      }
    );

    assert.equal(result.items.length, 2);
    assert.equal(result.pagesFetched, 2);
    assert.deepEqual(delays, [200]);
  });

  it('detects stuck executions while honoring long-running and per-workflow timeout overrides', () => {
    const nowMs = Date.parse('2026-05-01T12:00:00Z');
    const workflows: Workflow[] = [
      {
        id: 'wf_std',
        agencyId: 'ag_1',
        clientId: 'c1',
        clientName: 'C1',
        integrationId: 'i1',
        platform: 'n8n',
        externalWorkflowId: '1',
        name: 'Standard Flow',
        isActive: true,
        healthStatus: 'HEALTHY',
        consecutiveFailures: 0,
        avgDurationMs: 500,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'wf_long',
        agencyId: 'ag_1',
        clientId: 'c1',
        clientName: 'C1',
        integrationId: 'i1',
        platform: 'n8n',
        externalWorkflowId: '2',
        name: 'Long ETL',
        isActive: true,
        allowLongRunning: true,
        healthStatus: 'HEALTHY',
        consecutiveFailures: 0,
        avgDurationMs: 500,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    const executions = [
      normalizeN8nExecution(
        { id: '1', workflowId: '1', status: 'running', startedAt: '2026-05-01T11:30:00Z' },
        { workflowId: 'wf_std', integrationId: 'i1', workflowName: 'Standard Flow', clientName: 'C1' }
      ),
      normalizeN8nExecution(
        { id: '2', workflowId: '2', status: 'running', startedAt: '2026-05-01T11:00:00Z' },
        { workflowId: 'wf_long', integrationId: 'i1', workflowName: 'Long ETL', clientName: 'C1' }
      ),
    ];

    const stuck = evaluateStuckExecutions(executions, workflows, nowMs, 900, 14400);
    assert.equal(stuck.length, 1);
    assert.equal(stuck[0].execution.workflowId, 'wf_std');
  });
});

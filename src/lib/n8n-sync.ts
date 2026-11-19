import { Execution, PlatformType, Workflow } from '../types';

export interface RawN8nExecution {
  id?: string | number;
  workflowId?: string | number;
  status?: string;
  finished?: boolean;
  startedAt?: string;
  stoppedAt?: string;
  mode?: string;
  data?: {
    resultData?: {
      lastNodeExecuted?: string;
      error?: {
        name?: string;
        message?: string;
        description?: string;
        httpCode?: string | number;
        node?: { name?: string };
        context?: Record<string, unknown>;
      };
    };
  };
}

export function validateExternalN8nUrl(rawUrl: string, allowPrivate = false): string {
  const trimmed = (rawUrl || '').trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid instance URL format.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Integration URL must use http or https protocol.');
  }

  const host = parsed.hostname.toLowerCase();
  if (!allowPrivate) {
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('169.254.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith('.local')
    ) {
      throw new Error(`Blocked private or loopback integration host: ${host}`);
    }
  }

  return trimmed.replace(/\/+$/, '');
}

export function extractN8nErrorDetails(raw: RawN8nExecution): {
  errorMessage?: string;
  errorPayload?: Record<string, unknown>;
} {
  const resultData = raw.data?.resultData;
  const errObj = resultData?.error;

  if (errObj) {
    const nodeName = errObj.node?.name || resultData?.lastNodeExecuted;
    const baseMsg = errObj.message || errObj.description || 'n8n execution failed';
    return {
      errorMessage: nodeName ? `[${nodeName}] ${baseMsg}` : baseMsg,
      errorPayload: {
        node: nodeName,
        name: errObj.name,
        httpCode: errObj.httpCode,
        description: errObj.description,
      },
    };
  }

  const rawStatus = (raw.status || '').toLowerCase();
  if (rawStatus === 'error' || rawStatus === 'crashed' || rawStatus === 'failed') {
    const node = resultData?.lastNodeExecuted;
    return {
      errorMessage: `${node ? `[${node}] ` : ''}n8n workflow execution ended with status '${rawStatus}'.`,
      errorPayload: { node, status: rawStatus },
    };
  }

  return {};
}

export function normalizeN8nExecution(
  raw: RawN8nExecution,
  ctx: {
    workflowId: string;
    integrationId: string;
    workflowName: string;
    clientName: string;
    platform?: PlatformType;
  }
): Execution {
  let rawStatus = (raw.status || '').toLowerCase();
  if (!rawStatus) {
    rawStatus = raw.finished === true ? 'success' : 'running';
  }

  let status: Execution['status'] = 'RUNNING';
  if (rawStatus === 'success') status = 'SUCCESS';
  else if (rawStatus === 'error' || rawStatus === 'crashed' || rawStatus === 'failed') status = 'FAILED';
  else if (rawStatus === 'canceled' || rawStatus === 'cancelled') status = 'TIMED_OUT';
  else if (rawStatus === 'running' || rawStatus === 'waiting' || rawStatus === 'new') status = 'RUNNING';
  else status = raw.finished ? 'SUCCESS' : 'RUNNING';

  const startedAt = raw.startedAt ? new Date(raw.startedAt).toISOString() : new Date().toISOString();
  const finishedAt = raw.stoppedAt ? new Date(raw.stoppedAt).toISOString() : undefined;
  const durationMs =
    finishedAt && startedAt
      ? Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt))
      : 0;

  const { errorMessage, errorPayload } = extractN8nErrorDetails(raw);
  const extId = String(raw.id || `exec_${Date.now()}`);

  return {
    id: `exec_${ctx.workflowId}_${extId}`,
    workflowId: ctx.workflowId,
    integrationId: ctx.integrationId,
    externalExecutionId: extId,
    workflowName: ctx.workflowName,
    clientName: ctx.clientName,
    platform: ctx.platform || 'n8n',
    status,
    rawStatus,
    startedAt,
    finishedAt,
    durationMs,
    mode: raw.mode,
    isStuckAlerted: false,
    errorMessage: errorMessage || (status === 'FAILED' ? 'n8n execution failed without error details.' : undefined),
    errorPayload,
    retryCount: 0,
  };
}

export function deduplicateExecutions(existing: Execution[], incoming: Execution[]): {
  merged: Execution[];
  addedCount: number;
  updatedCount: number;
} {
  const byKey = new Map<string, Execution>();
  for (const ex of existing) {
    const key = `${ex.workflowId}::${ex.externalExecutionId || ex.id}`;
    byKey.set(key, { ...ex });
  }

  let addedCount = 0;
  let updatedCount = 0;

  for (const item of incoming) {
    const key = `${item.workflowId}::${item.externalExecutionId || item.id}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, item);
      addedCount += 1;
    } else if (
      prev.status !== item.status ||
      (item.finishedAt && prev.finishedAt !== item.finishedAt)
    ) {
      byKey.set(key, {
        ...prev,
        status: item.status,
        rawStatus: item.rawStatus ?? prev.rawStatus,
        finishedAt: item.finishedAt ?? prev.finishedAt,
        durationMs: item.durationMs || prev.durationMs,
        errorMessage: item.errorMessage ?? prev.errorMessage,
        errorPayload: item.errorPayload ?? prev.errorPayload,
      });
      updatedCount += 1;
    }
  }

  const merged = Array.from(byKey.values()).sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)
  );
  return { merged, addedCount, updatedCount };
}

export function computeStuckTimeoutSeconds(
  workflow?: Pick<Workflow, 'stuckTimeoutSeconds' | 'allowLongRunning'>,
  defaultThresholdSec = 900,
  longRunningThresholdSec = 14400
): number {
  if (workflow?.stuckTimeoutSeconds && workflow.stuckTimeoutSeconds > 0) {
    return workflow.stuckTimeoutSeconds;
  }
  if (workflow?.allowLongRunning) {
    return longRunningThresholdSec;
  }
  return defaultThresholdSec;
}

export function evaluateStuckExecutions(
  executions: Execution[],
  workflows: Workflow[],
  nowMs = Date.now(),
  defaultThresholdSec = 900,
  longRunningThresholdSec = 14400
): Array<{ execution: Execution; workflow?: Workflow; elapsedSeconds: number; thresholdSeconds: number }> {
  const wfById = new Map(workflows.map((w) => [w.id, w]));
  const stuck: Array<{ execution: Execution; workflow?: Workflow; elapsedSeconds: number; thresholdSeconds: number }> = [];

  for (const exec of executions) {
    if (exec.status !== 'RUNNING' || exec.isStuckAlerted) continue;
    const wf = wfById.get(exec.workflowId);
    if (wf && !wf.isActive) continue;

    const thresholdSeconds = computeStuckTimeoutSeconds(wf, defaultThresholdSec, longRunningThresholdSec);
    const startedMs = Date.parse(exec.startedAt);
    if (Number.isNaN(startedMs)) continue;

    const elapsedSeconds = Math.floor((nowMs - startedMs) / 1000);
    if (elapsedSeconds > thresholdSeconds) {
      stuck.push({ execution: exec, workflow: wf, elapsedSeconds, thresholdSeconds });
    }
  }

  return stuck;
}

export interface PaginatedFetchResult<T> {
  items: T[];
  lastCursor: string | null;
  pagesFetched: number;
}

export async function fetchN8nPaginated<T>(
  fetchPage: (cursor?: string) => Promise<{
    status: number;
    retryAfterHeader?: string | null;
    data?: T[];
    nextCursor?: string | null;
  }>,
  options: {
    maxPages?: number;
    maxRetries?: number;
    sleepFn?: (ms: number) => Promise<void>;
  } = {}
): Promise<PaginatedFetchResult<T>> {
  const maxPages = options.maxPages ?? 20;
  const maxRetries = options.maxRetries ?? 3;
  const sleepFn = options.sleepFn ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let lastCursor: string | null = null;
  let pagesFetched = 0;

  for (let page = 0; page < maxPages; page++) {
    let response: Awaited<ReturnType<typeof fetchPage>> | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetchPage(cursor);
      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
        if (attempt < maxRetries) {
          const parsedHeader = res.retryAfterHeader ? parseFloat(res.retryAfterHeader) : NaN;
          const delaySec = !Number.isNaN(parsedHeader) ? parsedHeader : Math.pow(2, attempt);
          const delayMs = Math.min(Math.max(delaySec * 1000, 50), 30000);
          await sleepFn(delayMs);
          continue;
        }
        throw new Error(`n8n API failed after retries with HTTP ${res.status}`);
      }
      if (res.status >= 400) {
        throw new Error(`n8n API returned HTTP ${res.status}`);
      }
      response = res;
      break;
    }

    if (!response) break;
    pagesFetched += 1;

    if (Array.isArray(response.data)) {
      items.push(...response.data);
    }

    const nextCursor = response.nextCursor || null;
    lastCursor = nextCursor;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      break;
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return { items, lastCursor, pagesFetched };
}

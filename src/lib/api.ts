const configuredBaseUrl = import.meta.env?.VITE_API_BASE_URL ?? '';
export const API_BASE_URL = configuredBaseUrl.replace(/\/+$/, '');
export const AUTH_SESSION_EXPIRED_EVENT = 'zevkar:auth-session-expired';

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export interface AuthTokenResponse {
  access_token: string;
  refresh_token?: string | null;
  token_type: string;
  user: {
    id: string;
    email: string;
    name: string;
    created_at: string;
  };
}

export interface AuthProfileResponse {
  user: {
    id: string;
    email: string;
    name: string;
    timezone: string;
    role: string;
    agencyId: string;
    createdAt: string;
  };
  agency: {
    id: string;
    name: string;
    slug: string;
    tier: string;
    contactEmail: string;
    timezone: string;
    onboardingStep: number;
    onboardingCompleted: boolean;
    createdAt: string;
    clientsCount: number;
    workflowsCount: number;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function apiUrl(path: string | URL): string {
  const value = String(path);
  if (/^(https?:)?\/\//i.test(value)) {
    return value;
  }

  const normalizedPath = value.startsWith('/') ? value : `/${value}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export function getAccessToken(): string | null {
  return accessToken;
}

function camelizeKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, character: string) => character.toUpperCase());
}

export function normalizeApiResponse<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeApiResponse(item)) as T;
  }
  if (value && typeof value === 'object') {
    const normalized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      normalized[camelizeKey(key)] = normalizeApiResponse(nestedValue);
    }
    return normalized as T;
  }
  return value;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

function requestPath(input: RequestInfo | URL): string {
  const value = typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input);
  return value.split(/[?#]/, 1)[0];
}

function isApiTarget(input: RequestInfo | URL): boolean {
  const value = typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input);
  if (!/^(https?:)?\/\//i.test(value)) {
    return true;
  }

  const expectedOrigin = API_BASE_URL
    ? new URL(API_BASE_URL, typeof window === 'undefined' ? 'http://localhost' : window.location.origin).origin
    : typeof window === 'undefined'
      ? null
      : window.location.origin;
  if (!expectedOrigin) {
    return false;
  }

  try {
    return new URL(value, typeof window === 'undefined' ? 'http://localhost' : window.location.origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function isAuthEntryPoint(input: RequestInfo | URL): boolean {
  return /\/api\/v1\/auth\/(login|signup|refresh)$/.test(requestPath(input));
}

function dispatchSessionExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
  }
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError('The server returned an invalid JSON response.', response.status, text);
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    const body = payload as Record<string, unknown>;
    const detail = body.detail ?? body.error ?? body.message;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (item && typeof item === 'object' && 'msg' in item && typeof item.msg === 'string') {
            return item.msg;
          }
          return String(item);
        })
        .join('; ');
    }
  }
  return fallback;
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const response = await fetch(apiUrl('/api/v1/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (response.status === 401 || response.status === 403) {
      accessToken = null;
      return null;
    }

    const payload = await readJson(response);
    if (!response.ok) {
      throw new ApiError(errorMessage(payload, response.statusText), response.status, payload);
    }
    if (!payload || typeof payload !== 'object' || typeof (payload as Record<string, unknown>).access_token !== 'string') {
      throw new ApiError('The refresh response did not contain an access token.', response.status, payload);
    }

    accessToken = (payload as Record<string, string>).access_token;
    return accessToken;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

function requestHeaders(input: RequestInfo | URL, init: RequestInit, token: string | null): Headers {
  const headers = new Headers(
    typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined
  );
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const trustedTarget = isApiTarget(input);
  if (token && trustedTarget) {
    headers.set('Authorization', `Bearer ${token}`);
  } else if (!trustedTarget) {
    headers.delete('Authorization');
  }
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');
  return headers;
}

async function send(input: RequestInfo | URL, init: RequestInit, token: string | null): Promise<Response> {
  const request =
    typeof Request !== 'undefined' && input instanceof Request
      ? input.clone()
      : apiUrl(input as string | URL);
  return fetch(request, {
    ...init,
    credentials: isApiTarget(input) ? init.credentials ?? 'include' : 'omit',
    headers: requestHeaders(input, init, token),
  });
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const response = await send(input, init, accessToken);
  if (response.status !== 401 || isAuthEntryPoint(input)) {
    return response;
  }

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) {
    accessToken = null;
    dispatchSessionExpired();
    return response;
  }

  const retriedResponse = await send(input, init, refreshedToken);
  if (retriedResponse.status === 401) {
    accessToken = null;
    dispatchSessionExpired();
  }
  return retriedResponse;
}

export async function apiJson<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const response = await authFetch(input, init);
  const payload = await readJson(response);
  if (!response.ok) {
    throw new ApiError(errorMessage(payload, response.statusText), response.status, payload);
  }
  return payload as T;
}

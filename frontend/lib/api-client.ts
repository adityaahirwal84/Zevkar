/**
 * Zevkar AI - Typed FastAPI Client
 * Communicates with the FastAPI backend at /api/v1/*
 */

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || '')
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');

export interface ApiErrorResponse {
  detail: string | { loc: string[]; msg: string; type: string }[];
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refresh_token');
}

export function hasStoredToken(): boolean {
  return Boolean(getStoredToken());
}

export function setStoredToken(token: string, refreshToken?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('access_token', token);
  if (refreshToken) {
    localStorage.setItem('refresh_token', refreshToken);
  }
}

export function setStoredUserRole(role: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('deltaai_user_role', role);
}

export function getStoredUserRole(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('deltaai_user_role');
}

export function getDashboardRouteForRole(role?: string | null): string {
  switch (role) {
    case 'OWNER':
    case 'ADMIN':
    case 'MEMBER':
    case 'VIEWER':
    default:
      return '/dashboard';
  }
}

export function resolveCtaHref(
  isAuthenticated: boolean,
  role?: string | null,
  unauthenticatedHref = '/signup'
): string {
  return isAuthenticated ? getDashboardRouteForRole(role) : unauthenticatedHref;
}

export function clearStoredTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('deltaai_user_role');
}

async function tryRefreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      clearStoredTokens();
      return false;
    }
    const data = await res.json();
    if (data?.access_token) {
      setStoredToken(data.access_token, data.refresh_token || refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  hasRetried = false
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (
    response.status === 401 &&
    !hasRetried &&
    !endpoint.startsWith('/api/v1/auth/login') &&
    !endpoint.startsWith('/api/v1/auth/signup') &&
    !endpoint.startsWith('/api/v1/auth/refresh')
  ) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      return request<T>(endpoint, options, true);
    }
  }

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson && typeof errJson.detail === 'string') {
        errorDetail = errJson.detail;
      } else if (errJson && Array.isArray(errJson.detail)) {
        errorDetail = errJson.detail.map((d: { msg: string }) => d.msg).join(', ');
      }
    } catch {
      // response is not JSON
    }
    throw new ApiError(response.status, errorDetail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// ============================================================================
// Typed Endpoints
// ============================================================================

export const api = {
  // Health
  health: {
    check: () => request<{ status: string; environment: string }>('/health'),
    ready: () => request<{ status: string; database: string; redis: string }>('/health/ready'),
  },

  // Auth
  auth: {
    signup: (payload: { email: string; name: string; password: string; agency_name: string }) =>
      request<{ access_token: string; refresh_token: string; token_type: string }>('/api/v1/auth/signup', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    login: (payload: { email: string; password: string }) =>
      request<{ access_token: string; refresh_token: string; token_type: string }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    refresh: (refresh_token: string) =>
      request<{ access_token: string; refresh_token: string; token_type: string }>('/api/v1/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token }),
      }),
    me: async () => {
      const res = await request<any>('/api/v1/auth/me');
      if (res?.user) {
        return {
          id: res.user.id,
          email: res.user.email,
          name: res.user.name,
          timezone: res.user.timezone || res.agency?.timezone || 'UTC',
          agency_id: res.user.agencyId || res.user.agency_id || res.agency?.id || '',
          role: res.user.role,
        };
      }
      return res as { id: string; email: string; name: string; timezone?: string; agency_id: string; role: string };
    },
    updateTimezone: (timezone: string) =>
      request<{ success: boolean; timezone: string }>('/api/v1/auth/timezone', {
        method: 'PUT',
        body: JSON.stringify({ timezone }),
      }),
    updateProfile: (payload: { name: string }) =>
      request<{ id: string; email: string; name: string }>('/api/v1/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    changePassword: (payload: { old_password: string; new_password: string }) =>
      request<{ status?: string; success?: boolean; message: string }>('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    logout: () =>
      request<{ status?: string; success?: boolean; message: string }>('/api/v1/auth/logout', {
        method: 'POST',
      }),
    forgotPassword: (email: string) =>
      request<{
        status?: string;
        success?: boolean;
        message: string;
        reset_token?: string;
        dev_reset_token?: string;
        email_delivery?: string;
      }>('/api/v1/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    resetPassword: (payload: { token: string; new_password: string }) =>
      request<{ status: string; message: string }>('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    resendVerification: (email: string) =>
      request<{ status?: string; success?: boolean; message: string }>('/api/v1/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    verifyEmail: (token: string) =>
      request<{ status: string; message: string; email?: string }>('/api/v1/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
  },

  // Organizations & Onboarding
  orgs: {
    current: () =>
      request<{
        id: string;
        name: string;
        slug: string;
        tier: string;
        contact_email: string;
        timezone?: string;
        onboarding_step?: number;
        onboarding_completed?: boolean;
        onboarding_completed_at?: string | null;
      }>('/api/v1/orgs/current'),
    members: () => request<Array<{ id: string; user_id: string; name?: string; email?: string; role: string; status: string }>>('/api/v1/orgs/members'),
    invitations: () =>
      request<Array<{ id: string; email: string; role: string; status: string; token: string; expires_at: string }>>('/api/v1/orgs/invitations'),
    inviteMember: (payload: { email: string; name?: string; role: string }) =>
      request<{ status: string; invitation_id: string; token: string }>('/api/v1/orgs/members/invite', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getInvitation: (token: string) =>
      request<{
        valid: boolean;
        status: string;
        email: string;
        role: string;
        expires_at: string;
        agency_name: string;
        account_exists?: boolean;
      }>(`/api/v1/orgs/invitations/${encodeURIComponent(token)}`),
    acceptInvitation: (token: string, payload?: { name?: string; password?: string }) =>
      request<{
        success: boolean;
        agency_id: string;
        role: string;
        access_token?: string;
        refresh_token?: string;
      }>(`/api/v1/orgs/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        body: payload ? JSON.stringify(payload) : undefined,
      }),
    revokeInvitation: (invitationId: string) =>
      request<{ success: boolean; id: string; status: string }>(`/api/v1/orgs/invitations/${invitationId}`, {
        method: 'DELETE',
      }),
    updateMemberRole: (member_id: string, role: string) =>
      request<{ id: string; role: string }>(`/api/v1/orgs/members/${member_id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    update: (payload: { name?: string; contact_email?: string; timezone?: string }) =>
      request<{ id: string; name: string; slug: string; contact_email?: string; timezone?: string }>('/api/v1/orgs/current', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
  },

  onboarding: {
    get: () =>
      request<{
        agency_id: string;
        current_step: number;
        completed: boolean;
        completed_at?: string | null;
        data: Record<string, any>;
      }>('/api/v1/orgs/onboarding'),
    update: (payload: { current_step: number; data?: Record<string, any>; completed?: boolean }) =>
      request<{
        agency_id: string;
        current_step: number;
        completed: boolean;
        completed_at?: string | null;
        data: Record<string, any>;
      }>('/api/v1/orgs/onboarding', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    complete: () =>
      request<{
        success: boolean;
        agency_id: string;
        current_step: number;
        completed: boolean;
        completed_at?: string | null;
        data: Record<string, any>;
      }>('/api/v1/orgs/onboarding/complete', {
        method: 'POST',
      }),
  },

  clients: {
    list: () => request<Array<any>>('/api/v1/clients'),
    create: (payload: {
      name: string;
      company_name: string;
      industry?: string;
      contact_email: string;
      contact_phone?: string;
      notes?: string;
    }) =>
      request<any>('/api/v1/clients', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (
      id: string,
      payload: {
        name?: string;
        company_name?: string;
        industry?: string;
        contact_email?: string;
        contact_phone?: string;
        notes?: string;
      }
    ) =>
      request<any>(`/api/v1/clients/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    delete: (id: string) =>
      request<any>(`/api/v1/clients/${id}`, {
        method: 'DELETE',
      }),
  },

  // Workflows & Executions
  workflows: {
    list: (skip = 0, limit = 50) =>
      request<Array<{
        id: string;
        name: string;
        platform: string;
        external_workflow_id: string;
        health_status: string;
        is_active: boolean;
        consecutive_failures: number;
        stuck_timeout_seconds?: number | null;
        allow_long_running?: boolean;
        last_execution_at?: string | null;
      }>>(`/api/v1/workflows?skip=${skip}&limit=${limit}`),
    get: (id: string) => request<any>(`/api/v1/workflows/${id}`),
    create: (payload: {
      name: string;
      platform: string;
      external_workflow_id: string;
      client_id?: string;
      integration_id?: string;
      stuck_timeout_seconds?: number;
      allow_long_running?: boolean;
    }) =>
      request<any>('/api/v1/workflows', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    recentExecutions: (workflowId?: string, statusFilter?: string, limit = 50) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (workflowId) params.set('workflow_id', workflowId);
      if (statusFilter) params.set('status_filter', statusFilter);
      return request<Array<{
        id: string;
        workflow_id: string;
        workflow_name?: string;
        external_execution_id: string;
        status: string;
        raw_status?: string;
        started_at: string;
        finished_at?: string;
        duration_ms?: number;
        error_message?: string;
        mode?: string;
      }>>(`/api/v1/workflows/executions/recent?${params.toString()}`);
    },
    updateTimeout: (id: string, payload: { stuck_timeout_seconds?: number | null; allow_long_running?: boolean }) =>
      request<any>(`/api/v1/workflows/${id}/timeout`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    detectStuck: () =>
      request<{ checked_running_executions: number; abnormal_runs_detected: number; incident_ids: string[] }>(
        '/api/v1/workflows/executions/detect-stuck',
        { method: 'POST' }
      ),
    delete: (id: string) =>
      request<void>(`/api/v1/workflows/${id}`, {
        method: 'DELETE',
      }),
  },

  // Integrations
  integrations: {
    list: () => request<Array<any>>('/api/v1/integrations'),
    create: (payload: { name: string; platform: string; instance_url?: string; api_key?: string }) =>
      request<any>('/api/v1/integrations', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    testNew: (payload: { platform: string; instance_url?: string; api_key?: string }) =>
      request<{ status: string; message: string; workflow_count_sample?: number }>('/api/v1/integrations/test', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    testConnection: (id: string) =>
      request<{ status: string; message: string }>(`/api/v1/integrations/${id}/test`, {
        method: 'POST',
      }),
    sync: (id: string) =>
      request<{
        status: string;
        workflows_synced: number;
        executions_ingested: number;
        incidents_created: number;
        watermark?: string;
      }>(`/api/v1/integrations/${id}/sync`, {
        method: 'POST',
      }),
  },

  // Incidents
  incidents: {
    list: (statusFilter?: string, skip = 0, limit = 50) => {
      const q = statusFilter ? `&status_filter=${statusFilter}` : '';
      return request<Array<any>>(`/api/v1/incidents?skip=${skip}&limit=${limit}${q}`);
    },
    get: (id: string) => request<any>(`/api/v1/incidents/${id}`),
    updateStatus: (id: string, new_status: string) =>
      request<any>(`/api/v1/incidents/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: new_status }),
      }),
    assign: (id: string, user_id: string) =>
      request<any>(`/api/v1/incidents/${id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ user_id }),
      }),
  },

  // AI Diagnosis
  diagnosis: {
    trigger: (incidentId: string) =>
      request<any>(`/api/v1/incidents/${incidentId}/diagnose`, {
        method: 'POST',
      }),
    get: (incidentId: string) =>
      request<any>(`/api/v1/incidents/${incidentId}/diagnosis`),
  },

  // Recovery
  recovery: {
    metrics: () => request<any>('/api/v1/recovery/metrics'),
    getPolicy: () => request<any>('/api/v1/recovery/policies'),
    updatePolicy: (payload: {
      max_retry_attempts?: number;
      retry_delay_seconds?: number;
      use_exponential_backoff?: boolean;
      cooldown_seconds?: number;
      approval_required?: boolean;
      auto_recovery_enabled?: boolean;
      allowed_strategies?: string[];
    }) =>
      request<any>('/api/v1/recovery/policies', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    listRequests: (statusFilter?: string, limit = 50) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (statusFilter) params.set('status_filter', statusFilter);
      return request<Array<any>>(`/api/v1/recovery/requests?${params.toString()}`);
    },
    createRequest: (payload: {
      incident_id: string;
      strategy: string;
      delay_seconds?: number;
      reason?: string;
      idempotency_key?: string;
    }) =>
      request<any>('/api/v1/recovery/requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getRequestDetail: (requestId: string) => request<any>(`/api/v1/recovery/requests/${requestId}`),
    executeRequest: (requestId: string) =>
      request<any>(`/api/v1/recovery/requests/${requestId}/execute`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    verifyRequest: (requestId: string) =>
      request<any>(`/api/v1/recovery/requests/${requestId}/verify`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    cancelRequest: (requestId: string, reason?: string) =>
      request<any>(`/api/v1/recovery/requests/${requestId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    trigger: (payload: { incident_id: string; action: string }) =>
      request<any>('/api/v1/recovery/execute', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    list: (incidentId?: string) => {
      const q = incidentId ? `?incident_id=${incidentId}` : '';
      return request<Array<any>>(`/api/v1/recovery/attempts${q}`);
    },
  },

  // Approvals
  approvals: {
    list: () => request<Array<any>>('/api/v1/approvals'),
    decide: (approvalId: string, payload: { decision: 'APPROVE' | 'REJECT' | 'APPROVED' | 'REJECTED'; reason?: string }) =>
      request<any>(`/api/v1/approvals/${approvalId}/respond`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    cancel: (approvalId: string, reason?: string) =>
      request<any>(`/api/v1/approvals/${approvalId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
  },

  // Notifications
  notifications: {
    list: () => request<Array<any>>('/api/v1/notifications'),
    markRead: (id: string) =>
      request<void>(`/api/v1/notifications/${id}/read`, {
        method: 'POST',
      }),
    markAllRead: () =>
      request<{ updated: number }>('/api/v1/notifications/read-all', {
        method: 'POST',
      }),
    getPreferences: () =>
      request<Array<{ channel: string; min_severity: string; is_enabled: boolean }>>('/api/v1/notifications/preferences'),
    updatePreferences: (preferences: Array<{ channel: string; min_severity: string; is_enabled: boolean }>) =>
      request<Array<{ channel: string; min_severity: string; is_enabled: boolean }>>('/api/v1/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify({ preferences }),
      }),
  },

  // Audit Logs
  audit: {
    list: (limit = 50) => request<Array<any>>(`/api/v1/audit?limit=${limit}`),
  },

  // Billing & Configurable Pricing
  billing: {
    current: () => request<any>('/api/v1/billing/subscription'),
    upgrade: (tier: string) =>
      request<any>('/api/v1/billing/upgrade', {
        method: 'POST',
        body: JSON.stringify({ tier }),
      }),
  },

  pricing: {
    catalog: () => request<any>('/api/v1/pricing'),
  },

  sla: {
    getPolicy: () => request<any>('/api/v1/sla/policy'),
    updatePolicy: (payload: {
      target_success_rate_percent?: number;
      target_mttr_minutes?: number;
      max_open_critical_incidents?: number;
      evaluation_window_hours?: number;
    }) =>
      request<any>('/api/v1/sla/policy', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    getReport: () => request<any>('/api/v1/sla/report'),
  },

  alerts: {
    listChannels: () => request<Array<any>>('/api/v1/alerts/channels'),
    createChannel: (payload: {
      name: string;
      channel_type: string;
      target_url: string;
      min_severity?: string;
      is_enabled?: boolean;
    }) =>
      request<any>('/api/v1/alerts/channels', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateChannel: (
      id: string,
      payload: {
        name?: string;
        target_url?: string;
        min_severity?: string;
        is_enabled?: boolean;
      }
    ) =>
      request<any>(`/api/v1/alerts/channels/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    testChannel: (id: string, asyncDispatch = false) =>
      request<any>(`/api/v1/alerts/channels/${id}/test?async_dispatch=${asyncDispatch}`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    deleteChannel: (id: string) =>
      request<{ success: boolean; id: string }>(`/api/v1/alerts/channels/${id}`, { method: 'DELETE' }),
    listRules: () => request<Array<any>>('/api/v1/alerts/rules'),
    createRule: (payload: {
      name: string;
      condition_type: string;
      threshold_value: number;
      severity?: string;
      action_type?: string;
      target_channel_ids?: string[];
      cooldown_minutes?: number;
      is_enabled?: boolean;
    }) =>
      request<any>('/api/v1/alerts/rules', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateRule: (
      id: string,
      payload: {
        name?: string;
        condition_type?: string;
        threshold_value?: number;
        severity?: string;
        action_type?: string;
        target_channel_ids?: string[];
        cooldown_minutes?: number;
        is_enabled?: boolean;
      }
    ) =>
      request<any>(`/api/v1/alerts/rules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    deleteRule: (id: string) =>
      request<{ success: boolean; id: string }>(`/api/v1/alerts/rules/${id}`, { method: 'DELETE' }),
    evaluateRules: (force = false, asyncDispatch = false) =>
      request<any>(`/api/v1/alerts/evaluate?force=${force}&async_dispatch=${asyncDispatch}`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    listDeliveries: (limit = 50) => request<Array<any>>(`/api/v1/alerts/deliveries?limit=${limit}`),
  },

  controlCenter: {
    overview: () => request<any>('/api/v1/control-center/overview'),
    listWorkflows: (params?: { platform?: string; status_filter?: string; search?: string; sort_by?: string }) => {
      const q = new URLSearchParams();
      if (params?.platform) q.set('platform', params.platform);
      if (params?.status_filter) q.set('status_filter', params.status_filter);
      if (params?.search) q.set('search', params.search);
      if (params?.sort_by) q.set('sort_by', params.sort_by);
      const qs = q.toString();
      return request<Array<any>>(`/api/v1/control-center/workflows${qs ? `?${qs}` : ''}`);
    },
    getWorkflowDetail: (workflowId: string) => request<any>(`/api/v1/control-center/workflows/${workflowId}`),
    createAction: (payload: {
      workflow_id: string;
      action_type: string;
      confirmed: boolean;
      target_execution_id?: string;
      incident_id?: string;
      payload?: Record<string, any>;
      reason?: string;
      idempotency_key?: string;
      async_dispatch?: boolean;
    }) =>
      request<any>('/api/v1/control-center/actions', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    listActions: (statusFilter?: string, workflowId?: string, limit = 50) => {
      const q = new URLSearchParams({ limit: String(limit) });
      if (statusFilter) q.set('status_filter', statusFilter);
      if (workflowId) q.set('workflow_id', workflowId);
      return request<Array<any>>(`/api/v1/control-center/actions?${q.toString()}`);
    },
    approveAction: (actionId: string) =>
      request<any>(`/api/v1/control-center/actions/${actionId}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    rejectAction: (actionId: string, rejection_reason?: string) =>
      request<any>(`/api/v1/control-center/actions/${actionId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejection_reason }),
      }),
    cancelAction: (actionId: string, rejection_reason?: string) =>
      request<any>(`/api/v1/control-center/actions/${actionId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ rejection_reason }),
      }),
    listActivity: (workflowId?: string, limit = 100) => {
      const q = new URLSearchParams({ limit: String(limit) });
      if (workflowId) q.set('workflow_id', workflowId);
      return request<Array<any>>(`/api/v1/control-center/activity?${q.toString()}`);
    },
    askAssistant: (payload: { question: string; workflow_id?: string }) =>
      request<any>('/api/v1/control-center/assistant/query', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  contact: {
    submit: (payload: {
      name: string;
      email: string;
      company: string;
      subject: string;
      message: string;
      website?: string;
    }) =>
      request<{
        status: string;
        submission_id?: string;
        submissionId?: string;
        received_at?: string;
        delivery_mode?: string;
        message: string;
      }>('/api/v1/contact', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
};

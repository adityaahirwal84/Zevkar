import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { OverviewTab } from './components/OverviewTab';
import { IncidentsTab } from './components/IncidentsTab';
import { AIDiagnosisModal } from './components/AIDiagnosisModal';
import { RecoveryCenterTab } from './components/RecoveryCenterTab';
import { ApprovalsTab } from './components/ApprovalsTab';
import { WorkflowsTab } from './components/WorkflowsTab';
import { ClientsTab } from './components/ClientsTab';
import { IntegrationsTab } from './components/IntegrationsTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { AlertsSlaTab } from './components/AlertsSlaTab';
import { AssistantTab } from './components/AssistantTab';
import { ControlCenterTab } from './components/ControlCenterTab';
import { TeamTab } from './components/TeamTab';
import { BillingTab } from './components/BillingTab';
import { SettingsTab } from './components/SettingsTab';
import { OnboardingModal } from './components/OnboardingModal';
import { AuditLogTab } from './components/dashboard/AuditLogTab';
import { StatusBadge } from './components/marketing/StatusBadge';
import { HomePage } from './components/pages/HomePage';
import { ProductPage } from './components/pages/ProductPage';
import { FeaturesPage } from './components/pages/FeaturesPage';
import { HowItWorksPage } from './components/pages/HowItWorksPage';
import { UseCasesPage } from './components/pages/UseCasesPage';
import { IntegrationsPage } from './components/pages/IntegrationsPage';
import { PricingPage } from './components/pages/PricingPage';
import { DocsPage } from './components/pages/DocsPage';
import { BlogPage } from './components/pages/BlogPage';
import { AboutPage } from './components/pages/AboutPage';
import { ContactPage } from './components/pages/ContactPage';
import { AuthPages } from './components/pages/AuthPages';
import { AcceptInvitePage } from './components/pages/AcceptInvitePage';
import { OnboardingPage } from './components/pages/OnboardingPage';
import { LegalPages } from './components/pages/LegalPages';
import { AuthProvider, useAuth } from './context/AuthContext';
import { apiJson, authFetch, normalizeApiResponse } from './lib/api';
import { resolvePostAuthDestination } from './lib/onboarding';
import {
  AppRoute,
  getDashboardRouteForRole,
  getDefaultTabForRole,
  getRouteMeta,
  isDashboardRoute,
  isOnboardingRoute,
  normalizeDashboardTab,
  resolveDashboardHref,
  resolveProtectedRouteAccess,
} from './lib/router';
import {
  Client,
  Agency,
  Integration,
  Workflow,
  Execution,
  Incident,
  ApprovalRequest,
  InvitationItem,
  NotificationPreferenceItem,
  OnboardingState,
  RecoveryMetrics,
  RecoveryPolicy,
  RecoveryRequest,
  RecoveryStrategy,
  NotificationItem,
  DashboardStats,
  AgencyMember,
  AuditLogItem,
  PlatformType,
  Role,
} from './types';
import { detectBrowserTimezone, isValidTimeZone } from './lib/datetime';

const EMPTY_STATS: DashboardStats = {
  totalClients: 0,
  totalIntegrations: 0,
  totalWorkflows: 0,
  successfulExecutions24h: 0,
  failedExecutions24h: 0,
  activeIncidentsCount: 0,
  pendingApprovalsCount: 0,
  recoverySuccessRate: 100,
  workflowSuccessRate: 100,
  overallHealthScore: 100,
  meanTimeToRecoveryMinutes: 0,
  estimatedRevenueAtRisk: 0,
};

function AppContent() {
  const {
    user: authUser,
    agency,
    setAgencyContext: setAgency,
    isAuthenticated,
    isInitializing,
    dashboardRoute,
    userRole,
    loginWithAuthResponse,
    logout,
    hasActiveToken,
  } = useAuth();

  const [initialNav] = useState(() => {
    const access = resolveProtectedRouteAccess({
      pathname: window.location.pathname,
      search: window.location.search,
      isAuthenticated: hasActiveToken(),
      userRole: authUser?.role,
    });

    const wasUnauthenticatedDashboardAttempt =
      access.shouldRedirect && access.route === '/login';

    return {
      route: access.route,
      tab: access.tab,
      pendingTab: wasUnauthenticatedDashboardAttempt
        ? normalizeDashboardTab(new URLSearchParams(window.location.search).get('tab'))
        : null,
    };
  });

  const pendingDashboardTabRef = React.useRef<NavTab | null>(initialNav.pendingTab);
  const [route, setRoute] = useState<AppRoute>(initialNav.route);
  const [currentTab, setCurrentTab] = useState<NavTab>(initialNav.tab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  // Core Data States

  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);

  const [clients, setClients] = useState<Client[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [recoveryRequests, setRecoveryRequests] = useState<RecoveryRequest[]>([]);
  const [recoveryMetrics, setRecoveryMetrics] = useState<RecoveryMetrics | null>(null);
  const [recoveryPolicy, setRecoveryPolicy] = useState<RecoveryPolicy | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferenceItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<AgencyMember[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [timezone, setTimezone] = useState<string>(() => {
    try {
      const saved =
        window.localStorage.getItem('ai_doctor_timezone') ||
        window.localStorage.getItem('zevkar_timezone');
      if (isValidTimeZone(saved)) return saved as string;
    } catch {
      // ignore storage errors
    }
    return detectBrowserTimezone();
  });

  // Interactive Modal / Action States
  const [selectedIncidentForDiag, setSelectedIncidentForDiag] = useState<Incident | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSimulatingWebhook, setIsSimulatingWebhook] = useState(false);
  const [isExecutingRecovery, setIsExecutingRecovery] = useState(false);
  const [isThinkingAssistant, setIsThinkingAssistant] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDetectingStuck, setIsDetectingStuck] = useState(false);
  const [isApprovalProcessing, setIsApprovalProcessing] = useState(false);
  const [isRefreshingAudit, setIsRefreshingAudit] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(() => hasActiveToken());

  const authUserRoleRef = React.useRef<Role | undefined>(userRole);
  useEffect(() => {
    authUserRoleRef.current = userRole;
  }, [userRole]);

  const navigate = useCallback(
    (
      nextRoute: AppRoute,
      options?: { tab?: NavTab; replace?: boolean; role?: Role }
    ) => {
      if ((isDashboardRoute(nextRoute) || isOnboardingRoute(nextRoute)) && !hasActiveToken()) {
        pendingDashboardTabRef.current = options?.tab || 'overview';
        setRoute('/login');
        if (window.location.pathname !== '/login') {
          if (options?.replace) {
            window.history.replaceState({}, '', '/login');
          } else {
            window.history.pushState({}, '', '/login');
          }
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const nextTab = options?.tab;
      if (nextTab) {
        setCurrentTab(nextTab);
      }

      setRoute(nextRoute);
      const effectiveRole = options?.role ?? authUserRoleRef.current;
      const targetUrl = isDashboardRoute(nextRoute)
        ? resolveDashboardHref(effectiveRole, nextTab ?? currentTab)
        : nextRoute;

      if (`${window.location.pathname}${window.location.search}` !== targetUrl) {
        if (options?.replace) {
          window.history.replaceState({}, '', targetUrl);
        } else {
          window.history.pushState({}, '', targetUrl);
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [currentTab, hasActiveToken]
  );

  const selectDashboardTab = useCallback(
    (tab: NavTab) => {
      setCurrentTab(tab);
      const targetUrl = resolveDashboardHref(authUserRoleRef.current, tab);
      if (`${window.location.pathname}${window.location.search}` !== targetUrl) {
        window.history.pushState({}, '', targetUrl);
      }
    },
    []
  );

  const handleDashboardLogoClick = useCallback(() => {
    const targetRoute = getDashboardRouteForRole(authUserRoleRef.current);
    const defaultTab = getDefaultTabForRole(authUserRoleRef.current);
    navigate(targetRoute, { tab: defaultTab });
  }, [navigate]);

  useEffect(() => {
    const meta = getRouteMeta(route);
    document.title = meta.title;
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) descEl.setAttribute('content', meta.description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', meta.title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', meta.description);
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.setAttribute('content', meta.title);
    const twitterDesc = document.querySelector('meta[name="twitter:description"]');
    if (twitterDesc) twitterDesc.setAttribute('content', meta.description);
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    if (canonicalEl) {
      canonicalEl.setAttribute('href', `https://zevkar.ai${route === '/' ? '/' : route}`);
    }
  }, [route]);

  useEffect(() => {
    const initialTarget = isDashboardRoute(initialNav.route)
      ? resolveDashboardHref(authUserRoleRef.current, initialNav.tab)
      : initialNav.route;
    if (`${window.location.pathname}${window.location.search}` !== initialTarget) {
      window.history.replaceState({}, '', initialTarget);
    }
    // Only synchronize initial URL on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isInitializing) return;
    if (isAuthenticated && route === '/login' && pendingDashboardTabRef.current !== null) {
      const tab = pendingDashboardTabRef.current;
      pendingDashboardTabRef.current = null;
      navigate(dashboardRoute, { tab, replace: true });
    }
  }, [dashboardRoute, isAuthenticated, isInitializing, navigate, route]);

  useEffect(() => {
    if (!isInitializing && !isAuthenticated && (isDashboardRoute(route) || isOnboardingRoute(route))) {
      pendingDashboardTabRef.current = normalizeDashboardTab(
        new URLSearchParams(window.location.search).get('tab')
      );
      window.history.replaceState({}, '', '/login');
      setRoute('/login');
    }
  }, [isAuthenticated, isInitializing, route]);

  useEffect(() => {
    const onPopState = () => {
      const access = resolveProtectedRouteAccess({
        pathname: window.location.pathname,
        search: window.location.search,
        isAuthenticated: hasActiveToken(),
        userRole: authUserRoleRef.current,
      });

      if (access.shouldRedirect && access.route === '/login') {
        pendingDashboardTabRef.current = normalizeDashboardTab(
          new URLSearchParams(window.location.search).get('tab')
        );
        window.history.replaceState({}, '', '/login');
        setRoute('/login');
        return;
      }

      setRoute(access.route);
      if (isDashboardRoute(access.route)) {
        setCurrentTab(access.tab);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [hasActiveToken]);

  const resetWorkspaceData = useCallback(() => {
    setStats(EMPTY_STATS);
    setClients([]);
    setIntegrations([]);
    setWorkflows([]);
    setExecutions([]);
    setIncidents([]);
    setApprovals([]);
    setRecoveryRequests([]);
    setRecoveryMetrics(null);
    setRecoveryPolicy(null);
    setNotifications([]);
    setNotificationPreferences([]);
    setTeamMembers([]);
    setInvitations([]);
    setOnboardingState(null);
    setAuditLogs([]);
    setSelectedIncidentForDiag(null);
  }, []);

  const refreshAllData = useCallback(async () => {
    if (!hasActiveToken()) {
      resetWorkspaceData();
      setIsInitialLoading(false);
      return;
    }
    const failedRequests: string[] = [];
    try {
      const fetchJson = async <T,>(url: string): Promise<T | null> => {
        try {
          const response = await apiJson<unknown>(url);
          return normalizeApiResponse(response) as T;
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Unknown API error';
          failedRequests.push(`${url}: ${reason}`);
          console.error(`Unable to load dashboard data from ${url}.`, error);
          return null;
        }
      };

      const [
        statsRes,
        clientsRes,
        integrationsRes,
        workflowsRes,
        executionsRes,
        incidentsRes,
        approvalsRes,
        notifsRes,
        notifPrefsRes,
        teamRes,
        invitationsRes,
        auditRes,
        recMetricsRes,
        recPolicyRes,
        recRequestsRes,
        onboardingRes,
        agencyRes,
      ] = await Promise.all([
        fetchJson<DashboardStats>('/api/v1/analytics/overview'),
        fetchJson<Client[]>('/api/v1/clients'),
        fetchJson<Integration[]>('/api/v1/integrations'),
        fetchJson<Workflow[]>('/api/v1/workflows'),
        fetchJson<Execution[]>('/api/v1/executions?limit=50'),
        fetchJson<Incident[]>('/api/v1/incidents'),
        fetchJson<ApprovalRequest[]>('/api/v1/approvals'),
        fetchJson<NotificationItem[]>('/api/v1/notifications'),
        fetchJson<NotificationPreferenceItem[]>('/api/v1/notifications/preferences'),
        fetchJson<AgencyMember[]>('/api/v1/orgs/members'),
        userRole === 'OWNER' || userRole === 'ADMIN'
          ? fetchJson<InvitationItem[]>('/api/v1/orgs/invitations')
          : Promise.resolve<InvitationItem[]>([]),
        fetchJson<AuditLogItem[]>('/api/v1/audit-logs'),
        fetchJson<RecoveryMetrics>('/api/v1/recovery/metrics'),
        fetchJson<RecoveryPolicy>('/api/v1/recovery/policies'),
        fetchJson<RecoveryRequest[]>('/api/v1/recovery/requests'),
        fetchJson<OnboardingState>('/api/v1/onboarding'),
        fetchJson<Agency>('/api/v1/orgs/current'),
      ]);

      if (statsRes) setStats(statsRes);
      if (Array.isArray(clientsRes)) setClients(clientsRes);
      if (Array.isArray(integrationsRes)) setIntegrations(integrationsRes);
      if (Array.isArray(workflowsRes)) setWorkflows(workflowsRes);
      if (Array.isArray(executionsRes)) setExecutions(executionsRes);
      if (Array.isArray(incidentsRes)) setIncidents(incidentsRes);
      if (Array.isArray(approvalsRes)) setApprovals(approvalsRes);
      if (Array.isArray(notifsRes)) setNotifications(notifsRes);
      if (Array.isArray(notifPrefsRes)) setNotificationPreferences(notifPrefsRes);
      if (Array.isArray(teamRes)) setTeamMembers(teamRes);
      if (Array.isArray(invitationsRes)) setInvitations(invitationsRes);
      if (Array.isArray(auditRes)) setAuditLogs(auditRes);
      if (recMetricsRes && typeof recMetricsRes.totalRequests === 'number') setRecoveryMetrics(recMetricsRes);
      if (recPolicyRes && recPolicyRes.id) setRecoveryPolicy(recPolicyRes);
      if (Array.isArray(recRequestsRes)) setRecoveryRequests(recRequestsRes);
      if (onboardingRes && onboardingRes.agencyId) setOnboardingState(onboardingRes);
      if (agencyRes && agencyRes.id) {
        setAgency(agencyRes);
        try {
          window.localStorage.setItem('deltaai_session_agency', JSON.stringify(agencyRes));
        } catch {
          // ignore storage quota errors
        }
      }
      if (failedRequests.length > 0) {
        setActionFeedback({
          type: 'error',
          text: `Some dashboard data could not be loaded: ${failedRequests.slice(0, 3).join(' | ')}`,
        });
      }
    } catch (err) {
      console.error('Error fetching data from server:', err);
      setActionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to load dashboard data.',
      });
    } finally {
      setIsInitialLoading(false);
    }
  }, [hasActiveToken, resetWorkspaceData, setAgency, userRole]);

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData, isAuthenticated]);

  const handleRefreshAuditLogs = async () => {
    setIsRefreshingAudit(true);
    try {
      const r = await authFetch('/api/v1/audit-logs');
      const res = r.ok ? await r.json().catch(() => null) : null;
      if (Array.isArray(res)) setAuditLogs(res);
    } finally {
      setIsRefreshingAudit(false);
    }
  };

  const handleTriggerReanalyze = async (incidentId: string) => {
    setIsAnalyzing(true);
    try {
      const res = await authFetch('/api/v1/diagnosis/analyze', {
        method: 'POST',
        body: JSON.stringify({ incidentId }),
      });
      const updatedDiag = await res.json();
      setIncidents((prev) =>
        prev.map((i) => (i.id === incidentId ? { ...i, aiDiagnosis: updatedDiag } : i))
      );
      if (selectedIncidentForDiag && selectedIncidentForDiag.id === incidentId) {
        setSelectedIncidentForDiag((prev) => (prev ? { ...prev, aiDiagnosis: updatedDiag } : null));
      }
      await handleRefreshAuditLogs();
    } catch (err) {
      console.error('Error triggering diagnosis:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreateRecoveryRequest = async (params: {
    incidentId: string;
    strategy: RecoveryStrategy;
    delaySeconds?: number;
    reason?: string;
  }) => {
    setIsExecutingRecovery(true);
    setActionFeedback(null);
    try {
      const res = await authFetch('/api/v1/recovery/requests', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (res.ok) {
        await refreshAllData();
        setActionFeedback({
          type: 'info',
          text: `Recovery request #${data.id} created (${data.status}).`,
        });
      } else {
        setActionFeedback({ type: 'error', text: data.message || data.error || 'Failed to create recovery request.' });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', text: `Recovery request error: ${err?.message || 'Unknown error'}` });
    } finally {
      setIsExecutingRecovery(false);
    }
  };

  const handleExecuteRecoveryRequest = async (requestId: string) => {
    setIsExecutingRecovery(true);
    setActionFeedback(null);
    try {
      const res = await authFetch(`/api/v1/recovery/requests/${requestId}/execute`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const data = await res.json();
      await refreshAllData();
      if (res.ok) {
        setActionFeedback({ type: 'info', text: data.message || 'Recovery verified and completed.' });
      } else {
        setActionFeedback({ type: 'error', text: data.message || data.error || 'Recovery execution blocked.' });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', text: `Recovery execution error: ${err?.message || 'Unknown error'}` });
    } finally {
      setIsExecutingRecovery(false);
    }
  };

  const handleCancelRecoveryRequest = async (requestId: string, reason?: string) => {
    setIsExecutingRecovery(true);
    setActionFeedback(null);
    try {
      const res = await authFetch(`/api/v1/recovery/requests/${requestId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      await refreshAllData();
      if (res.ok) {
        setActionFeedback({ type: 'info', text: `Recovery request #${requestId} cancelled.` });
      } else {
        setActionFeedback({ type: 'error', text: data.error || 'Failed to cancel recovery request.' });
      }
    } finally {
      setIsExecutingRecovery(false);
    }
  };

  const handleUpdateRecoveryPolicy = async (updates: Partial<RecoveryPolicy>) => {
    setIsExecutingRecovery(true);
    setActionFeedback(null);
    try {
      const res = await authFetch('/api/v1/recovery/policies', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      await refreshAllData();
      if (res.ok) {
        setActionFeedback({ type: 'info', text: 'Organization recovery policy updated and audited.' });
      } else {
        setActionFeedback({ type: 'error', text: data.error || 'Failed to update recovery policy.' });
      }
    } finally {
      setIsExecutingRecovery(false);
    }
  };

  const handleExecuteRecovery = async (incidentId: string, bypassApproval = false) => {
    setIsExecutingRecovery(true);
    setActionFeedback(null);
    try {
      const res = await authFetch('/api/v1/recovery/execute', {
        method: 'POST',
        body: JSON.stringify({ incidentId, bypassApproval }),
      });
      const data = await res.json();
      if (res.ok) {
        await refreshAllData();
        setActionFeedback({ type: 'info', text: data.message || 'Recovery executed successfully.' });
      } else {
        setActionFeedback({ type: 'error', text: data.message || data.error || 'Recovery blocked.' });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', text: `Recovery error: ${err?.message || 'Unknown error'}` });
    } finally {
      setIsExecutingRecovery(false);
    }
  };

  const handleRespondApproval = async (
    approvalId: string,
    decision: 'APPROVE' | 'REJECT',
    rejectionReason?: string
  ) => {
    setIsApprovalProcessing(true);
    setActionFeedback(null);
    try {
      const res = await authFetch(`/api/v1/approvals/${approvalId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ decision, rejectionReason }),
      });
      const data = await res.json();
      await refreshAllData();
      if (!res.ok) {
        setActionFeedback({ type: 'error', text: data.error || 'Approval update blocked.' });
      } else {
        setActionFeedback({
          type: 'info',
          text: `Approval #${approvalId} ${decision === 'APPROVE' ? 'authorized' : 'rejected'}.`,
        });
      }
    } finally {
      setIsApprovalProcessing(false);
    }
  };

  const handleCancelApproval = async (approvalId: string, reason?: string) => {
    setIsApprovalProcessing(true);
    setActionFeedback(null);
    try {
      const res = await authFetch(`/api/v1/approvals/${approvalId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      await refreshAllData();
      if (!res.ok) {
        setActionFeedback({ type: 'error', text: data.error || 'Failed to cancel pending approval.' });
      } else {
        setActionFeedback({ type: 'info', text: `Pending approval #${approvalId} cancelled.` });
      }
    } finally {
      setIsApprovalProcessing(false);
    }
  };

  const handleSendAssistantMessage = async (message: string): Promise<string> => {
    setIsThinkingAssistant(true);
    try {
      const res = await authFetch('/api/v1/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      return data.reply;
    } finally {
      setIsThinkingAssistant(false);
    }
  };

  const handleSimulateWebhook = async () => {
    setIsSimulatingWebhook(true);
    try {
      await authFetch('/api/v1/webhooks/listener', {
        method: 'POST',
        body: JSON.stringify({
          workflowId: workflows[0]?.id || 'wf_sim_01',
          workflowName: workflows[0]?.name || 'Shopify New Order -> ERP QuickBooks Invoice',
          clientName: clients[0]?.name || agency.name || 'Workspace Project',
          platform: 'n8n',
          executionId: `exec_sim_${Date.now()}`,
          error: 'HTTP 429 Too Many Requests: QuickBooks API rate limit 500 req/min exceeded during flash sale sync.',
        }),
      });
      await refreshAllData();
    } finally {
      setIsSimulatingWebhook(false);
    }
  };

  const handleAddClient = async (clientData: Partial<Client>) => {
    const res = await authFetch('/api/v1/clients', {
      method: 'POST',
      body: JSON.stringify(clientData),
    });
    if (res.ok) {
      await refreshAllData();
    } else {
      const errData = await res.json().catch(() => ({}));
      setActionFeedback({ type: 'error', text: errData.error || 'Failed to create client.' });
    }
  };

  const handleUpdateClient = async (clientId: string, updates: Partial<Client>) => {
    const res = await authFetch(`/api/v1/clients/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      await refreshAllData();
      setActionFeedback({ type: 'info', text: 'Client portfolio updated.' });
    } else {
      const errData = await res.json().catch(() => ({}));
      setActionFeedback({ type: 'error', text: errData.error || 'Failed to update client.' });
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    const res = await authFetch(`/api/v1/clients/${clientId}`, { method: 'DELETE' });
    if (res.ok) {
      await refreshAllData();
    } else {
      const errData = await res.json().catch(() => ({}));
      setActionFeedback({ type: 'error', text: errData.error || 'Failed to remove client.' });
    }
  };

  const handleAddWorkflow = async (workflowData: Partial<Workflow>) => {
    const res = await authFetch('/api/v1/workflows', {
      method: 'POST',
      body: JSON.stringify(workflowData),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      setActionFeedback({ type: 'error', text: errData.error || 'Failed to add workflow.' });
      return;
    }
    await refreshAllData();
  };

  const handleAddIntegration = async (integrationData: Partial<Integration> & { apiKey?: string }) => {
    const res = await authFetch('/api/v1/integrations', {
      method: 'POST',
      body: JSON.stringify(integrationData),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      setActionFeedback({ type: 'error', text: errData.error || 'Failed to save integration.' });
      return;
    }
    await refreshAllData();
  };

  const handleTestConnection = async (platform: PlatformType, instanceUrl: string, apiKey?: string) => {
    const res = await authFetch('/api/v1/integrations/test-connection', {
      method: 'POST',
      body: JSON.stringify({ platform, instanceUrl, apiKey }),
    });
    return res.json();
  };

  const handleTriggerSync = async (integrationId?: string) => {
    setIsSyncing(true);
    try {
      const targetId = integrationId || integrations[0]?.id;
      if (!targetId) {
        setActionFeedback({ type: 'error', text: 'Connect an integration before running fleet sync.' });
        return;
      }
      const res = await authFetch(`/api/v1/integrations/${targetId}/sync`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionFeedback({ type: 'error', text: data.error || 'Integration sync failed.' });
      } else if (data.mode === 'live-n8n') {
        setActionFeedback({
          type: 'info',
          text: `Live n8n sync completed: ${data.workflowCount ?? 0} workflows tracked, ${data.executionsIngested ?? 0} new executions ingested.`,
        });
      }
      await refreshAllData();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDetectStuck = async () => {
    setIsDetectingStuck(true);
    try {
      const res = await authFetch('/api/v1/executions/detect-stuck', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      await refreshAllData();
      if (res.ok) {
        const count = Number(data.abnormalRunsDetected || 0);
        setActionFeedback({
          type: count > 0 ? 'error' : 'info',
          text:
            count > 0
              ? `Detected ${count} stuck/timed-out execution${count === 1 ? '' : 's'} and opened incident alert${count === 1 ? '' : 's'}.`
              : 'No stuck executions detected across currently running workflows.',
        });
      }
    } finally {
      setIsDetectingStuck(false);
    }
  };

  const handleInviteMember = async (email: string, name: string, role: Role) => {
    const res = await authFetch('/api/v1/orgs/members/invite', {
      method: 'POST',
      body: JSON.stringify({ email, name, role }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionFeedback({ type: 'error', text: data.error || 'Failed to send invitation.' });
      return;
    }
    setActionFeedback({ type: 'info', text: `Invitation created for ${email} (${role}).` });
    await refreshAllData();
  };

  const handleUpdateMemberRole = async (memberId: string, role: Role) => {
    const res = await authFetch(`/api/v1/orgs/members/${memberId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setActionFeedback({ type: 'info', text: `Updated team member role to ${role}.` });
      await refreshAllData();
    } else {
      const data = await res.json().catch(() => ({}));
      setActionFeedback({ type: 'error', text: data.error || 'Failed to update role.' });
    }
  };

  const handleRemoveMember = async (userId: string) => {
    const res = await authFetch(`/api/v1/organizations/${agency.id}/members/${userId}`, { method: 'DELETE' });
    if (res.ok) {
      setActionFeedback({ type: 'info', text: 'Team member removed.' });
      await refreshAllData();
    } else {
      const data = await res.json().catch(() => ({}));
      setActionFeedback({ type: 'error', text: data.error || 'Failed to remove team member.' });
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    const res = await authFetch(`/api/v1/orgs/invitations/${invitationId}`, { method: 'DELETE' });
    if (res.ok) {
      setActionFeedback({ type: 'info', text: 'Invitation revoked.' });
      await refreshAllData();
    } else {
      const data = await res.json().catch(() => ({}));
      setActionFeedback({ type: 'error', text: data.error || 'Failed to revoke invitation.' });
    }
  };

  const handleUpgradeTier = async (tier: 'FREE' | 'STARTER' | 'GROWTH' | 'AGENCY_PRO') => {
    const res = await authFetch('/api/v1/billing/upgrade', {
      method: 'POST',
      body: JSON.stringify({ tier }),
    });
    if (res.ok) {
      await refreshAllData();
    } else {
      setAgency((prev) => ({ ...prev, tier }));
    }
  };

  const handleUpdateAgencyProfile = async (updates: { name: string; contactEmail: string }) => {
    try {
      const updatedAgency = normalizeApiResponse(
        await apiJson<Agency>('/api/v1/orgs/current', {
          method: 'PUT',
          body: JSON.stringify({ name: updates.name, contact_email: updates.contactEmail }),
        })
      );
      setAgency(updatedAgency);
      setActionFeedback({ type: 'info', text: 'Organization profile updated.' });
      await refreshAllData();
    } catch (error) {
      setActionFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to update organization profile.',
      });
    }
  };

  const handleUpdateAgencyName = async (newName: string) => {
    await handleUpdateAgencyProfile({
      name: newName,
      contactEmail: agency.contactEmail,
    });
  };

  const handleUpdateTimezone = async (nextTimezone: string) => {
    if (!isValidTimeZone(nextTimezone)) {
      setActionFeedback({ type: 'error', text: `Unsupported timezone: ${nextTimezone}` });
      return;
    }
    const res = await authFetch('/api/v1/auth/timezone', {
      method: 'PUT',
      body: JSON.stringify({ timezone: nextTimezone }),
    });
    if (res.ok) {
      setTimezone(nextTimezone);
      try {
        window.localStorage.setItem('ai_doctor_timezone', nextTimezone);
      } catch {
        // ignore storage errors
      }
      setAgency((prev) => ({ ...prev, timezone: nextTimezone }));
      await refreshAllData();
    }
  };

  const handleUpdateNotificationPreferences = async (preferences: NotificationPreferenceItem[]) => {
    const res = await authFetch('/api/v1/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences }),
    });
    if (res.ok) {
      const updated = await res.json().catch(() => preferences);
      if (Array.isArray(updated)) setNotificationPreferences(updated);
      setActionFeedback({ type: 'info', text: 'Notification preferences saved.' });
      await handleRefreshAuditLogs();
    } else {
      const err = await res.json().catch(() => ({}));
      setActionFeedback({ type: 'error', text: err.error || 'Failed to save notification preferences.' });
    }
  };

  const handleMarkNotificationsRead = async () => {
    await authFetch('/api/v1/notifications/mark-read', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleOnboardingComplete = async (data: any) => {
    if (data.agencyName) {
      await handleUpdateAgencyProfile({
        name: data.agencyName,
        contactEmail: agency.contactEmail,
      });
    }
    if (data.clientName) {
      await handleAddClient({
        name: data.clientName,
        companyName: data.clientName,
        contactEmail: data.clientEmail || 'ops@client.com',
      });
    }
    await refreshAllData();
  };

  // Public Marketing, Documentation, Auth & Onboarding Routes
  if (route === '/') return <HomePage onNavigate={navigate} />;
  if (route === '/product') return <ProductPage onNavigate={navigate} />;
  if (route === '/features') return <FeaturesPage onNavigate={navigate} />;
  if (route === '/how-it-works') return <HowItWorksPage onNavigate={navigate} />;
  if (route === '/use-cases' || route === '/solutions') return <UseCasesPage onNavigate={navigate} />;
  if (route === '/integrations') return <IntegrationsPage onNavigate={navigate} />;
  if (route === '/pricing') return <PricingPage onNavigate={navigate} />;
  if (route === '/docs' || route === '/developers') {
    return <DocsPage currentRoute={route} onNavigate={navigate} />;
  }
  if (route === '/blog' || route === '/resources') {
    return <BlogPage currentRoute={route} onNavigate={navigate} />;
  }
  if (route === '/about') return <AboutPage onNavigate={navigate} />;
  if (route === '/contact') return <ContactPage onNavigate={navigate} />;
  if (route === '/privacy' || route === '/terms' || route === '/cookies') {
    const legalMode =
      route === '/privacy' ? 'privacy' : route === '/terms' ? 'terms' : 'cookies';
    return <LegalPages mode={legalMode} onNavigate={navigate} />;
  }
  if (
    route === '/login' ||
    route === '/signup' ||
    route === '/forgot-password' ||
    route === '/reset-password' ||
    route === '/verify-email'
  ) {
    const authMode =
      route === '/login'
        ? 'login'
        : route === '/signup'
        ? 'signup'
        : route === '/forgot-password'
        ? 'forgot-password'
        : route === '/reset-password'
        ? 'reset-password'
        : 'verify-email';
    return (
      <AuthPages
        mode={authMode}
        onNavigate={navigate}
        onAuthSuccess={async (authData, options) => {
          const session = await loginWithAuthResponse(authData);
          const nextUser = session.user;
          authUserRoleRef.current = nextUser.role;
          const dest = resolvePostAuthDestination({
            isAuthenticated: true,
            onboardingCompleted: options?.isNewSignup
              ? false
              : session.agency.onboardingCompleted,
            role: nextUser.role,
            pendingTab: pendingDashboardTabRef.current,
          });
          pendingDashboardTabRef.current = null;
          navigate(dest.route, {
            tab: dest.tab as NavTab | undefined,
            role: nextUser.role,
          });
          await refreshAllData();
        }}
      />
    );
  }
  if (route === '/accept-invite') {
    return (
      <AcceptInvitePage
        onNavigate={navigate}
        onAuthSuccess={async (authData) => {
          const session = await loginWithAuthResponse(authData);
          const nextUser = session.user;
          authUserRoleRef.current = nextUser.role;
          const dest = resolvePostAuthDestination({
            isAuthenticated: true,
            onboardingCompleted: session.agency.onboardingCompleted,
            role: nextUser.role,
            pendingTab: null,
          });
          navigate(dest.route, {
            tab: dest.tab as NavTab | undefined,
            role: nextUser.role,
          });
          await refreshAllData();
        }}
      />
    );
  }
  if (route === '/onboarding') {
    return <OnboardingPage onNavigate={navigate} onRefreshData={refreshAllData} />;
  }

  // Dashboard Console Route (/dashboard)
  const handleSignOut = async () => {
    pendingDashboardTabRef.current = null;
    resetWorkspaceData();
    try {
      await logout();
    } catch (error) {
      setActionFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Unable to complete server logout.',
      });
    } finally {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-[#171A1B] text-[#F0E9D9] flex flex-col">
      <Navbar
        agency={agency}
        timezone={timezone}
        notifications={notifications}
        onMarkNotificationsRead={handleMarkNotificationsRead}
        showPublicLanding={false}
        onTogglePublicLanding={() => navigate('/')}
        onLogoClick={handleDashboardLogoClick}
        dashboardHref={dashboardRoute}
        onOpenOnboarding={() => navigate('/onboarding')}
        pendingApprovalsCount={stats.pendingApprovalsCount}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
        onSignOut={handleSignOut}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={selectDashboardTab}
          activeIncidentsCount={stats.activeIncidentsCount}
          pendingApprovalsCount={stats.pendingApprovalsCount}
          workflowsCount={isInitialLoading ? stats.totalWorkflows : workflows.length}
          clientsCount={isInitialLoading ? stats.totalClients : clients.length}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl w-full">
          {actionFeedback && (
            <div
              className={`mb-5 rounded-lg border px-4 py-3 text-xs flex items-center justify-between gap-3 ${
                actionFeedback.type === 'error'
                  ? 'border-[#61231C] bg-[#2B1513] text-[#E88A7E]'
                  : 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]'
              }`}
            >
              <span>{actionFeedback.text}</span>
              <button
                type="button"
                onClick={() => setActionFeedback(null)}
                className="text-[#E9E5DC] font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {isInitialLoading ? (
            <div className="rounded-xl border border-[#383838] bg-[#202020] p-8 text-center text-xs text-[#B5AA99]">
              Loading console telemetry...
            </div>
          ) : (
            <>
              {currentTab === 'overview' && (
                <OverviewTab
                  stats={stats}
                  incidents={incidents}
                  clients={clients}
                  workflows={workflows}
                  integrations={integrations}
                  executions={executions}
                  approvals={approvals}
                  agency={agency}
                  onboardingState={onboardingState}
                  notificationPreferences={notificationPreferences}
                  auditLogs={auditLogs}
                  timezone={timezone}
                  onSelectIncident={(inc) => setSelectedIncidentForDiag(inc)}
                  onOpenDiagnosis={(inc) => setSelectedIncidentForDiag(inc)}
                  onNavigateToTab={selectDashboardTab}
                  onResumeOnboarding={() => navigate('/onboarding')}
                  onOpenRoute={(target) => navigate(target)}
                  onTriggerSimulatedWebhook={handleSimulateWebhook}
                  isSimulating={isSimulatingWebhook}
                />
              )}

              {currentTab === 'control-center' && (
                <ControlCenterTab
                  workflows={workflows}
                  integrations={integrations}
                  executions={executions}
                  incidents={incidents}
                  recoveryRequests={recoveryRequests}
                  currentUserRole={userRole}
                  timezone={timezone}
                />
              )}

          {currentTab === 'incidents' && (
            <IncidentsTab
              incidents={incidents}
              timezone={timezone}
              onSelectIncident={(inc) => setSelectedIncidentForDiag(inc)}
              onOpenDiagnosis={(inc) => setSelectedIncidentForDiag(inc)}
              onExecuteRecovery={() => selectDashboardTab('recovery')}
            />
          )}

          {currentTab === 'diagnosis' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
                  AI Root Cause Diagnosis Engine
                </h2>
                <p className="text-xs text-[#B5AA99]">
                  Select an incident below to inspect or re-run Gemini AI and deterministic root-cause analysis
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {incidents.map((inc) => (
                  <button
                    key={inc.id}
                    type="button"
                    onClick={() => setSelectedIncidentForDiag(inc)}
                    className="w-full text-left rounded-xl border border-[#383838] bg-[#202020] p-5 cursor-pointer hover:border-[#B5AA99]/60 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-[#C52A18] font-bold">#{inc.id}</span>
                      <StatusBadge
                        label={inc.severity}
                        tone={inc.severity === 'CRITICAL' ? 'error' : 'warning'}
                      />
                    </div>
                    <h4 className="text-sm font-bold text-[#E9E5DC] mt-2">{inc.workflowName}</h4>
                    <p className="text-xs text-[#B5AA99] mt-0.5">
                      {inc.clientName} · {inc.platform}
                    </p>

                    <p className="mt-3 text-xs text-[#E88A7E] font-mono bg-[#171717] p-2.5 rounded-lg border border-[#383838] truncate">
                      {inc.errorMessage}
                    </p>

                    <div className="mt-4 pt-3 border-t border-[#383838] flex items-center justify-between text-xs">
                      <span className="text-[#B5AA99]">
                        {inc.aiDiagnosis ? 'Diagnosis ready' : 'Diagnosis pending'}
                      </span>
                      <span className="text-[#E9E5DC] font-semibold">Inspect Diagnosis →</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentTab === 'recovery' && (
            <RecoveryCenterTab
              incidents={incidents}
              recoveryRequests={recoveryRequests}
              recoveryMetrics={recoveryMetrics}
              recoveryPolicy={recoveryPolicy}
              approvals={approvals}
              timezone={timezone}
              onCreateRecoveryRequest={handleCreateRecoveryRequest}
              onExecuteRecoveryRequest={handleExecuteRecoveryRequest}
              onCancelRecoveryRequest={handleCancelRecoveryRequest}
              onUpdateRecoveryPolicy={handleUpdateRecoveryPolicy}
              onExecuteRecovery={handleExecuteRecovery}
              isExecutingRecovery={isExecutingRecovery}
            />
          )}

          {currentTab === 'approvals' && (
            <ApprovalsTab
              approvals={approvals}
              timezone={timezone}
              onRespondApproval={handleRespondApproval}
              onCancelApproval={handleCancelApproval}
              isProcessing={isApprovalProcessing}
            />
          )}

          {currentTab === 'workflows' && (
            <WorkflowsTab
              workflows={workflows}
              executions={executions}
              clients={clients}
              integrations={integrations}
              timezone={timezone}
              onAddWorkflow={handleAddWorkflow}
              onTriggerSync={handleTriggerSync}
              onDetectStuck={handleDetectStuck}
              isSyncing={isSyncing}
              isDetectingStuck={isDetectingStuck}
            />
          )}

          {currentTab === 'clients' && (
            <ClientsTab
              clients={clients}
              onAddClient={handleAddClient}
              onUpdateClient={handleUpdateClient}
              onDeleteClient={handleDeleteClient}
            />
          )}

          {currentTab === 'integrations' && (
            <IntegrationsTab
              integrations={integrations}
              timezone={timezone}
              onAddIntegration={handleAddIntegration}
              onTestConnection={handleTestConnection}
              onTriggerSync={handleTriggerSync}
              isSyncing={isSyncing}
            />
          )}

          {currentTab === 'analytics' && (
            <AnalyticsTab stats={stats} clients={clients} incidents={incidents} />
          )}

          {currentTab === 'alerts' && (
            <AlertsSlaTab
              timezone={timezone}
              currentUserRole={userRole}
              onDataChanged={refreshAllData}
            />
          )}

          {currentTab === 'assistant' && (
            <AssistantTab onSendMessage={handleSendAssistantMessage} isThinking={isThinkingAssistant} />
          )}

          {currentTab === 'audit' && (
            <AuditLogTab
              logs={auditLogs}
              timezone={timezone}
              onRefresh={handleRefreshAuditLogs}
              isLoading={isRefreshingAudit}
            />
          )}

          {currentTab === 'team' && (
            <TeamTab
              members={teamMembers}
              invitations={invitations}
              currentUserRole={userRole}
              onInviteMember={handleInviteMember}
              onUpdateMemberRole={handleUpdateMemberRole}
              onRemoveMember={handleRemoveMember}
              onRevokeInvitation={handleRevokeInvitation}
            />
          )}

          {currentTab === 'billing' && (
            <BillingTab agency={agency} onUpgradeTier={handleUpgradeTier} />
          )}

          {currentTab === 'settings' && (
            <SettingsTab
              agency={agency}
              timezone={timezone}
              notificationPreferences={notificationPreferences}
              onUpdateAgencyName={handleUpdateAgencyName}
              onUpdateAgencyProfile={handleUpdateAgencyProfile}
              onUpdateTimezone={handleUpdateTimezone}
              onUpdateNotificationPreferences={handleUpdateNotificationPreferences}
            />
          )}
            </>
          )}
        </main>
      </div>

      {selectedIncidentForDiag && (
        <AIDiagnosisModal
          incident={selectedIncidentForDiag}
          onClose={() => setSelectedIncidentForDiag(null)}
          onTriggerReanalyze={handleTriggerReanalyze}
          onProceedToRecovery={() => {
            setSelectedIncidentForDiag(null);
            selectDashboardTab('recovery');
          }}
          isAnalyzing={isAnalyzing}
        />
      )}

      {showOnboarding && (
        <OnboardingModal
          currentAgency={agency}
          onClose={() => setShowOnboarding(false)}
          onComplete={handleOnboardingComplete}
        />
      )}
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

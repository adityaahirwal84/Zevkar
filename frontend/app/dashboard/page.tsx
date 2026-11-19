'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Cpu,
  RefreshCw,
  ShieldCheck,
  Layers,
  ChevronRight,
  TrendingUp,
  Server,
  LogOut,
  Globe,
  Clock,
  CheckCircle2,
  Circle,
  ArrowRight,
  BellRing,
  Activity,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { DoctorBrandMark } from '@/components/NextMarketingShell';
import { useAuth } from '@/components/AuthProvider';

function formatTimestampInZone(iso: string | undefined | null, timezone: string): string {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'N/A';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, orgName, onboardingCompleted, onboardingStep, dashboardRoute, logout } = useAuth();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [slaReport, setSlaReport] = useState<any | null>(null);
  const [timezone, setTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });
  const [backendHealth, setBackendHealth] = useState<'CHECKING' | 'ONLINE' | 'OFFLINE'>('CHECKING');
  const [loadingData, setLoadingData] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if ((user as any)?.timezone) {
      setTimezone((user as any).timezone);
    }
  }, [user]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    loadDashboardData();
  }, [isAuthenticated, isLoading, router]);

  async function selectAndFetchIncident(inc: any) {
    setSelectedIncident(inc);
    setLoadingDetail(true);
    try {
      const detail = await api.incidents.get(inc.id);
      setSelectedIncident(detail);
    } catch {
      // Keep summary view if detail request fails transiently
    } finally {
      setLoadingDetail(false);
    }
  }

  async function loadDashboardData() {
    setLoadingData(true);
    try {
      const readyRes = await api.health.ready();
      setBackendHealth(readyRes.status === 'ready' ? 'ONLINE' : 'OFFLINE');
    } catch {
      setBackendHealth('OFFLINE');
    }

    try {
      const [incList, wfList, appList, integList, execList, clientList, slaData, deliveryList] = await Promise.all([
        api.incidents.list(),
        api.workflows.list(),
        api.approvals.list().catch(() => []),
        api.integrations.list().catch(() => []),
        api.workflows.recentExecutions(undefined, undefined, 20).catch(() => []),
        api.clients.list().catch(() => []),
        api.sla.getReport().catch(() => null),
        api.alerts.listDeliveries(8).catch(() => []),
      ]);
      const safeIncidents = incList || [];
      setIncidents(safeIncidents);
      setWorkflows(wfList || []);
      setApprovals(appList || []);
      setIntegrations(integList || []);
      setExecutions(execList || []);
      setClients(clientList || []);
      setSlaReport(slaData);
      setDeliveries(deliveryList || []);

      if (safeIncidents.length > 0) {
        const target =
          (selectedIncident && safeIncidents.find((i: any) => i.id === selectedIncident.id)) || safeIncidents[0];
        await selectAndFetchIncident(target);
      } else {
        setSelectedIncident(null);
      }
    } catch (e: any) {
      setErrorMsg(`Failed to load dashboard telemetry: ${e.message}`);
    } finally {
      setLoadingData(false);
    }
  }

  async function handleSyncAndCheckStuck() {
    setSyncing(true);
    setErrorMsg(null);
    try {
      const n8nInt = integrations.find((i) => i.platform === 'n8n') || integrations[0];
      if (n8nInt) {
        await api.integrations.sync(n8nInt.id);
      }
      await api.workflows.detectStuck();
      await loadDashboardData();
    } catch (err: any) {
      setErrorMsg(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleTriggerDiagnosis(incidentId: string) {
    setDiagnosing(true);
    setErrorMsg(null);
    try {
      await api.diagnosis.trigger(incidentId);
      const refreshed = await api.incidents.get(incidentId);
      setSelectedIncident(refreshed);
      setIncidents((prev) =>
        prev.map((inc) => (inc.id === incidentId ? { ...inc, diagnosis_status: 'DIAGNOSED', status: refreshed.status } : inc))
      );
    } catch (err: any) {
      setErrorMsg(`AI Diagnosis request failed: ${err.message}`);
    } finally {
      setDiagnosing(false);
    }
  }

  async function handleTriggerRecovery(incidentId: string) {
    setRecovering(true);
    setErrorMsg(null);
    try {
      await api.recovery.trigger({ incident_id: incidentId, action: 'MANUAL_RETRY' });
      await loadDashboardData();
    } catch (err: any) {
      setErrorMsg(`Recovery failed: ${err.message}`);
    } finally {
      setRecovering(false);
    }
  }

  async function handleUpdateIncidentStatus(incidentId: string, nextStatus: string) {
    setUpdatingStatus(true);
    setErrorMsg(null);
    try {
      await api.incidents.updateStatus(incidentId, nextStatus);
      await loadDashboardData();
    } catch (err: any) {
      setErrorMsg(`Failed to update incident status: ${err.message}`);
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleSignOut() {
    await logout();
    router.push('/login');
  }

  const diag = selectedIncident?.ai_diagnosis ?? selectedIncident?.aiDiagnosis ?? null;
  const diagIsAi = diag ? Boolean(diag.isAiGenerated ?? diag.is_ai_generated) : false;
  const diagFallbackReason = diag?.fallbackReason || diag?.fallback_reason;
  const verifiedFacts: string[] = diag?.verified_facts || diag?.verifiedFacts || [];
  const aiHypotheses: string[] = diag?.ai_hypotheses || diag?.aiHypotheses || [];
  const recoveryRequests: any[] = selectedIncident?.recovery_requests || [];
  const latestRecovery = recoveryRequests[0] || null;

  return (
    <div className="min-h-screen bg-[#1B180D] text-[#E8E3D8] flex flex-col">
      <header className="border-b border-[#2E2D26] bg-[#1B180D] px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={dashboardRoute}
            onClick={() => {
              if (incidents.length > 0) selectAndFetchIncident(incidents[0]);
            }}
            aria-label="Zevkar dashboard home"
            className="flex items-center"
          >
            <DoctorBrandMark />
          </Link>
          {orgName && (
            <span className="hidden md:inline-flex items-center rounded-md border border-[#383838] bg-[#202020] px-2.5 py-1 text-xs font-medium text-[#E9E5DC]">
              {orgName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden xl:inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] px-2.5 py-1 text-[11px] font-mono text-[#B5AA99]">
            <Clock className="w-3 h-3 text-[#C52A18]" />
            {timezone}
          </span>
          <Link
            href="/dashboard/control-center"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] hover:border-[#C52A18] px-3 py-1.5 text-xs font-medium text-[#E9E5DC] transition-colors"
          >
            <Activity className="w-3.5 h-3.5 text-[#C52A18]" aria-hidden="true" />
            <span>Control Center</span>
          </Link>
          <Link
            href="/dashboard/alerts"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] hover:border-[#C52A18] px-3 py-1.5 text-xs font-medium text-[#E9E5DC] transition-colors"
          >
            <BellRing className="w-3.5 h-3.5 text-[#C52A18]" aria-hidden="true" />
            <span>SLA &amp; Alerts</span>
            {slaReport?.status && (
              <span
                className={`ml-1 rounded px-1.5 py-0.5 font-mono text-[10px] ${
                  slaReport.status === 'BREACHING'
                    ? 'bg-[#2B1513] text-[#E88A7E]'
                    : slaReport.status === 'AT_RISK'
                    ? 'bg-[#2D2414] text-[#E2B066]'
                    : 'bg-[#1C2A20] text-[#8CC59B]'
                }`}
              >
                {slaReport.status}
              </span>
            )}
          </Link>
          <Link
            href="/dashboard/recovery"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#544021] bg-[#211D10] hover:border-[#C52A18] px-3 py-1.5 text-xs font-medium text-[#E9E5DC] transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#C52A18]" aria-hidden="true" />
            <span>Recovery Engine</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] px-3 py-1.5 text-xs font-medium text-[#E9E5DC] transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-[#B5AA99]" aria-hidden="true" />
            <span>Website</span>
          </Link>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono border border-[#383838] bg-[#202020]">
            <Server className="w-3.5 h-3.5 text-[#B5AA99]" />
            <span className="text-[#B5AA99]">FastAPI:</span>
            {backendHealth === 'ONLINE' ? (
              <span className="text-[#8CC59B] font-semibold">ONLINE</span>
            ) : backendHealth === 'CHECKING' ? (
              <span className="text-[#E2B066]">CHECKING...</span>
            ) : (
              <span className="text-[#E88A7E] font-semibold">OFFLINE (PORT 8000)</span>
            )}
          </div>
          <button
            onClick={handleSyncAndCheckStuck}
            disabled={syncing}
            className="px-3 py-1.5 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] text-xs font-semibold text-[#E9E5DC] flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Sync n8n & Detect Stuck Runs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync n8n'}</span>
          </button>
          <button
            onClick={handleSignOut}
            className="p-2 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] text-[#B5AA99] hover:text-[#E9E5DC] transition-colors"
            title="Sign Out"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        {onboardingCompleted === false && (
          <div className="rounded-xl border border-[#544021] bg-[#211D10] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-mono text-[#E2B066]">ONBOARDING STEP {onboardingStep}/8</p>
              <h2 className="text-base font-bold text-[#E9E5DC] mt-0.5">Complete your Zevkar workspace setup</h2>
              <p className="text-xs text-[#B5AA99] mt-0.5">
                Resume the guided setup wizard to add your client portfolio, connect n8n or webhooks, and verify your first sync.
              </p>
            </div>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 text-xs font-semibold text-[#E9E5DC] shrink-0"
            >
              <span>Resume Setup ({onboardingStep}/8)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        <div className="rounded-xl border border-[#383838] bg-[#202020] p-5">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#383838]">
            <div>
              <h2 className="text-sm font-bold text-[#E9E5DC]">Getting Started Checklist</h2>
              <p className="text-xs text-[#B5AA99]">Activation milestones for {orgName || 'your workspace'}</p>
            </div>
            <Link href="/onboarding" className="text-xs font-semibold text-[#E9E5DC] hover:text-[#C52A18]">
              Open Setup Wizard
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {[
              { label: 'Client portfolio added', done: clients.length > 0 },
              { label: 'Integration connected', done: integrations.length > 0 },
              { label: 'Workflows synchronized', done: workflows.length > 0 },
              { label: 'Executions monitored', done: executions.length > 0 },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-[#383838] bg-[#171717] p-3 flex items-center gap-2">
                {item.done ? (
                  <CheckCircle2 className="w-4 h-4 text-[#8CC59B] shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-[#B5AA99] shrink-0" />
                )}
                <span className={item.done ? 'text-[#E9E5DC] font-medium' : 'text-[#B5AA99]'}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-[#202020] border border-[#383838]">
            <div className="flex items-center justify-between text-[#B5AA99] text-xs font-medium uppercase tracking-wider">
              <span>Active Incidents</span>
              <AlertTriangle className="w-4 h-4 text-[#E88A7E]" />
            </div>
            <div className="mt-3 text-3xl font-extrabold text-[#E9E5DC] tabular-nums">
              {incidents.filter((i) => !['RESOLVED', 'IGNORED', 'DISMISSED'].includes(i.status)).length}
            </div>
            <p className="mt-1 text-xs text-[#E88A7E]">Requiring triage</p>
          </div>

          <div className="p-5 rounded-xl bg-[#202020] border border-[#383838]">
            <div className="flex items-center justify-between text-[#B5AA99] text-xs font-medium uppercase tracking-wider">
              <span>Monitored Workflows</span>
              <Layers className="w-4 h-4 text-[#C52A18]" />
            </div>
            <div className="mt-3 text-3xl font-extrabold text-[#E9E5DC] tabular-nums">
              {workflows.length}
            </div>
            <p className="mt-1 text-xs text-[#B5AA99]">Across n8n, Make &amp; Zapier</p>
          </div>

          <div className="p-5 rounded-xl bg-[#202020] border border-[#383838]">
            <div className="flex items-center justify-between text-[#B5AA99] text-xs font-medium uppercase tracking-wider">
              <span>Pending Approvals</span>
              <ShieldCheck className="w-4 h-4 text-[#E2B066]" />
            </div>
            <div className="mt-3 text-3xl font-extrabold text-[#E9E5DC] tabular-nums">
              {approvals.filter((a) => a.status === 'PENDING').length}
            </div>
            <p className="mt-1 text-xs text-[#E2B066]">Safety gates active</p>
          </div>

          <div className="p-5 rounded-xl bg-[#202020] border border-[#383838]">
            <div className="flex items-center justify-between text-[#B5AA99] text-xs font-medium uppercase tracking-wider">
              <span>Recent Executions</span>
              <TrendingUp className="w-4 h-4 text-[#8CC59B]" />
            </div>
            <div className="mt-3 text-3xl font-extrabold text-[#E9E5DC] tabular-nums">
              {executions.length}
            </div>
            <p className="mt-1 text-xs text-[#B5AA99]">Backend {backendHealth}</p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-xl bg-[#2B1513] border border-[#61231C] text-[#E88A7E] text-sm flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-[#E9E5DC]">
              &times;
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-[#202020] border border-[#383838] rounded-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-[#383838] flex items-center justify-between bg-[#1D1D1D]">
              <h2 className="text-sm font-semibold text-[#E9E5DC] uppercase tracking-wider">Incident Queue</h2>
              <span className="text-xs px-2 py-0.5 rounded border border-[#383838] bg-[#171717] text-[#B5AA99] tabular-nums">
                {incidents.length} Detected
              </span>
            </div>

            <div className="divide-y divide-[#383838] max-h-[560px] overflow-y-auto">
              {loadingData && incidents.length === 0 ? (
                <div className="p-8 text-center text-[#B5AA99] text-sm">Loading live incidents...</div>
              ) : incidents.length === 0 ? (
                <div className="p-8 text-center text-[#B5AA99] text-sm">
                  {workflows.length === 0 && integrations.length === 0
                    ? 'No automations connected yet. Complete onboarding or connect an integration to begin monitoring.'
                    : 'No active incidents detected across monitored workflows.'}
                </div>
              ) : (
                incidents.map((inc) => (
                  <button
                    key={inc.id}
                    onClick={() => selectAndFetchIncident(inc)}
                    className={`w-full text-left p-4 hover:bg-[#171717]/60 transition-colors flex items-start justify-between ${
                      selectedIncident?.id === inc.id ? 'bg-[#211D10]' : ''
                    }`}
                  >
                    <div className="space-y-1 min-w-0 pr-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border border-[#61231C] bg-[#2B1513] text-[#E88A7E]">
                          {inc.severity}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#383838] bg-[#171717] text-[#B5AA99]">
                          {inc.diagnosis_status || 'PENDING'}
                        </span>
                        {inc.recovery_status && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#544021] bg-[#211D10] text-[#E2B066]">
                            REC: {inc.recovery_status}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-[#E9E5DC] truncate">
                        {inc.workflow_name || inc.workflowName || inc.workflow_id}
                      </div>
                      <div className="text-xs text-[#B5AA99] line-clamp-1">
                        {inc.error_message || inc.errorMessage}
                      </div>
                      <div className="text-[11px] font-mono text-[#B5AA99]">
                        {formatTimestampInZone(inc.last_detected_at || inc.lastDetectedAt, timezone)}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#B5AA99] mt-1 shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-7 bg-[#202020] border border-[#383838] rounded-xl p-6 flex flex-col justify-between">
            {selectedIncident ? (
              <div className="space-y-5">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-mono text-[#C52A18]">INCIDENT ID: {selectedIncident.id}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded border border-[#383838] bg-[#171717] text-[#E9E5DC]">
                        STATUS: {selectedIncident.status}
                      </span>
                      {selectedIncident.recovery_status && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded border border-[#544021] bg-[#211D10] text-[#E2B066]">
                          RECOVERY: {selectedIncident.recovery_status}
                        </span>
                      )}
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-[#E9E5DC] mt-1">
                    {selectedIncident.workflow_name || selectedIncident.workflowName || 'Workflow Execution Failure'}
                  </h3>
                  <p className="text-xs text-[#B5AA99] mt-1">
                    Execution {selectedIncident.execution_id} · Category {selectedIncident.error_category} · Last detected:{' '}
                    {formatTimestampInZone(selectedIncident.last_detected_at || selectedIncident.lastDetectedAt, timezone)}
                  </p>
                  <p className="mt-2 text-xs font-mono p-3 rounded-lg bg-[#171717] border border-[#383838] text-[#E88A7E] break-all">
                    {selectedIncident.error_message || selectedIncident.errorMessage}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#211D10] border border-[#383838] space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-[#E9E5DC] text-sm font-semibold">
                      <Cpu className="w-4 h-4 text-[#C52A18]" />
                      <span>AI Root Cause Diagnosis</span>
                    </div>
                    {loadingDetail ? (
                      <span className="text-[11px] font-mono text-[#B5AA99]">Loading persisted diagnosis...</span>
                    ) : diag ? (
                      <span
                        className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                          diagIsAi
                            ? 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]'
                            : 'border-[#544021] bg-[#2D2414] text-[#E2B066]'
                        }`}
                      >
                        {diagIsAi
                          ? `Gemini (${diag.model_used || diag.modelUsed || 'gemini-4-hydrogen'})`
                          : 'Deterministic Fallback'}
                      </span>
                    ) : null}
                  </div>

                  {diag ? (
                    <div className="space-y-3 text-xs text-[#B5AA99]">
                      {diagFallbackReason && !diagIsAi && (
                        <div className="text-[11px] text-[#E2B066]">
                          Fallback reason: {diagFallbackReason}
                        </div>
                      )}
                      <div>
                        <span className="text-[#E9E5DC] font-medium">Root Cause: </span>
                        <span>{diag.root_cause || diag.rootCause}</span>
                      </div>
                      <div>
                        <span className="text-[#E9E5DC] font-medium">Recommended Recovery: </span>
                        <span>{diag.suggested_recovery || diag.suggestedRecovery}</span>
                        {(diag.recommended_strategy || diag.expected_risk_level) && (
                          <span className="ml-2 font-mono text-[11px] text-[#E2B066]">
                            [{diag.recommended_strategy || 'MANUAL_RECOVERY'} · {diag.expected_risk_level || 'HIGH'} RISK]
                          </span>
                        )}
                      </div>

                      {verifiedFacts.length > 0 && (
                        <div className="rounded border border-[#2E4A36] bg-[#171717] p-2.5">
                          <span className="block text-[10px] font-mono uppercase text-[#8CC59B] mb-1">
                            Verified Telemetry Facts
                          </span>
                          <ul className="list-disc pl-4 space-y-0.5 text-[#E9E5DC]">
                            {verifiedFacts.map((fact, idx) => (
                              <li key={idx}>{fact}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {aiHypotheses.length > 0 && (
                        <div className="rounded border border-[#544021] bg-[#171717] p-2.5">
                          <span className="block text-[10px] font-mono uppercase text-[#E2B066] mb-1">
                            {diagIsAi ? 'AI Diagnostic Hypotheses' : 'Rule-Based Hypotheses'}
                          </span>
                          <ul className="list-disc pl-4 space-y-0.5 text-[#B5AA99]">
                            {aiHypotheses.map((hyp, idx) => (
                              <li key={idx}>{hyp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-[#B5AA99]">
                      No diagnosis recorded yet. Trigger AI root-cause analysis below.
                    </div>
                  )}

                  {latestRecovery && (
                    <div className="rounded border border-[#383838] bg-[#171717] p-2.5 text-xs">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-[#E9E5DC]">
                          Latest Recovery: {latestRecovery.strategy} ({latestRecovery.status})
                        </span>
                        <Link href={`/dashboard/recovery/${latestRecovery.id}`} className="text-[#C52A18] hover:underline">
                          Inspect #{latestRecovery.id.slice(0, 8)}
                        </Link>
                      </div>
                      {(latestRecovery.final_result_summary || latestRecovery.last_error) && (
                        <p className="mt-1 text-[#B5AA99]">
                          {latestRecovery.final_result_summary || latestRecovery.last_error}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="pt-2 flex flex-wrap items-center gap-2.5">
                    <button
                      onClick={() => handleTriggerDiagnosis(selectedIncident.id)}
                      disabled={diagnosing}
                      className="px-3.5 py-2 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] disabled:opacity-50 text-[#E9E5DC] text-xs font-semibold flex items-center gap-2 transition-colors"
                    >
                      <Cpu className="w-3.5 h-3.5 text-[#C52A18]" />
                      <span>{diagnosing ? 'Diagnosing...' : 'Diagnose with Gemini'}</span>
                    </button>

                    <button
                      onClick={() => handleTriggerRecovery(selectedIncident.id)}
                      disabled={recovering}
                      className="px-3.5 py-2 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-50 text-[#E9E5DC] text-xs font-semibold flex items-center gap-2 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${recovering ? 'animate-spin' : ''}`} />
                      <span>{recovering ? 'Executing...' : 'Execute Idempotent Recovery'}</span>
                    </button>

                    {selectedIncident.status !== 'INVESTIGATING' && selectedIncident.status !== 'RESOLVED' && (
                      <button
                        onClick={() => handleUpdateIncidentStatus(selectedIncident.id, 'INVESTIGATING')}
                        disabled={updatingStatus}
                        className="px-3 py-2 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] text-[#E9E5DC] text-xs"
                      >
                        Mark Investigating
                      </button>
                    )}

                    {selectedIncident.status !== 'DISMISSED' && selectedIncident.status !== 'RESOLVED' && (
                      <button
                        onClick={() => handleUpdateIncidentStatus(selectedIncident.id, 'DISMISSED')}
                        disabled={updatingStatus}
                        className="px-3 py-2 rounded-md border border-[#383838] bg-[#171717] hover:border-[#61231C] text-[#B5AA99] text-xs"
                      >
                        Dismiss
                      </button>
                    )}

                    <Link
                      href="/dashboard/recovery"
                      className="px-3.5 py-2 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] text-[#E9E5DC] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[#C52A18]" />
                      <span>Recovery Queue</span>
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[#B5AA99] text-sm">
                Select an incident to inspect diagnosis and recovery options.
              </div>
            )}
          </div>
        </div>

        {/* Monitored Workflows & Recent Alert Deliveries */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-[#202020] border border-[#383838] rounded-xl overflow-hidden">
            <div className="p-4 border-b border-[#383838] flex items-center justify-between bg-[#1D1D1D]">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#C52A18]" />
                <h2 className="text-sm font-semibold text-[#E9E5DC] uppercase tracking-wider">Monitored Workflows</h2>
              </div>
              <span className="text-xs text-[#B5AA99] tabular-nums">{workflows.length} total</span>
            </div>
            {workflows.length === 0 ? (
              <div className="p-6 text-xs text-[#B5AA99]">No workflows synchronized yet. Click &quot;Sync n8n&quot; above.</div>
            ) : (
              <div className="divide-y divide-[#383838]">
                {workflows.slice(0, 8).map((wf) => (
                  <div key={wf.id} className="px-4 py-3 flex items-center justify-between gap-4 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-[#E9E5DC] truncate">{wf.name}</div>
                      <div className="text-[#B5AA99] font-mono text-[11px] truncate">
                        {wf.platform} · Avg {wf.avg_duration_ms ? `${Math.round(wf.avg_duration_ms / 1000)}s` : 'N/A'} ·{' '}
                        {wf.allow_long_running
                          ? 'Long-running allowed'
                          : `Stuck > ${wf.stuck_timeout_seconds || 900}s`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono text-[#B5AA99]">
                        {wf.consecutive_failures || 0} fails
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                          wf.health_status === 'HEALTHY'
                            ? 'bg-[#1C2A20] text-[#8CC59B]'
                            : wf.health_status === 'DEGRADED'
                            ? 'bg-[#2D2414] text-[#E2B066]'
                            : 'bg-[#2B1513] text-[#E88A7E]'
                        }`}
                      >
                        {wf.health_status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-[#202020] border border-[#383838] rounded-xl overflow-hidden">
            <div className="p-4 border-b border-[#383838] flex items-center justify-between bg-[#1D1D1D]">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-[#C52A18]" />
                <h2 className="text-sm font-semibold text-[#E9E5DC] uppercase tracking-wider">Recent Alert Deliveries</h2>
              </div>
              <Link href="/dashboard/alerts" className="text-xs font-semibold text-[#E9E5DC] hover:text-[#C52A18]">
                Manage Channels
              </Link>
            </div>
            {deliveries.length === 0 ? (
              <div className="p-6 text-xs text-[#B5AA99]">
                No alert deliveries recorded yet. Configure Slack, Discord, PagerDuty, Email, or Webhook channels in SLA &amp; Alerts.
              </div>
            ) : (
              <div className="divide-y divide-[#383838]">
                {deliveries.slice(0, 6).map((d) => (
                  <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-[#E9E5DC] truncate">{d.title}</div>
                      <div className="text-[#B5AA99] font-mono text-[11px] truncate">
                        {d.channel_name} ({d.channel_type}) · {d.event_type}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[11px] shrink-0 ${
                        d.status === 'DELIVERED'
                          ? 'bg-[#1C2A20] text-[#8CC59B]'
                          : d.status === 'QUEUED'
                          ? 'bg-[#2D2414] text-[#E2B066]'
                          : 'bg-[#2B1513] text-[#E88A7E]'
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#202020] border border-[#383838] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#383838] flex items-center justify-between bg-[#1D1D1D]">
            <h2 className="text-sm font-semibold text-[#E9E5DC] uppercase tracking-wider">Recent Workflow Executions</h2>
            <span className="text-xs text-[#B5AA99] font-mono">Timezone: {timezone}</span>
          </div>
          {executions.length === 0 ? (
            <div className="p-6 text-xs text-[#B5AA99]">No recent executions synced yet. Click &quot;Sync n8n&quot; above.</div>
          ) : (
            <div className="divide-y divide-[#383838]">
              {executions.slice(0, 10).map((ex) => (
                <div key={ex.id} className="px-4 py-3 flex items-center justify-between gap-4 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#E9E5DC] truncate">{ex.workflow_name || ex.workflow_id}</div>
                    <div className="text-[#B5AA99] font-mono truncate">
                      {ex.external_execution_id} · {formatTimestampInZone(ex.started_at, timezone)}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[11px] shrink-0 ${
                      ex.status === 'SUCCESS'
                        ? 'bg-[#1C2A20] text-[#8CC59B]'
                        : ex.status === 'RUNNING'
                        ? 'bg-[#2D2414] text-[#E2B066]'
                        : 'bg-[#2B1513] text-[#E88A7E]'
                    }`}
                  >
                    {ex.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}


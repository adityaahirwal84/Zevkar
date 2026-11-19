'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/components/AuthProvider';
import { DoctorBrandMark } from '@/components/NextMarketingShell';

const STRATEGIES = [
  'RETRY_EXECUTION',
  'REEXECUTE_WORKFLOW',
  'RETRY_AFTER_DELAY',
  'RETRY_EXPONENTIAL_BACKOFF',
  'MANUAL_RECOVERY',
  'MARK_NON_RECOVERABLE',
  'ESCALATE_HUMAN',
];

export default function RecoveryDashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, dashboardRoute } = useAuth();

  const [selectedIncidentId, setSelectedIncidentId] = useState('');
  const [strategy, setStrategy] = useState('RETRY_EXPONENTIAL_BACKOFF');
  const [reason, setReason] = useState('');
  const [showPolicy, setShowPolicy] = useState(false);
  const [banner, setBanner] = useState<{ type: 'info' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const metricsQuery = useQuery({
    queryKey: ['recovery', 'metrics'],
    queryFn: () => api.recovery.metrics(),
    enabled: isAuthenticated,
  });

  const policyQuery = useQuery({
    queryKey: ['recovery', 'policy'],
    queryFn: () => api.recovery.getPolicy(),
    enabled: isAuthenticated,
  });

  const requestsQuery = useQuery({
    queryKey: ['recovery', 'requests'],
    queryFn: () => api.recovery.listRequests(),
    enabled: isAuthenticated,
  });

  const approvalsQuery = useQuery({
    queryKey: ['approvals', 'list'],
    queryFn: () => api.approvals.list(),
    enabled: isAuthenticated,
  });

  const incidentsQuery = useQuery({
    queryKey: ['incidents', 'open'],
    queryFn: () => api.incidents.list(),
    enabled: isAuthenticated,
  });

  const [policyForm, setPolicyForm] = useState({
    approval_required: true,
    auto_recovery_enabled: false,
    max_retry_attempts: 3,
    retry_delay_seconds: 60,
    use_exponential_backoff: true,
    cooldown_seconds: 120,
  });

  useEffect(() => {
    if (policyQuery.data) {
      setPolicyForm({
        approval_required: Boolean(policyQuery.data.approval_required),
        auto_recovery_enabled: Boolean(policyQuery.data.auto_recovery_enabled),
        max_retry_attempts: Number(policyQuery.data.max_retry_attempts ?? 3),
        retry_delay_seconds: Number(policyQuery.data.retry_delay_seconds ?? 60),
        use_exponential_backoff: Boolean(policyQuery.data.use_exponential_backoff ?? true),
        cooldown_seconds: Number(policyQuery.data.cooldown_seconds ?? 120),
      });
    }
  }, [policyQuery.data]);

  const openIncidents = (incidentsQuery.data || []).filter((i: any) => i.status !== 'RESOLVED' && i.status !== 'IGNORED');
  useEffect(() => {
    if (!selectedIncidentId && openIncidents.length > 0) {
      setSelectedIncidentId(openIncidents[0].id);
    }
  }, [openIncidents, selectedIncidentId]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['recovery'] });
    queryClient.invalidateQueries({ queryKey: ['approvals'] });
    queryClient.invalidateQueries({ queryKey: ['incidents'] });
  };

  const createRequestMutation = useMutation({
    mutationFn: () =>
      api.recovery.createRequest({
        incident_id: selectedIncidentId,
        strategy,
        reason: reason.trim() || undefined,
      }),
    onSuccess: (data) => {
      setReason('');
      setBanner({ type: 'info', text: `Created recovery request ${data.id} (${data.status}).` });
      invalidateAll();
    },
    onError: (err: any) => setBanner({ type: 'error', text: err.message }),
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => api.recovery.executeRequest(id),
    onSuccess: (data) => {
      setBanner({ type: 'info', text: data.details || `Execution status: ${data.status}` });
      invalidateAll();
    },
    onError: (err: any) => setBanner({ type: 'error', text: err.message }),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => api.recovery.verifyRequest(id),
    onSuccess: (data) => {
      setBanner({ type: 'info', text: data.details || `Verification status: ${data.verification_status}` });
      invalidateAll();
    },
    onError: (err: any) => setBanner({ type: 'error', text: err.message }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.recovery.cancelRequest(id, 'Cancelled via Recovery Dashboard'),
    onSuccess: () => {
      setBanner({ type: 'info', text: 'Recovery request cancelled.' });
      invalidateAll();
    },
    onError: (err: any) => setBanner({ type: 'error', text: err.message }),
  });

  const decideApprovalMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVE' | 'REJECT' }) =>
      api.approvals.decide(id, { decision, reason: decision === 'REJECT' ? 'Rejected via Recovery Dashboard' : undefined }),
    onSuccess: (data) => {
      setBanner({ type: 'info', text: `Approval decision recorded: ${data.status}` });
      invalidateAll();
    },
    onError: (err: any) => setBanner({ type: 'error', text: err.message }),
  });

  const updatePolicyMutation = useMutation({
    mutationFn: () => api.recovery.updatePolicy(policyForm),
    onSuccess: () => {
      setShowPolicy(false);
      setBanner({ type: 'info', text: 'Organization recovery policy updated.' });
      invalidateAll();
    },
    onError: (err: any) => setBanner({ type: 'error', text: err.message }),
  });

  const metrics = metricsQuery.data || {
    total_requests: 0,
    pending_approvals: 0,
    successful_recoveries: 0,
    failed_recoveries: 0,
    recovery_success_rate: 0,
  };
  const requests = requestsQuery.data || [];
  const pendingApprovals = (approvalsQuery.data || []).filter((a: any) => a.status === 'PENDING');

  return (
    <div className="min-h-screen bg-[#1B180D] text-[#E8E3D8] flex flex-col">
      <header className="border-b border-[#2E2D26] bg-[#1B180D] px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={dashboardRoute} aria-label="Zevkar dashboard home" className="flex items-center">
            <DoctorBrandMark />
          </Link>
          <Link
            href={dashboardRoute}
            className="inline-flex items-center gap-1.5 text-xs text-[#B5AA99] hover:text-[#E9E5DC]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Overview</span>
          </Link>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/dashboard/alerts"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] px-3 py-1.5 text-xs font-semibold text-[#E9E5DC]"
          >
            <span>SLA &amp; Alerts</span>
          </Link>
          <button
            onClick={() => setShowPolicy((s) => !s)}
            className="inline-flex items-center gap-2 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] px-3 py-1.5 text-xs font-semibold text-[#E9E5DC]"
          >
            <Sliders className="w-3.5 h-3.5 text-[#C52A18]" />
            <span>{showPolicy ? 'Hide Policy' : 'Recovery Policy'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#E9E5DC]">Intelligent Recovery Engine</h1>
            <p className="text-xs text-[#B5AA99] mt-1">
              Policy-governed failure diagnosis, risk assessment, human approvals, and verified n8n retries
            </p>
          </div>
          <button
            onClick={invalidateAll}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] px-3 py-1.5 text-xs text-[#E9E5DC]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {banner && (
          <div
            className={`p-3.5 rounded-lg border text-xs flex items-center justify-between ${
              banner.type === 'error'
                ? 'border-[#61231C] bg-[#2B1513] text-[#E88A7E]'
                : 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]'
            }`}
          >
            <span>{banner.text}</span>
            <button onClick={() => setBanner(null)}>&times;</button>
          </div>
        )}

        {/* Metrics computed from persisted DB records */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="rounded-xl border border-[#383838] bg-[#202020] p-4">
            <span className="text-[11px] uppercase text-[#B5AA99]">Total Requests</span>
            <div className="text-2xl font-extrabold text-[#E9E5DC] mt-1 tabular-nums">{metrics.total_requests}</div>
          </div>
          <div className="rounded-xl border border-[#383838] bg-[#202020] p-4">
            <span className="text-[11px] uppercase text-[#B5AA99]">Pending Approvals</span>
            <div className="text-2xl font-extrabold text-[#E2B066] mt-1 tabular-nums">{metrics.pending_approvals}</div>
          </div>
          <div className="rounded-xl border border-[#383838] bg-[#202020] p-4">
            <span className="text-[11px] uppercase text-[#B5AA99]">Successful</span>
            <div className="text-2xl font-extrabold text-[#8CC59B] mt-1 tabular-nums">{metrics.successful_recoveries}</div>
          </div>
          <div className="rounded-xl border border-[#383838] bg-[#202020] p-4">
            <span className="text-[11px] uppercase text-[#B5AA99]">Failed</span>
            <div className="text-2xl font-extrabold text-[#E88A7E] mt-1 tabular-nums">{metrics.failed_recoveries}</div>
          </div>
          <div className="rounded-xl border border-[#383838] bg-[#202020] p-4 col-span-2 lg:col-span-1">
            <span className="text-[11px] uppercase text-[#B5AA99]">Success Rate</span>
            <div className="text-2xl font-extrabold text-[#E9E5DC] mt-1 tabular-nums">{metrics.recovery_success_rate}%</div>
          </div>
        </div>

        {showPolicy && (
          <div className="rounded-xl border border-[#544021] bg-[#211D10] p-5 space-y-4 text-xs">
            <div className="flex items-center gap-2 font-semibold text-[#E9E5DC]">
              <ShieldCheck className="w-4 h-4 text-[#C52A18]" />
              <span>Organization Recovery Policy</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="rounded border border-[#383838] bg-[#171717] p-3 flex items-center justify-between">
                <span>Require Approval</span>
                <input
                  type="checkbox"
                  checked={policyForm.approval_required}
                  onChange={(e) => setPolicyForm((p) => ({ ...p, approval_required: e.target.checked }))}
                />
              </label>
              <label className="rounded border border-[#383838] bg-[#171717] p-3 flex items-center justify-between">
                <span>Enable Auto Recovery</span>
                <input
                  type="checkbox"
                  checked={policyForm.auto_recovery_enabled}
                  onChange={(e) => setPolicyForm((p) => ({ ...p, auto_recovery_enabled: e.target.checked }))}
                />
              </label>
              <label className="rounded border border-[#383838] bg-[#171717] p-3 flex items-center justify-between">
                <span>Exponential Backoff</span>
                <input
                  type="checkbox"
                  checked={policyForm.use_exponential_backoff}
                  onChange={(e) => setPolicyForm((p) => ({ ...p, use_exponential_backoff: e.target.checked }))}
                />
              </label>
              <div className="rounded border border-[#383838] bg-[#171717] p-3">
                <span className="block text-[10px] text-[#B5AA99] mb-1">Max Retry Attempts</span>
                <input
                  type="number"
                  value={policyForm.max_retry_attempts}
                  onChange={(e) => setPolicyForm((p) => ({ ...p, max_retry_attempts: Number(e.target.value) }))}
                  className="w-full rounded border border-[#383838] bg-[#202020] px-2 py-1"
                />
              </div>
              <div className="rounded border border-[#383838] bg-[#171717] p-3">
                <span className="block text-[10px] text-[#B5AA99] mb-1">Retry Delay (s)</span>
                <input
                  type="number"
                  value={policyForm.retry_delay_seconds}
                  onChange={(e) => setPolicyForm((p) => ({ ...p, retry_delay_seconds: Number(e.target.value) }))}
                  className="w-full rounded border border-[#383838] bg-[#202020] px-2 py-1"
                />
              </div>
              <div className="rounded border border-[#383838] bg-[#171717] p-3">
                <span className="block text-[10px] text-[#B5AA99] mb-1">Cooldown Window (s)</span>
                <input
                  type="number"
                  value={policyForm.cooldown_seconds}
                  onChange={(e) => setPolicyForm((p) => ({ ...p, cooldown_seconds: Number(e.target.value) }))}
                  className="w-full rounded border border-[#383838] bg-[#202020] px-2 py-1"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => updatePolicyMutation.mutate()}
                disabled={updatePolicyMutation.isPending}
                className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 font-semibold text-[#E9E5DC]"
              >
                Save Policy
              </button>
            </div>
          </div>
        )}

        {/* Create Recovery Request */}
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-4">
          <h2 className="text-sm font-bold text-[#E9E5DC]">Initiate Recovery Request</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <select
              value={selectedIncidentId}
              onChange={(e) => setSelectedIncidentId(e.target.value)}
              className="rounded border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
            >
              {openIncidents.length === 0 ? (
                <option value="">No open incidents</option>
              ) : (
                openIncidents.map((inc: any) => (
                  <option key={inc.id} value={inc.id}>
                    {inc.error_category} · {inc.id.slice(0, 8)}
                  </option>
                ))
              )}
            </select>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="rounded border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
            >
              {STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Operator justification..."
              className="rounded border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => createRequestMutation.mutate()}
              disabled={!selectedIncidentId || createRequestMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-40 px-4 py-2 text-xs font-semibold text-[#E9E5DC]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Recovery Request</span>
            </button>
          </div>
        </div>

        {/* Pending Approvals */}
        {pendingApprovals.length > 0 && (
          <div className="rounded-xl border border-[#544021] bg-[#211D10] p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#E2B066]">
              <ShieldAlert className="w-4 h-4" />
              <span>Pending Human Approvals ({pendingApprovals.length})</span>
            </div>
            {pendingApprovals.map((appr: any) => (
              <div
                key={appr.id}
                className="rounded-lg border border-[#383838] bg-[#171717] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-semibold text-[#E9E5DC]">{appr.proposed_action}</div>
                  <p className="text-[#B5AA99] mt-0.5">{appr.risk_reason}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => decideApprovalMutation.mutate({ id: appr.id, decision: 'REJECT' })}
                    className="rounded border border-[#383838] px-3 py-1.5 text-[#E88A7E] hover:border-[#61231C]"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => decideApprovalMutation.mutate({ id: appr.id, decision: 'APPROVE' })}
                    className="inline-flex items-center gap-1 rounded bg-[#A51B0B] hover:bg-[#C52A18] px-3 py-1.5 font-semibold text-[#E9E5DC]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent Recovery Activity */}
        <div className="rounded-xl border border-[#383838] bg-[#202020] overflow-hidden">
          <div className="p-4 border-b border-[#383838] flex items-center justify-between bg-[#1D1D1D]">
            <h2 className="text-sm font-semibold text-[#E9E5DC] uppercase tracking-wider">Recovery Activity</h2>
            <span className="text-xs text-[#B5AA99] tabular-nums">{requests.length} requests</span>
          </div>
          {requestsQuery.isLoading ? (
            <div className="p-8 text-center text-xs text-[#B5AA99]">Loading recovery requests...</div>
          ) : requestsQuery.isError ? (
            <div className="p-8 text-center text-xs text-[#E88A7E]">
              Failed to load recovery requests: {(requestsQuery.error as Error)?.message || 'Unknown error'}
            </div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#B5AA99]">No recovery requests recorded yet.</div>
          ) : (
            <div className="divide-y divide-[#383838]">
              {requests.map((r: any) => (
                <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/recovery/${r.id}`}
                        className="font-mono font-semibold text-[#C52A18] hover:underline"
                      >
                        #{r.id.slice(0, 12)}
                      </Link>
                      <span className="px-2 py-0.5 rounded border border-[#383838] bg-[#171717] font-mono text-[11px]">
                        {r.status}
                      </span>
                      <span className="text-[#B5AA99] font-mono">{r.strategy}</span>
                      <span className="text-[#E2B066] font-mono">{r.risk_level}</span>
                    </div>
                    <div className="text-[#E9E5DC] font-medium">{r.workflow_name || r.workflow_id}</div>
                    <div className="text-[#B5AA99] font-mono text-[11px]">
                      Retries: {r.retry_count}/{r.max_retry_attempts} · Verified: {r.result_verified ? 'YES' : 'NO'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/dashboard/recovery/${r.id}`}
                      className="rounded border border-[#383838] bg-[#171717] px-3 py-1.5 text-[#E9E5DC] hover:border-[#B5AA99]"
                    >
                      Inspect
                    </Link>
                    {['PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'FAILED'].includes(r.status) && (
                      <button
                        onClick={() => cancelMutation.mutate(r.id)}
                        className="inline-flex items-center gap-1 rounded border border-[#383838] bg-[#171717] px-2.5 py-1.5 text-[#B5AA99] hover:text-[#E9E5DC]"
                      >
                        <Ban className="w-3 h-3" />
                        <span>Cancel</span>
                      </button>
                    )}
                    {r.status === 'VERIFYING' && (
                      <button
                        onClick={() => verifyMutation.mutate(r.id)}
                        disabled={verifyMutation.isPending}
                        className="inline-flex items-center gap-1 rounded border border-[#544021] bg-[#211D10] hover:border-[#C52A18] px-3 py-1.5 font-semibold text-[#E2B066]"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Verify Outcome</span>
                      </button>
                    )}
                    {['APPROVED', 'SCHEDULED', 'FAILED'].includes(r.status) && r.is_recoverable && (
                      <button
                        onClick={() => executeMutation.mutate(r.id)}
                        disabled={executeMutation.isPending}
                        className="inline-flex items-center gap-1 rounded bg-[#A51B0B] hover:bg-[#C52A18] px-3 py-1.5 font-semibold text-[#E9E5DC]"
                      >
                        <Play className="w-3 h-3" />
                        <span>Execute</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

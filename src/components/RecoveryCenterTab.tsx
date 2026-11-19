import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  History,
  Lock,
  Sliders,
  Ban,
  Play,
  Plus,
  Activity,
  FileSearch,
} from 'lucide-react';
import {
  ApprovalRequest,
  Incident,
  RecoveryAttempt,
  RecoveryMetrics,
  RecoveryPolicy,
  RecoveryRequest,
  RecoveryStrategy,
} from '../types';
import { SUPPORTED_RECOVERY_STRATEGIES, computeRecoveryMetrics } from '../lib/recovery-engine';
import { formatInTimezone } from '../lib/datetime';
import { StatusBadge } from './marketing/StatusBadge';

interface RecoveryCenterTabProps {
  incidents: Incident[];
  recoveryRequests?: RecoveryRequest[];
  recoveryMetrics?: RecoveryMetrics | null;
  recoveryPolicy?: RecoveryPolicy | null;
  approvals?: ApprovalRequest[];
  timezone?: string;
  onCreateRecoveryRequest?: (params: {
    incidentId: string;
    strategy: RecoveryStrategy;
    delaySeconds?: number;
    reason?: string;
  }) => Promise<void>;
  onExecuteRecoveryRequest?: (requestId: string) => Promise<void>;
  onCancelRecoveryRequest?: (requestId: string, reason?: string) => Promise<void>;
  onUpdateRecoveryPolicy?: (updates: Partial<RecoveryPolicy>) => Promise<void>;
  onExecuteRecovery: (incidentId: string, bypassApproval?: boolean) => Promise<void>;
  isExecutingRecovery: boolean;
}

const STRATEGY_LABELS: Record<RecoveryStrategy, string> = {
  RETRY_EXECUTION: 'Immediate Retry Execution',
  RETRY_AFTER_DELAY: 'Retry After Fixed Delay',
  RETRY_EXPONENTIAL_BACKOFF: 'Retry With Exponential Backoff',
  MANUAL_RECOVERY: 'Manual Operator Recovery',
  MARK_NON_RECOVERABLE: 'Mark Non-Recoverable',
  ESCALATE_HUMAN: 'Escalate to Human Review',
};

function requestStatusTone(status: RecoveryRequest['status']): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'SUCCEEDED' || status === 'APPROVED') return 'success';
  if (status === 'PENDING_APPROVAL' || status === 'SCHEDULED' || status === 'EXECUTING' || status === 'VERIFYING')
    return 'warning';
  if (status === 'FAILED' || status === 'REJECTED') return 'error';
  return 'neutral';
}

export const RecoveryCenterTab: React.FC<RecoveryCenterTabProps> = ({
  incidents,
  recoveryRequests = [],
  recoveryMetrics,
  recoveryPolicy,
  approvals = [],
  timezone = 'UTC',
  onCreateRecoveryRequest,
  onExecuteRecoveryRequest,
  onCancelRecoveryRequest,
  onUpdateRecoveryPolicy,
  onExecuteRecovery,
  isExecutingRecovery,
}) => {
  const activeIncidents = incidents.filter((i) => i.status !== 'RESOLVED' && i.status !== 'IGNORED');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>(
    activeIncidents[0]?.id || incidents[0]?.id || ''
  );
  const [selectedStrategy, setSelectedStrategy] = useState<RecoveryStrategy>('MANUAL_RECOVERY');
  const [customDelay, setCustomDelay] = useState<number>(60);
  const [requestReason, setRequestReason] = useState<string>('');
  const [selectedRequestId, setSelectedRequestId] = useState<string>(recoveryRequests[0]?.id || '');
  const [showPolicyPanel, setShowPolicyPanel] = useState(false);

  // Local editable policy state
  const [policyForm, setPolicyForm] = useState<{
    approvalRequired: boolean;
    autoRecoveryEnabled: boolean;
    maxRetryAttempts: number;
    retryDelaySeconds: number;
    useExponentialBackoff: boolean;
    cooldownSeconds: number;
  }>({
    approvalRequired: recoveryPolicy?.approvalRequired ?? true,
    autoRecoveryEnabled: recoveryPolicy?.autoRecoveryEnabled ?? false,
    maxRetryAttempts: recoveryPolicy?.maxRetryAttempts ?? 3,
    retryDelaySeconds: recoveryPolicy?.retryDelaySeconds ?? 60,
    useExponentialBackoff: recoveryPolicy?.useExponentialBackoff ?? true,
    cooldownSeconds: recoveryPolicy?.cooldownSeconds ?? 120,
  });

  useEffect(() => {
    if (recoveryPolicy) {
      setPolicyForm({
        approvalRequired: recoveryPolicy.approvalRequired,
        autoRecoveryEnabled: recoveryPolicy.autoRecoveryEnabled,
        maxRetryAttempts: recoveryPolicy.maxRetryAttempts,
        retryDelaySeconds: recoveryPolicy.retryDelaySeconds,
        useExponentialBackoff: recoveryPolicy.useExponentialBackoff,
        cooldownSeconds: recoveryPolicy.cooldownSeconds,
      });
    }
  }, [recoveryPolicy]);

  useEffect(() => {
    if (!selectedRequestId && recoveryRequests.length > 0) {
      setSelectedRequestId(recoveryRequests[0].id);
    } else if (selectedRequestId && !recoveryRequests.some((r) => r.id === selectedRequestId)) {
      setSelectedRequestId(recoveryRequests[0]?.id || '');
    }
  }, [recoveryRequests, selectedRequestId]);

  const currentIncident =
    incidents.find((i) => i.id === selectedIncidentId) || activeIncidents[0] || incidents[0];

  useEffect(() => {
    if (currentIncident?.aiDiagnosis?.recommendedStrategy) {
      setSelectedStrategy(currentIncident.aiDiagnosis.recommendedStrategy);
    }
  }, [currentIncident?.id]);

  const currentRequest =
    recoveryRequests.find((r) => r.id === selectedRequestId) || recoveryRequests[0] || null;

  const metrics = recoveryMetrics || computeRecoveryMetrics(recoveryRequests);

  const linkedIncident = currentRequest
    ? incidents.find((i) => i.id === currentRequest.incidentId)
    : undefined;
  const linkedApprovals = currentRequest
    ? approvals.filter(
        (a) => a.recoveryRequestId === currentRequest.id || a.incidentId === currentRequest.incidentId
      )
    : [];
  const linkedAttempts = currentRequest
    ? (linkedIncident?.recoveryAttempts || []).filter(
        (a) => !a.recoveryRequestId || a.recoveryRequestId === currentRequest.id
      )
    : [];

  const allRecoveryAttempts: { attempt: RecoveryAttempt; workflowName: string; clientName: string }[] = [];
  incidents.forEach((inc) => {
    inc.recoveryAttempts.forEach((att) => {
      allRecoveryAttempts.push({
        attempt: att,
        workflowName: inc.workflowName,
        clientName: inc.clientName,
      });
    });
  });

  const handleCreateRequest = async () => {
    if (!currentIncident) return;
    if (onCreateRecoveryRequest) {
      await onCreateRecoveryRequest({
        incidentId: currentIncident.id,
        strategy: selectedStrategy,
        delaySeconds:
          selectedStrategy === 'RETRY_AFTER_DELAY' || selectedStrategy === 'RETRY_EXPONENTIAL_BACKOFF'
            ? customDelay
            : undefined,
        reason: requestReason.trim() || undefined,
      });
      setRequestReason('');
    } else {
      await onExecuteRecovery(currentIncident.id, false);
    }
  };

  const handleSavePolicy = async () => {
    if (!onUpdateRecoveryPolicy) return;
    await onUpdateRecoveryPolicy(policyForm);
    setShowPolicyPanel(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
            Intelligent Recovery Engine
          </h2>
          <p className="text-xs text-[#B5AA99]">
            AI-recommended strategies, risk assessment, human approval gates, and verified n8n retry execution
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowPolicyPanel((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
        >
          <Sliders className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
          <span>{showPolicyPanel ? 'Hide Recovery Policy' : 'Configure Recovery Policy'}</span>
        </button>
      </div>

      {/* Live Metrics Row (computed from real RecoveryRequest records) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-4">
          <span className="text-[11px] uppercase tracking-wider text-[#B5AA99]">Total Requests</span>
          <div className="mt-1.5 text-2xl font-extrabold text-[#E9E5DC] tabular-nums">
            {metrics.totalRequests}
          </div>
        </div>
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-4">
          <span className="text-[11px] uppercase tracking-wider text-[#B5AA99]">Pending Approvals</span>
          <div className="mt-1.5 text-2xl font-extrabold text-[#E2B066] tabular-nums">
            {metrics.pendingApprovals}
          </div>
        </div>
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-4">
          <span className="text-[11px] uppercase tracking-wider text-[#B5AA99]">Successful Recoveries</span>
          <div className="mt-1.5 text-2xl font-extrabold text-[#8CC59B] tabular-nums">
            {metrics.successfulRecoveries}
          </div>
        </div>
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-4">
          <span className="text-[11px] uppercase tracking-wider text-[#B5AA99]">Failed Recoveries</span>
          <div className="mt-1.5 text-2xl font-extrabold text-[#E88A7E] tabular-nums">
            {metrics.failedRecoveries}
          </div>
        </div>
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-4 col-span-2 lg:col-span-1">
          <span className="text-[11px] uppercase tracking-wider text-[#B5AA99]">Success Rate</span>
          <div className="mt-1.5 text-2xl font-extrabold text-[#E9E5DC] tabular-nums">
            {metrics.recoverySuccessRate}%
          </div>
        </div>
      </div>

      {/* Collapsible Organization Recovery Policy Editor */}
      {showPolicyPanel && (
        <div className="rounded-xl border border-[#544021] bg-[#211D10] p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold text-[#E9E5DC]">
              <ShieldCheck className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
              <span>Organization Recovery Policy Controls</span>
            </div>
            <span className="text-[11px] font-mono text-[#B5AA99]">
              Default: approval_required=true · auto_recovery=false
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="rounded-lg border border-[#383838] bg-[#171717] p-3 flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-[#E9E5DC] font-medium">Require Human Approval</span>
              <input
                type="checkbox"
                checked={policyForm.approvalRequired}
                onChange={(e) => setPolicyForm((p) => ({ ...p, approvalRequired: e.target.checked }))}
                className="accent-[#A51B0B]"
              />
            </label>

            <label className="rounded-lg border border-[#383838] bg-[#171717] p-3 flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-[#E9E5DC] font-medium">Enable Auto Recovery (Low Risk)</span>
              <input
                type="checkbox"
                checked={policyForm.autoRecoveryEnabled}
                onChange={(e) => setPolicyForm((p) => ({ ...p, autoRecoveryEnabled: e.target.checked }))}
                className="accent-[#A51B0B]"
              />
            </label>

            <label className="rounded-lg border border-[#383838] bg-[#171717] p-3 flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-[#E9E5DC] font-medium">Exponential Backoff</span>
              <input
                type="checkbox"
                checked={policyForm.useExponentialBackoff}
                onChange={(e) => setPolicyForm((p) => ({ ...p, useExponentialBackoff: e.target.checked }))}
                className="accent-[#A51B0B]"
              />
            </label>

            <div className="rounded-lg border border-[#383838] bg-[#171717] p-3">
              <label className="block text-[10px] uppercase text-[#B5AA99] mb-1">Max Retry Attempts</label>
              <input
                type="number"
                min={0}
                max={20}
                value={policyForm.maxRetryAttempts}
                onChange={(e) => setPolicyForm((p) => ({ ...p, maxRetryAttempts: Number(e.target.value) }))}
                className="w-full rounded border border-[#383838] bg-[#202020] px-2 py-1 text-xs text-[#E9E5DC] tabular-nums"
              />
            </div>

            <div className="rounded-lg border border-[#383838] bg-[#171717] p-3">
              <label className="block text-[10px] uppercase text-[#B5AA99] mb-1">Base Retry Delay (sec)</label>
              <input
                type="number"
                min={0}
                max={86400}
                value={policyForm.retryDelaySeconds}
                onChange={(e) => setPolicyForm((p) => ({ ...p, retryDelaySeconds: Number(e.target.value) }))}
                className="w-full rounded border border-[#383838] bg-[#202020] px-2 py-1 text-xs text-[#E9E5DC] tabular-nums"
              />
            </div>

            <div className="rounded-lg border border-[#383838] bg-[#171717] p-3">
              <label className="block text-[10px] uppercase text-[#B5AA99] mb-1">Cooldown Window (sec)</label>
              <input
                type="number"
                min={0}
                max={86400}
                value={policyForm.cooldownSeconds}
                onChange={(e) => setPolicyForm((p) => ({ ...p, cooldownSeconds: Number(e.target.value) }))}
                className="w-full rounded border border-[#383838] bg-[#202020] px-2 py-1 text-xs text-[#E9E5DC] tabular-nums"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleSavePolicy}
              disabled={isExecutingRecovery}
              className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
            >
              Save Recovery Policy
            </button>
          </div>
        </div>
      )}

      {/* Initiate Recovery Request + Incident Selector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#B5AA99] block">
            1. Select Open Incident
          </span>

          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {activeIncidents.length === 0 ? (
              <p className="text-xs text-[#B5AA99] py-6 text-center">No open incidents awaiting recovery.</p>
            ) : (
              activeIncidents.map((inc) => (
                <button
                  key={inc.id}
                  type="button"
                  onClick={() => setSelectedIncidentId(inc.id)}
                  className={`w-full text-left p-3 rounded-lg border text-xs transition-colors ${
                    currentIncident?.id === inc.id
                      ? 'border-[#A51B0B] bg-[#211D10] text-[#E9E5DC]'
                      : 'border-[#383838] bg-[#171717] text-[#B5AA99] hover:border-[#B5AA99]/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-[#C52A18]">#{inc.id}</span>
                    <StatusBadge
                      label={inc.status}
                      tone={inc.status === 'APPROVAL_REQUIRED' ? 'warning' : 'error'}
                    />
                  </div>
                  <p className="font-semibold text-[#E9E5DC] mt-1.5 truncate">{inc.workflowName}</p>
                  <p className="text-[11px] text-[#B5AA99] mt-0.5">
                    {inc.clientName} · {inc.errorCategory}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-[#383838] bg-[#202020] p-6 space-y-4">
          {currentIncident ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#383838]">
                <div>
                  <h3 className="text-base font-bold text-[#E9E5DC]">{currentIncident.workflowName}</h3>
                  <p className="text-xs text-[#B5AA99] mt-0.5">
                    Client: {currentIncident.clientName} · Execution: {currentIncident.executionId}
                  </p>
                </div>
                <StatusBadge
                  label={currentIncident.aiDiagnosis?.isRecoverable === false ? 'NON-RECOVERABLE' : currentIncident.severity}
                  tone={currentIncident.severity === 'CRITICAL' ? 'error' : 'warning'}
                />
              </div>

              {currentIncident.aiDiagnosis && (
                <div className="rounded-lg border border-[#383838] bg-[#211D10] p-4 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#E9E5DC]">
                      AI Recommendation: {currentIncident.aiDiagnosis.recommendedStrategy || 'MANUAL_RECOVERY'}
                    </span>
                    <span className="font-mono text-[11px] text-[#E2B066]">
                      Risk: {currentIncident.aiDiagnosis.expectedRiskLevel || currentIncident.severity}
                    </span>
                  </div>
                  <p className="text-[#B5AA99]">
                    {currentIncident.aiDiagnosis.recommendationReason || currentIncident.aiDiagnosis.suggestedRecovery}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div
                  className={
                    selectedStrategy === 'RETRY_AFTER_DELAY' || selectedStrategy === 'RETRY_EXPONENTIAL_BACKOFF'
                      ? ''
                      : 'sm:col-span-2'
                  }
                >
                  <label className="block text-[11px] font-semibold text-[#B5AA99] mb-1">
                    Recovery Strategy
                  </label>
                  <select
                    value={selectedStrategy}
                    onChange={(e) => setSelectedStrategy(e.target.value as RecoveryStrategy)}
                    className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-xs text-[#E9E5DC]"
                  >
                    {SUPPORTED_RECOVERY_STRATEGIES.map((s) => (
                      <option key={s} value={s}>
                        {STRATEGY_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>

                {(selectedStrategy === 'RETRY_AFTER_DELAY' || selectedStrategy === 'RETRY_EXPONENTIAL_BACKOFF') && (
                  <div>
                    <label className="block text-[11px] font-semibold text-[#B5AA99] mb-1">
                      Delay Before Retry (seconds)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={86400}
                      value={customDelay}
                      onChange={(e) => setCustomDelay(Number(e.target.value))}
                      className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-xs text-[#E9E5DC] tabular-nums"
                    />
                  </div>
                )}
              </div>

              <div className="text-xs">
                <label className="block text-[11px] font-semibold text-[#B5AA99] mb-1">
                  Operator Notes / Verification Context
                </label>
                <input
                  type="text"
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="Optional justification recorded in immutable audit trail..."
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-xs text-[#E9E5DC]"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#383838]">
                <span className="text-xs text-[#B5AA99] flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
                  <span>
                    {recoveryPolicy?.approvalRequired ?? true
                      ? 'Policy requires human approval before execution'
                      : 'Risk-checked automated gating active'}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={handleCreateRequest}
                  disabled={isExecutingRecovery}
                  className="inline-flex items-center gap-2 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-40 px-4 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Initiate Recovery Request</span>
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs text-[#B5AA99] py-8 text-center">Select an incident to initiate recovery.</p>
          )}
        </div>
      </div>

      {/* Recovery Requests Queue & Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
              <h3 className="text-sm font-bold text-[#E9E5DC]">Recovery Pipeline Queue</h3>
            </div>
            <span className="text-xs text-[#B5AA99] tabular-nums">{recoveryRequests.length} Requests</span>
          </div>

          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {recoveryRequests.length === 0 ? (
              <p className="text-xs text-[#B5AA99] py-8 text-center">
                No recovery requests queued yet. Initiate one above.
              </p>
            ) : (
              recoveryRequests.map((req) => (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => setSelectedRequestId(req.id)}
                  className={`w-full text-left rounded-lg border p-3.5 text-xs transition-colors ${
                    currentRequest?.id === req.id
                      ? 'border-[#A51B0B] bg-[#211D10]'
                      : 'border-[#383838] bg-[#171717] hover:border-[#B5AA99]/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-[#C52A18]">#{req.id}</span>
                    <StatusBadge label={req.status} tone={requestStatusTone(req.status)} />
                  </div>
                  <p className="font-semibold text-[#E9E5DC] mt-1 truncate">
                    {req.workflowName || req.workflowId}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-[#B5AA99] mt-1 font-mono tabular-nums">
                    <span>{req.strategy}</span>
                    <span>
                      Retries: {req.retryCount}/{req.maxRetryAttempts}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-[#383838] bg-[#202020] p-6 space-y-4">
          {currentRequest ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#383838]">
                <div className="flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                  <div>
                    <h3 className="text-base font-bold text-[#E9E5DC]">
                      Recovery Request #{currentRequest.id}
                    </h3>
                    <p className="text-xs text-[#B5AA99]">
                      {currentRequest.workflowName} · Incident #{currentRequest.incidentId}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge label={currentRequest.riskLevel} tone={currentRequest.riskLevel === 'LOW' ? 'neutral' : 'warning'} />
                  <StatusBadge label={currentRequest.status} tone={requestStatusTone(currentRequest.status)} withIcon />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-lg border border-[#383838] bg-[#171717] p-3">
                  <span className="text-[10px] uppercase text-[#B5AA99] block">Strategy</span>
                  <span className="font-mono font-semibold text-[#E9E5DC] mt-1 block truncate">
                    {currentRequest.strategy}
                  </span>
                </div>
                <div className="rounded-lg border border-[#383838] bg-[#171717] p-3">
                  <span className="text-[10px] uppercase text-[#B5AA99] block">Attempts</span>
                  <span className="font-mono font-semibold text-[#E9E5DC] mt-1 block tabular-nums">
                    {currentRequest.retryCount} / {currentRequest.maxRetryAttempts}
                  </span>
                </div>
                <div className="rounded-lg border border-[#383838] bg-[#171717] p-3">
                  <span className="text-[10px] uppercase text-[#B5AA99] block">Verified Outcome</span>
                  <span className="font-mono font-semibold text-[#E9E5DC] mt-1 block">
                    {currentRequest.resultVerified ? 'VERIFIED' : 'PENDING'}
                  </span>
                </div>
                <div className="rounded-lg border border-[#383838] bg-[#171717] p-3">
                  <span className="text-[10px] uppercase text-[#B5AA99] block">Created</span>
                  <span className="font-mono text-[11px] text-[#E9E5DC] mt-1 block">
                    {formatInTimezone(currentRequest.createdAt, timezone, 'time')}
                  </span>
                </div>
              </div>

              {currentRequest.riskAssessment && currentRequest.riskAssessment.factors.length > 0 && (
                <div className="rounded-lg border border-[#383838] bg-[#211D10] p-4 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-[#E2B066]">
                    <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Risk Assessment Factors</span>
                  </div>
                  <ul className="list-disc list-inside text-[#B5AA99] space-y-0.5">
                    {currentRequest.riskAssessment.factors.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(currentRequest.finalResultSummary || currentRequest.lastError) && (
                <div
                  className={`rounded-lg border p-3.5 text-xs font-mono ${
                    currentRequest.status === 'SUCCEEDED'
                      ? 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]'
                      : 'border-[#61231C] bg-[#2B1513] text-[#E88A7E]'
                  }`}
                >
                  {currentRequest.finalResultSummary || currentRequest.lastError}
                </div>
              )}

              {/* Linked Approvals */}
              {linkedApprovals.length > 0 && (
                <div className="space-y-1.5 text-xs">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#B5AA99]">
                    Approval Gate Records
                  </span>
                  {linkedApprovals.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-md border border-[#383838] bg-[#171717] px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <span className="text-[#E9E5DC] truncate">{a.proposedAction}</span>
                      <StatusBadge
                        label={a.status}
                        tone={a.status === 'APPROVED' ? 'success' : a.status === 'PENDING' ? 'warning' : 'error'}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Linked Retry Attempts */}
              {linkedAttempts.length > 0 && (
                <div className="space-y-1.5 text-xs">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#B5AA99]">
                    Retry &amp; Verification Attempts
                  </span>
                  {linkedAttempts.map((att) => (
                    <div
                      key={att.id}
                      className="rounded-md border border-[#383838] bg-[#171717] px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-[11px] text-[#E9E5DC]">
                          Attempt #{att.attemptNumber ?? 1} · {att.verificationStatus || att.status}
                        </span>
                        <p className="text-[11px] text-[#B5AA99] truncate">{att.details}</p>
                      </div>
                      <StatusBadge
                        label={att.status}
                        tone={att.status === 'SUCCESS' ? 'success' : att.status === 'PENDING' ? 'warning' : 'error'}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="pt-3 border-t border-[#383838] flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] font-mono text-[#B5AA99] truncate max-w-[260px]">
                  Key: {currentRequest.idempotencyKey.slice(0, 18)}...
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  {onCancelRecoveryRequest &&
                    ['PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'FAILED'].includes(currentRequest.status) && (
                      <button
                        type="button"
                        onClick={() => onCancelRecoveryRequest(currentRequest.id, 'Cancelled by operator')}
                        disabled={isExecutingRecovery}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-3.5 py-2 text-xs font-semibold text-[#B5AA99] hover:text-[#E9E5DC] transition-colors"
                      >
                        <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Cancel Recovery</span>
                      </button>
                    )}

                  {['APPROVED', 'SCHEDULED', 'FAILED'].includes(currentRequest.status) &&
                    currentRequest.isRecoverable && (
                      <button
                        type="button"
                        onClick={() =>
                          onExecuteRecoveryRequest
                            ? onExecuteRecoveryRequest(currentRequest.id)
                            : onExecuteRecovery(currentRequest.incidentId, false)
                        }
                        disabled={isExecutingRecovery}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-40 px-4 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
                      >
                        {isExecutingRecovery ? (
                          <RotateCcw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>{isExecutingRecovery ? 'Executing & Verifying...' : 'Execute Verified Recovery'}</span>
                      </button>
                    )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-[#B5AA99] py-12 text-center">
              Select a recovery request from the pipeline queue to inspect full verification details.
            </p>
          )}
        </div>
      </div>

      {/* Recovery Execution Audit Log */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-6">
        <div className="flex items-center justify-between pb-3 border-b border-[#383838]">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[#B5AA99]" aria-hidden="true" />
            <h3 className="text-base font-bold text-[#E9E5DC]">Recovery Execution Audit History</h3>
          </div>
          <span className="text-xs text-[#B5AA99] tabular-nums">
            Total Attempts: <strong className="text-[#E9E5DC]">{allRecoveryAttempts.length}</strong>
          </span>
        </div>

        <div className="mt-4 space-y-2.5">
          {allRecoveryAttempts.length === 0 ? (
            <p className="text-xs text-[#B5AA99] py-4 text-center">
              No recovery retry attempts executed yet.
            </p>
          ) : (
            allRecoveryAttempts.map((item, idx) => (
              <div
                key={item.attempt.id || idx}
                className="rounded-lg border border-[#383838] bg-[#171717] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#E9E5DC]">{item.workflowName}</span>
                    <span className="text-[#B5AA99]" aria-hidden="true">·</span>
                    <span className="text-[#B5AA99]">{item.clientName}</span>
                    {item.attempt.strategy && (
                      <span className="text-[10px] font-mono rounded border border-[#383838] bg-[#202020] px-1.5 py-0.5 text-[#E9E5DC]">
                        {item.attempt.strategy}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[#B5AA99] font-mono text-[11px]">{item.attempt.details}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {item.attempt.status === 'SUCCESS' ? (
                    <span className="text-[#8CC59B] font-semibold inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{item.attempt.verificationStatus || 'SUCCESS'}</span>
                    </span>
                  ) : (
                    <span className="text-[#E88A7E] font-semibold inline-flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{item.attempt.verificationStatus || item.attempt.status}</span>
                    </span>
                  )}
                  <span className="text-[#B5AA99] font-mono text-[10px] tabular-nums">
                    {formatInTimezone(item.attempt.executedAt, timezone, 'datetime')}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  Power,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { authFetch } from '../lib/api';
import {
  ACTION_CAPABILITY_KEY,
  buildControlWorkflowsFromState,
  buildLocalControlAssistantAnswer,
  canUserApproveControl,
  canUserDispatchControl,
  ControlActionRecord,
  ControlActionType,
  ControlActivityRecord,
  ControlAssistantAnswer,
  ControlWorkflowItem,
  evaluateControlActionPreflight,
  filterAndSortControlWorkflows,
  groupControlWorkflows,
} from '../lib/control-center';
import { formatInTimezone } from '../lib/datetime';
import type {
  Execution,
  Incident,
  Integration,
  RecoveryRequest,
  Role,
  Workflow,
} from '../types';

interface ControlCenterTabProps {
  workflows: Workflow[];
  integrations: Integration[];
  executions: Execution[];
  incidents: Incident[];
  recoveryRequests: RecoveryRequest[];
  currentUserRole?: Role;
  timezone: string;
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'text-[#8CC59B] border-[#2E4A36] bg-[#1C2A20]',
  INACTIVE: 'text-[#B5AA99] border-[#383838] bg-[#171717]',
  PAUSED: 'text-[#E2B066] border-[#544021] bg-[#2D2414]',
  FAILED: 'text-[#E88A7E] border-[#61231C] bg-[#2B1513]',
  UNKNOWN: 'text-[#B5AA99] border-[#383838] bg-[#171717]',
};

export const ControlCenterTab: React.FC<ControlCenterTabProps> = ({
  workflows,
  integrations,
  executions,
  incidents,
  recoveryRequests,
  currentUserRole = 'OWNER',
  timezone,
}) => {
  const controlWorkflows = useMemo(
    () => buildControlWorkflowsFromState({ workflows, integrations, incidents }),
    [workflows, integrations, incidents]
  );

  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'last_execution' | 'failures' | 'name' | 'status'>('last_execution');
  const [groupBy, setGroupBy] = useState<'none' | 'platform' | 'client'>('none');
  const [selectedId, setSelectedId] = useState<string | null>(() => controlWorkflows[0]?.id || null);

  const [stagedActions, setStagedActions] = useState<ControlActionRecord[]>([]);
  const [activityLogs, setActivityLogs] = useState<ControlActivityRecord[]>([]);
  const [confirmModal, setConfirmModal] = useState<{
    workflow: ControlWorkflowItem;
    actionType: ControlActionType;
    targetExecutionId?: string;
    reason: string;
    payloadText: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState<ControlAssistantAnswer | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const filtered = useMemo(
    () =>
      filterAndSortControlWorkflows(controlWorkflows, {
        search,
        platform: platformFilter,
        status: statusFilter,
        sortBy,
      }),
    [controlWorkflows, search, platformFilter, statusFilter, sortBy]
  );

  const grouped = useMemo(() => groupControlWorkflows(filtered, groupBy), [filtered, groupBy]);

  const selectedWorkflow = useMemo(
    () => controlWorkflows.find((w) => w.id === selectedId) || controlWorkflows[0] || null,
    [controlWorkflows, selectedId]
  );

  const selectedExecutions = useMemo(
    () => (selectedWorkflow ? executions.filter((e) => e.workflowId === selectedWorkflow.id) : []),
    [executions, selectedWorkflow]
  );

  const selectedIncidents = useMemo(
    () => (selectedWorkflow ? incidents.filter((i) => i.workflowId === selectedWorkflow.id) : []),
    [incidents, selectedWorkflow]
  );

  const selectedRecoveries = useMemo(
    () => (selectedWorkflow ? recoveryRequests.filter((r) => r.workflowId === selectedWorkflow.id) : []),
    [recoveryRequests, selectedWorkflow]
  );

  const statusCounts = useMemo(() => {
    const counts = { ACTIVE: 0, INACTIVE: 0, PAUSED: 0, FAILED: 0, UNKNOWN: 0 };
    for (const wf of controlWorkflows) {
      counts[wf.controlStatus] = (counts[wf.controlStatus] || 0) + 1;
    }
    return counts;
  }, [controlWorkflows]);

  const canDispatch = canUserDispatchControl(currentUserRole);
  const canApprove = canUserApproveControl(currentUserRole);
  const pendingApprovals = useMemo(
    () => stagedActions.filter((a) => a.status === 'AWAITING_APPROVAL'),
    [stagedActions]
  );

  const openConfirmation = (
    wf: ControlWorkflowItem,
    actionType: ControlActionType,
    targetExecutionId?: string,
    defaultReason?: string
  ) => {
    const check = evaluateControlActionPreflight({
      workflow: wf,
      actionType,
      role: currentUserRole,
      confirmed: true,
    });
    if (!check.allowed) {
      setFeedback({ type: 'err', text: check.reason || 'Action blocked by capability policy.' });
      return;
    }
    setConfirmModal({
      workflow: wf,
      actionType,
      targetExecutionId,
      reason: defaultReason || `Operator initiated ${actionType} via Control Center`,
      payloadText:
        actionType === 'UPDATE_SETTINGS'
          ? JSON.stringify({ saveManualExecutions: true }, null, 2)
          : '{}',
    });
  };

  const submitConfirmedAction = async () => {
    if (!confirmModal) return;
    setSubmitting(true);
    setFeedback(null);
    const { workflow, actionType, targetExecutionId, reason, payloadText } = confirmModal;

    try {
      let parsedPayload: Record<string, unknown> | undefined;
      if (payloadText.trim() && payloadText.trim() !== '{}') {
        parsedPayload = JSON.parse(payloadText);
      }

      // Attempt real FastAPI control-center endpoint first
      const res = await authFetch('/api/v1/control-center/actions', {
        method: 'POST',
        body: JSON.stringify({
          workflow_id: workflow.id,
          action_type: actionType,
          confirmed: true,
          target_execution_id: targetExecutionId,
          payload: parsedPayload,
          reason,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setFeedback({
          type: 'ok',
          text: `${created.action_type} submitted (${created.status}).`,
        });
        setConfirmModal(null);
        return;
      }

      if (res.status !== 404) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || errBody.error || `HTTP ${res.status}`);
      }

      // Honest local runtime handling when FastAPI control-center backend is not mounted:
      // Stage approval queue entries for high-risk actions; never claim an external provider mutation succeeded.
      const preflight = evaluateControlActionPreflight({
        workflow,
        actionType,
        role: currentUserRole,
        confirmed: true,
      });
      const nowIso = new Date().toISOString();
      const actionId = `ctrl_${Date.now()}`;

      if (preflight.requiresApproval) {
        const queued: ControlActionRecord = {
          id: actionId,
          workflowId: workflow.id,
          workflowName: workflow.name,
          platform: String(workflow.platform),
          actionType,
          targetExecutionId,
          status: 'AWAITING_APPROVAL',
          riskLevel: 'HIGH',
          requiresApproval: true,
          confirmedByUser: true,
          reason,
          requestedBy: currentUserRole,
          createdAt: nowIso,
        };
        setStagedActions((prev) => [queued, ...prev]);
        setActivityLogs((prev) => [
          {
            id: `act_${Date.now()}`,
            workflowId: workflow.id,
            workflowName: workflow.name,
            platform: String(workflow.platform),
            actorRole: currentUserRole,
            actionType,
            eventStatus: 'AWAITING_APPROVAL',
            summary: `${actionType} confirmed and queued for Admin/Owner approval.`,
            createdAt: nowIso,
          },
          ...prev,
        ]);
        setFeedback({
          type: 'ok',
          text: `${actionType} staged in the Admin/Owner Approval Queue.`,
        });
      } else {
        const errMsg =
          'FastAPI control backend / live provider credentials are not active in this browser session; external workflow mutation was not dispatched.';
        const failed: ControlActionRecord = {
          id: actionId,
          workflowId: workflow.id,
          workflowName: workflow.name,
          platform: String(workflow.platform),
          actionType,
          targetExecutionId,
          status: 'FAILED',
          riskLevel: 'MEDIUM',
          requiresApproval: false,
          confirmedByUser: true,
          reason,
          requestedBy: currentUserRole,
          errorMessage: errMsg,
          createdAt: nowIso,
          completedAt: nowIso,
        };
        setStagedActions((prev) => [failed, ...prev]);
        setActivityLogs((prev) => [
          {
            id: `act_${Date.now()}`,
            workflowId: workflow.id,
            workflowName: workflow.name,
            platform: String(workflow.platform),
            actorRole: currentUserRole,
            actionType,
            eventStatus: 'FAILED',
            summary: errMsg,
            createdAt: nowIso,
          },
          ...prev,
        ]);
        setFeedback({ type: 'err', text: errMsg });
      }
      setConfirmModal(null);
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Control action failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLocalApprovalDecision = (actionId: string, approve: boolean) => {
    const nowIso = new Date().toISOString();
    const targetAction = stagedActions.find((a) => a.id === actionId);
    setStagedActions((prev) =>
      prev.map((a) => {
        if (a.id !== actionId) return a;
        if (!approve) {
          return {
            ...a,
            status: 'CANCELLED',
            rejectedBy: currentUserRole,
            rejectionReason: 'Rejected by approver in Control Center queue.',
            completedAt: nowIso,
          };
        }
        return {
          ...a,
          status: 'FAILED',
          approvedBy: currentUserRole,
          errorMessage:
            'Approved in queue, but FastAPI / live provider adapter is offline in browser preview — external API not simulated.',
          completedAt: nowIso,
        };
      })
    );
    setActivityLogs((prev) => [
      {
        id: `act_${Date.now()}`,
        workflowId: targetAction?.workflowId,
        workflowName: targetAction?.workflowName,
        platform: targetAction?.platform || 'unknown',
        actorRole: currentUserRole,
        actionType: approve ? 'APPROVE' : 'REJECT',
        eventStatus: approve ? 'BLOCKED_OFFLINE_PROVIDER' : 'REJECTED',
        summary: approve
          ? `Approved #${actionId}; external dispatch requires live FastAPI + provider credentials (no synthetic success).`
          : `Rejected staged control action #${actionId}.`,
        createdAt: nowIso,
      },
      ...prev,
    ]);
    setFeedback({
      type: approve ? 'err' : 'ok',
      text: approve
        ? 'Action authorized, but external provider dispatch is unavailable in local browser preview (no fake success recorded).'
        : 'Pending control action rejected.',
    });
  };

  const handleAskAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    try {
      const res = await authFetch('/api/v1/control-center/assistant/query', {
        method: 'POST',
        body: JSON.stringify({
          question: aiQuestion.trim(),
          workflow_id: selectedWorkflow?.id,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiAnswer({
          answer: data.answer,
          riskNotes: data.risk_notes || [],
          preventiveRecommendations: data.preventive_recommendations || [],
          proposedActions: (data.proposed_actions || []).map((p: any) => ({
            workflowId: p.workflow_id,
            workflowName: p.workflow_name,
            platform: p.platform,
            actionType: p.action_type,
            supported: p.supported,
            capabilityReason: p.capability_reason,
            requiresApproval: p.requires_approval,
            requiresConfirmation: true,
            autoExecuted: false,
            reason: p.reason,
            impactSummary: p.impact_summary,
          })),
          unhealthyCount: data.unhealthy_count || 0,
          repeatedFailuresCount: data.repeated_failures_count || 0,
          isAiGenerated: Boolean(data.is_ai_generated),
          modelUsed: data.model_used || 'gemini-4-hydrogen',
        });
        return;
      }
      setAiAnswer(
        buildLocalControlAssistantAnswer({
          question: aiQuestion.trim(),
          workflows: controlWorkflows,
          incidents,
          executions,
        })
      );
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
            Central Automation Control Center
          </h1>
          <p className="text-xs text-[#B5AA99]">
            Unified multi-platform control across n8n, Make.com, Zapier, and custom Python/FastAPI pipelines with capability gating and safety approvals.
          </p>
        </div>
        <div className="text-xs font-mono text-[#B5AA99]">
          Role: <span className="text-[#E9E5DC] font-semibold">{currentUserRole}</span>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Platforms', value: integrations.length, sub: 'Connected' },
          { label: 'Active', value: statusCounts.ACTIVE, sub: 'Running' },
          { label: 'Inactive', value: statusCounts.INACTIVE, sub: 'Stopped' },
          { label: 'Paused', value: statusCounts.PAUSED, sub: 'Suspended' },
          { label: 'Failed', value: statusCounts.FAILED, sub: 'Unhealthy' },
          { label: 'Approvals', value: pendingApprovals.length, sub: 'Pending gate' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-[#383838] bg-[#202020] p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-[#B5AA99]">{card.label}</div>
            <div className="mt-2 text-2xl font-bold text-[#E9E5DC] tabular-nums">{card.value}</div>
            <div className="mt-1 text-[11px] text-[#B5AA99]">{card.sub}</div>
          </div>
        ))}
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-xs flex items-center justify-between ${
            feedback.type === 'err'
              ? 'border-[#61231C] bg-[#2B1513] text-[#E88A7E]'
              : 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-[#E9E5DC] font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Split View: Workflow Fleet + Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-[#383838] bg-[#202020] overflow-hidden">
          <div className="p-4 border-b border-[#383838] bg-[#1D1D1D] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#C52A18]" />
                <h2 className="text-sm font-semibold text-[#E9E5DC] uppercase tracking-wider">Connected Workflows</h2>
              </div>
              <span className="text-xs font-mono text-[#B5AA99] tabular-nums">
                {filtered.length} of {controlWorkflows.length}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
              <div className="relative sm:col-span-2">
                <Search className="w-3.5 h-3.5 text-[#B5AA99] absolute left-2.5 top-2.5" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search workflows, clients, or IDs..."
                  className="w-full rounded-md border border-[#383838] bg-[#171717] pl-8 pr-3 py-1.5 text-xs text-[#E9E5DC] focus:border-[#C52A18] focus:outline-none"
                />
              </div>
              <select
                aria-label="Filter by platform"
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="rounded-md border border-[#383838] bg-[#171717] px-2.5 py-1.5 text-xs text-[#E9E5DC]"
              >
                <option value="ALL">All Platforms</option>
                <option value="n8n">n8n</option>
                <option value="Make">Make</option>
                <option value="Zapier">Zapier</option>
                <option value="custom_python">Custom Python</option>
              </select>
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-md border border-[#383838] bg-[#171717] px-2.5 py-1.5 text-xs text-[#E9E5DC]"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="PAUSED">Paused</option>
                <option value="FAILED">Failed</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#B5AA99]">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Sort:</span>
                {(['last_execution', 'failures', 'name', 'status'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSortBy(s)}
                    className={`px-2 py-0.5 rounded border ${
                      sortBy === s
                        ? 'border-[#C52A18] bg-[#2B1513] text-[#E9E5DC]'
                        : 'border-[#383838] bg-[#171717] text-[#B5AA99]'
                    }`}
                  >
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setGroupBy(groupBy === 'none' ? 'platform' : groupBy === 'platform' ? 'client' : 'none')
                }
                className="px-2 py-0.5 rounded border border-[#383838] bg-[#171717] text-[#E9E5DC]"
              >
                Group: {groupBy === 'none' ? 'Flat' : groupBy === 'platform' ? 'Platform' : 'Client'}
              </button>
            </div>
          </div>

          <div className="divide-y divide-[#383838] max-h-[540px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#B5AA99]">No matching workflows found.</div>
            ) : (
              grouped.map((grp) => (
                <div key={grp.groupLabel}>
                  {groupBy !== 'none' && (
                    <div className="px-4 py-2 bg-[#171717] text-[11px] font-mono uppercase tracking-wider text-[#B5AA99]">
                      {grp.groupLabel} ({grp.items.length})
                    </div>
                  )}
                  <div className="divide-y divide-[#383838]">
                    {grp.items.map((wf) => {
                      const toggleType: ControlActionType = wf.isActive ? 'DEACTIVATE' : 'ACTIVATE';
                      const toggleCap = wf.capabilities[ACTION_CAPABILITY_KEY[toggleType]];
                      return (
                        <div
                          key={wf.id}
                          className={`p-4 transition-colors hover:bg-[#171717]/70 ${
                            selectedWorkflow?.id === wf.id ? 'bg-[#211D10]' : ''
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setSelectedId(wf.id)}
                              className="min-w-0 flex-1 text-left focus:outline-none"
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-[#E9E5DC] truncate">{wf.name}</span>
                                <span
                                  className={`px-2 py-0.5 rounded border text-[10px] font-mono ${
                                    STATUS_STYLE[wf.controlStatus] || STATUS_STYLE.UNKNOWN
                                  }`}
                                >
                                  {wf.controlStatus}
                                </span>
                              </div>
                              <div className="mt-1 text-[11px] font-mono text-[#B5AA99] tabular-nums">
                                {wf.platform} · {wf.clientName} · Last:{' '}
                                {wf.lastExecutionAt ? formatInTimezone(wf.lastExecutionAt, timezone) : 'Never'}
                                {wf.consecutiveFailures > 0 ? ` · ${wf.consecutiveFailures} fails` : ''}
                              </div>
                            </button>

                            <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                disabled={!canDispatch || !toggleCap.supported}
                                title={toggleCap.reason}
                                onClick={() => openConfirmation(wf, toggleType)}
                                className="px-2 py-1 rounded border border-[#383838] bg-[#171717] hover:border-[#B5AA99] disabled:opacity-40 text-[11px] text-[#E9E5DC] inline-flex items-center gap-1"
                              >
                                <Power className="w-3 h-3" />
                                <span>{wf.isActive ? 'Deactivate' : 'Activate'}</span>
                              </button>
                              <button
                                type="button"
                                disabled={!canDispatch || !wf.capabilities.trigger.supported}
                                title={wf.capabilities.trigger.reason}
                                onClick={() => openConfirmation(wf, 'TRIGGER')}
                                className="px-2 py-1 rounded border border-[#383838] bg-[#171717] hover:border-[#C52A18] disabled:opacity-40 text-[11px] text-[#E9E5DC] inline-flex items-center gap-1"
                              >
                                <Play className="w-3 h-3 text-[#C52A18]" />
                                <span>Run</span>
                              </button>
                              <button
                                type="button"
                                disabled={!canDispatch || !wf.capabilities.retry_execution.supported}
                                title={wf.capabilities.retry_execution.reason}
                                onClick={() => openConfirmation(wf, 'RETRY_EXECUTION')}
                                className="px-2 py-1 rounded border border-[#383838] bg-[#171717] hover:border-[#E2B066] disabled:opacity-40 text-[11px] text-[#E9E5DC] inline-flex items-center gap-1"
                              >
                                <RotateCcw className="w-3 h-3 text-[#E2B066]" />
                                <span>Retry</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Workflow Detail & Provider Capabilities Inspector */}
        <div className="lg:col-span-5 rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-5">
          {!selectedWorkflow ? (
            <div className="text-xs text-[#B5AA99] py-8 text-center">Select a workflow to inspect details and capabilities.</div>
          ) : (
            <>
              <div className="border-b border-[#383838] pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#C52A18]">
                    {selectedWorkflow.platform} · {selectedWorkflow.capabilities.adapter_mode}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] font-mono ${
                      STATUS_STYLE[selectedWorkflow.controlStatus]
                    }`}
                  >
                    {selectedWorkflow.controlStatus}
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#E9E5DC] mt-1">{selectedWorkflow.name}</h3>
                <p className="text-[11px] font-mono text-[#B5AA99] mt-0.5">
                  Client: {selectedWorkflow.clientName} · External ID: {selectedWorkflow.externalWorkflowId}
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#B5AA99]">
                  Supported vs Unavailable Provider Controls
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {(
                    [
                      { key: 'PAUSE' as ControlActionType, label: 'Pause Workflow', icon: Pause },
                      { key: 'RESUME' as ControlActionType, label: 'Resume Workflow', icon: Play },
                      { key: 'UPDATE_SETTINGS' as ControlActionType, label: 'Update Settings', icon: Settings2 },
                      { key: 'MANAGE_SCHEDULE' as ControlActionType, label: 'Manage Schedule', icon: Clock },
                    ]
                  ).map((item) => {
                    const cap = selectedWorkflow.capabilities[ACTION_CAPABILITY_KEY[item.key]];
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        disabled={!canDispatch || !cap.supported}
                        title={cap.reason}
                        onClick={() => openConfirmation(selectedWorkflow, item.key)}
                        className="rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] disabled:opacity-45 p-2.5 text-left"
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-[#E9E5DC]">
                          <Icon className="w-3.5 h-3.5 text-[#C52A18]" />
                          <span>{item.label}</span>
                        </div>
                        <div className="mt-1 text-[10px] text-[#B5AA99] line-clamp-2">
                          {cap.supported ? cap.reason : `Unavailable: ${cap.reason}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#B5AA99]">
                  Execution History ({selectedExecutions.length})
                </div>
                {selectedExecutions.length === 0 ? (
                  <div className="text-xs text-[#B5AA99]">No recent executions recorded.</div>
                ) : (
                  <div className="divide-y divide-[#383838] rounded-lg border border-[#383838] bg-[#171717] max-h-40 overflow-y-auto">
                    {selectedExecutions.slice(0, 6).map((ex) => (
                      <div key={ex.id} className="px-3 py-2 text-[11px] flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-[#E9E5DC] truncate">
                            {ex.externalExecutionId || ex.id} · {ex.status}
                          </div>
                          <div className="text-[#B5AA99] truncate">
                            {ex.errorMessage || formatInTimezone(ex.startedAt, timezone)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-[11px] font-mono text-[#B5AA99]">
                Incidents: {selectedIncidents.length} · Recoveries: {selectedRecoveries.length}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Approval Queue + AI Control Assistant */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#383838] pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#E2B066]" />
              <h2 className="text-sm font-bold text-[#E9E5DC]">Control Action Approval Queue</h2>
            </div>
            <span className="text-xs font-mono text-[#E2B066] tabular-nums">{pendingApprovals.length} awaiting</span>
          </div>
          {pendingApprovals.length === 0 ? (
            <div className="text-xs text-[#B5AA99]">
              No high-risk control actions awaiting approval. High-risk actions (Deactivate, Pause, Settings, Billing workflows) route here first.
            </div>
          ) : (
            <div className="space-y-2.5">
              {pendingApprovals.map((act) => (
                <div key={act.id} className="rounded-lg border border-[#544021] bg-[#211D10] p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-[#E9E5DC] font-semibold">
                      {act.actionType} · {act.workflowName}
                    </span>
                    <span className="text-[#E2B066]">{act.riskLevel}</span>
                  </div>
                  <div className="text-[#B5AA99]">{act.reason}</div>
                  {canApprove && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleLocalApprovalDecision(act.id, true)}
                        className="px-3 py-1 rounded bg-[#A51B0B] hover:bg-[#C52A18] text-[#E9E5DC] text-[11px] font-semibold"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLocalApprovalDecision(act.id, false)}
                        className="px-3 py-1 rounded border border-[#383838] bg-[#171717] text-[#B5AA99] text-[11px]"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-7 rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#383838] pb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#C52A18]" />
              <h2 className="text-sm font-bold text-[#E9E5DC]">AI-Assisted Automation Management</h2>
            </div>
            <span className="text-[11px] font-mono text-[#B5AA99]">Advisory · Validation &amp; Approval Required</span>
          </div>

          <form onSubmit={handleAskAssistant} className="flex gap-2">
            <input
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              placeholder="Ask e.g. 'Which workflows are currently unhealthy?'"
              className="flex-1 rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-xs text-[#E9E5DC] focus:border-[#C52A18] focus:outline-none"
            />
            <button
              type="submit"
              disabled={aiLoading}
              className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 text-xs font-semibold text-[#E9E5DC]"
            >
              {aiLoading ? 'Analyzing...' : 'Ask'}
            </button>
          </form>

          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {[
              'Which workflows are currently unhealthy?',
              'Which automations have repeated failures?',
              'What happens if I retry this execution?',
              'What should I do to prevent this failure?',
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setAiQuestion(q)}
                className="rounded border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-2 py-1 text-[#B5AA99]"
              >
                {q}
              </button>
            ))}
          </div>

          {aiAnswer && (
            <div className="rounded-lg border border-[#383838] bg-[#171717] p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between font-mono text-[11px] text-[#B5AA99]">
                <span>{aiAnswer.isAiGenerated ? `Gemini (${aiAnswer.modelUsed})` : aiAnswer.modelUsed}</span>
                <span>{aiAnswer.unhealthyCount} unhealthy</span>
              </div>
              <p className="text-[#E9E5DC]">{aiAnswer.answer}</p>
              {aiAnswer.proposedActions.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#383838]">
                  <div className="text-[11px] font-semibold uppercase text-[#E2B066]">
                    Proposed Safe Actions (Never Auto-Executed)
                  </div>
                  {aiAnswer.proposedActions.map((prop, idx) => {
                    const wf = controlWorkflows.find((w) => w.id === prop.workflowId);
                    return (
                      <div key={idx} className="rounded border border-[#383838] bg-[#202020] p-2.5 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[#E9E5DC]">
                            {prop.actionType} · {prop.workflowName} ({prop.platform})
                          </div>
                          <div className="text-[#B5AA99] text-[11px]">{prop.reason}</div>
                        </div>
                        <button
                          type="button"
                          disabled={!canDispatch || !prop.supported || !wf}
                          onClick={() => wf && openConfirmation(wf, prop.actionType, undefined, prop.reason)}
                          className="px-3 py-1 rounded bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-40 text-[11px] font-semibold text-[#E9E5DC] shrink-0"
                        >
                          Review &amp; Confirm
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Immutable Control Activity History */}
      <section className="rounded-xl border border-[#383838] bg-[#202020] overflow-hidden">
        <div className="p-4 border-b border-[#383838] bg-[#1D1D1D] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#E9E5DC] uppercase tracking-wider">Control Activity Log</h2>
          <span className="text-xs font-mono text-[#B5AA99] tabular-nums">{activityLogs.length} events</span>
        </div>
        {activityLogs.length === 0 ? (
          <div className="p-6 text-xs text-[#B5AA99]">No control actions recorded yet in this session.</div>
        ) : (
          <div className="divide-y divide-[#383838]">
            {activityLogs.map((log) => (
              <div key={log.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="text-[#E9E5DC] truncate">{log.summary}</div>
                  <div className="text-[11px] font-mono text-[#B5AA99]">
                    {log.platform} · {log.actionType} · {formatInTimezone(log.createdAt, timezone)}
                  </div>
                </div>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded border border-[#383838] bg-[#171717] text-[#E9E5DC] shrink-0">
                  {log.eventStatus}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {confirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-control-title"
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-[#383838] bg-[#202020] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 id="confirm-control-title" className="text-base font-bold text-[#E9E5DC]">
                Confirm Control Action
              </h3>
              <button
                type="button"
                aria-label="Close confirmation dialog"
                onClick={() => setConfirmModal(null)}
                className="text-[#B5AA99] hover:text-[#E9E5DC]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-lg border border-[#383838] bg-[#171717] p-3 text-xs space-y-1">
              <div className="font-semibold text-[#E9E5DC]">
                {confirmModal.actionType} on {confirmModal.workflow.name} ({confirmModal.workflow.platform})
              </div>
              <div className="text-[#B5AA99]">
                Requires explicit confirmation before dispatch. High-risk actions enter the Admin/Owner Approval Queue.
              </div>
            </div>
            <div className="space-y-1 text-xs">
              <label htmlFor="ctrl-audit-note" className="block font-medium text-[#E9E5DC]">
                Operator Audit Note
              </label>
              <input
                id="ctrl-audit-note"
                value={confirmModal.reason}
                onChange={(e) => setConfirmModal({ ...confirmModal, reason: e.target.value })}
                className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-xs text-[#E9E5DC]"
              />
            </div>
            {(confirmModal.actionType === 'UPDATE_SETTINGS' || confirmModal.actionType === 'MANAGE_SCHEDULE') && (
              <div className="space-y-1 text-xs">
                <label htmlFor="ctrl-action-payload" className="block font-medium text-[#E9E5DC]">
                  Configuration Payload (JSON)
                </label>
                <textarea
                  id="ctrl-action-payload"
                  rows={4}
                  value={confirmModal.payloadText}
                  onChange={(e) => setConfirmModal({ ...confirmModal, payloadText: e.target.value })}
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 font-mono text-xs text-[#E9E5DC]"
                />
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-2 rounded-md border border-[#383838] bg-[#171717] text-xs text-[#B5AA99]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={submitConfirmedAction}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] text-xs font-semibold text-[#E9E5DC]"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{submitting ? 'Submitting...' : 'Confirm & Submit'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

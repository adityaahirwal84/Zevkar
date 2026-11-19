'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { api } from '@/lib/api-client';

interface ConfirmActionState {
  workflow: any;
  actionType: string;
  targetExecutionId?: string;
  reason: string;
  payloadText: string;
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'text-[#8CC59B] border-[#2E4A36] bg-[#1C2A20]',
  INACTIVE: 'text-[#B5AA99] border-[#383838] bg-[#171717]',
  PAUSED: 'text-[#E2B066] border-[#544021] bg-[#2D2414]',
  FAILED: 'text-[#E88A7E] border-[#61231C] bg-[#2B1513]',
  UNKNOWN: 'text-[#B5AA99] border-[#383838] bg-[#171717]',
};

const ACTION_CAP_MAP: Record<string, string> = {
  ACTIVATE: 'activate',
  DEACTIVATE: 'deactivate',
  TRIGGER: 'trigger',
  RETRY_EXECUTION: 'retry_execution',
  PAUSE: 'pause',
  RESUME: 'resume',
  UPDATE_SETTINGS: 'update_settings',
  MANAGE_SCHEDULE: 'manage_schedule',
};

function formatDate(iso?: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ControlCenterConsole() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any | null>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'last_execution' | 'failures' | 'name' | 'status'>('last_execution');
  const [groupBy, setGroupBy] = useState<'none' | 'platform'>('none');

  const [confirmModal, setConfirmModal] = useState<ConfirmActionState | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [ov, acts, logs] = await Promise.all([
        api.controlCenter.overview(),
        api.controlCenter.listActions(undefined, undefined, 40),
        api.controlCenter.listActivity(undefined, 50),
      ]);
      setOverview(ov);
      setActions(acts || []);
      setActivityLogs(logs || []);
      const wfs = ov?.workflows || [];
      if (wfs.length > 0 && !selectedWorkflowId) {
        await openDetail(wfs[0].id);
      }
    } catch (err: any) {
      setFeedback({ type: 'err', text: `Control Center load failed: ${err.message}` });
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(workflowId: string) {
    setSelectedWorkflowId(workflowId);
    setLoadingDetail(true);
    try {
      const detail = await api.controlCenter.getWorkflowDetail(workflowId);
      setDetailData(detail);
    } catch (err: any) {
      setFeedback({ type: 'err', text: `Failed to load workflow detail: ${err.message}` });
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const workflows: any[] = overview?.workflows || [];
  const platforms: any[] = overview?.platforms || [];
  const canExecute = Boolean(overview?.can_execute_controls);
  const canApprove = Boolean(overview?.can_approve_controls);

  const filteredWorkflows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = workflows.filter((wf) => {
      if (platformFilter !== 'ALL' && wf.platform.toLowerCase() !== platformFilter.toLowerCase()) return false;
      if (statusFilter !== 'ALL' && wf.control_status !== statusFilter) return false;
      if (q) {
        const hay = `${wf.name} ${wf.platform} ${wf.external_workflow_id || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const copy = [...list];
    if (sortBy === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'failures') copy.sort((a, b) => (b.consecutive_failures || 0) - (a.consecutive_failures || 0));
    else if (sortBy === 'status') copy.sort((a, b) => String(a.control_status).localeCompare(String(b.control_status)));
    else {
      copy.sort(
        (a, b) =>
          (b.last_execution_at ? new Date(b.last_execution_at).getTime() : 0) -
          (a.last_execution_at ? new Date(a.last_execution_at).getTime() : 0)
      );
    }
    return copy;
  }, [workflows, search, platformFilter, statusFilter, sortBy]);

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ label: 'Monitored Automations', items: filteredWorkflows }];
    const map = new Map<string, any[]>();
    for (const wf of filteredWorkflows) {
      const key = wf.platform || 'Other';
      const arr = map.get(key) || [];
      arr.push(wf);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
  }, [filteredWorkflows, groupBy]);

  const pendingApprovals = useMemo(
    () => actions.filter((a) => a.status === 'AWAITING_APPROVAL'),
    [actions]
  );

  function stageControlAction(workflow: any, actionType: string, targetExecutionId?: string, reason?: string) {
    const defaultPayload =
      actionType === 'UPDATE_SETTINGS'
        ? JSON.stringify(workflow.provider_settings || { saveManualExecutions: true }, null, 2)
        : actionType === 'MANAGE_SCHEDULE'
        ? JSON.stringify(workflow.schedule_config || { intervalMinutes: 15, timezone: 'UTC' }, null, 2)
        : '{}';
    setConfirmModal({
      workflow,
      actionType,
      targetExecutionId,
      reason: reason || `Operator requested ${actionType} from Control Center`,
      payloadText: defaultPayload,
    });
  }

  async function submitConfirmedAction() {
    if (!confirmModal) return;
    setSubmittingAction(true);
    setFeedback(null);
    try {
      let parsedPayload: Record<string, any> | undefined;
      if (confirmModal.payloadText.trim() && confirmModal.payloadText.trim() !== '{}') {
        parsedPayload = JSON.parse(confirmModal.payloadText);
      }
      const created = await api.controlCenter.createAction({
        workflow_id: confirmModal.workflow.id,
        action_type: confirmModal.actionType,
        confirmed: true,
        target_execution_id: confirmModal.targetExecutionId,
        payload: parsedPayload,
        reason: confirmModal.reason,
      });
      setConfirmModal(null);
      setFeedback({
        type: 'ok',
        text:
          created.status === 'AWAITING_APPROVAL'
            ? `${created.action_type} queued for Admin/Owner approval (#${created.id.slice(0, 8)}).`
            : `${created.action_type} completed with status ${created.status}.`,
      });
      await loadAll();
      await openDetail(confirmModal.workflow.id);
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Control action failed validation.' });
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleApprove(actionId: string) {
    setFeedback(null);
    try {
      const updated = await api.controlCenter.approveAction(actionId);
      setFeedback({ type: 'ok', text: `Approved ${updated.action_type}: outcome ${updated.status}.` });
      await loadAll();
      if (selectedWorkflowId) await openDetail(selectedWorkflowId);
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Approval failed.' });
    }
  }

  async function handleReject(actionId: string) {
    setFeedback(null);
    try {
      await api.controlCenter.rejectAction(actionId, 'Rejected in Control Center approval queue.');
      setFeedback({ type: 'ok', text: 'Control action rejected.' });
      await loadAll();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Rejection failed.' });
    }
  }

  async function handleAskAssistant(e: React.FormEvent) {
    e.preventDefault();
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    setFeedback(null);
    try {
      const res = await api.controlCenter.askAssistant({
        question: aiQuestion.trim(),
        workflow_id: selectedWorkflowId || undefined,
      });
      setAiResult(res);
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Assistant query failed.' });
    } finally {
      setAiLoading(false);
    }
  }

  const summary = overview?.summary;
  const counts = summary?.status_counts || {};

  return (
    <div className="space-y-6">
      {/* Top Status & Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Platforms', value: summary?.total_platforms ?? platforms.length, sub: 'Connected adapters' },
          { label: 'Active', value: counts.ACTIVE ?? 0, sub: 'Running normally' },
          { label: 'Inactive', value: counts.INACTIVE ?? 0, sub: 'Disabled remotely' },
          { label: 'Paused', value: counts.PAUSED ?? 0, sub: 'Suspended' },
          { label: 'Failed', value: counts.FAILED ?? 0, sub: 'Failing health' },
          { label: 'Awaiting Approval', value: summary?.awaiting_approvals ?? pendingApprovals.length, sub: 'High-risk gate' },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-[#383838] bg-[#202020] p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-[#B5AA99]">{kpi.label}</div>
            <div className="mt-2 text-2xl font-bold text-[#E9E5DC] tabular-nums">{kpi.value}</div>
            <div className="mt-1 text-[11px] text-[#B5AA99]">{kpi.sub}</div>
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

      {/* Connected Platforms & Capabilities Matrix */}
      <section className="rounded-xl border border-[#383838] bg-[#202020] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#383838]">
          <div>
            <h2 className="text-sm font-bold text-[#E9E5DC]">Connected Automation Platforms & Adapter Modes</h2>
            <p className="text-xs text-[#B5AA99]">
              Capability-driven adapters only enable verified provider controls; unsupported controls remain disabled.
            </p>
          </div>
          <button
            onClick={loadAll}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-3 py-1.5 text-xs font-medium text-[#E9E5DC]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Telemetry</span>
          </button>
        </div>

        {platforms.length === 0 ? (
          <div className="py-6 text-xs text-[#B5AA99]">
            No automation platforms connected yet. Connect n8n, Make.com, Zapier, or Custom Python workers to control workflows here.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {platforms.map((p) => (
              <div key={p.id} className="rounded-lg border border-[#383838] bg-[#171717] p-3.5 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#E9E5DC]">{p.name}</span>
                  <span className="font-mono text-[11px] text-[#8CC59B]">{p.status}</span>
                </div>
                <div className="font-mono text-[11px] text-[#B5AA99] tabular-nums">
                  {p.platform} · {p.capabilities?.adapter_mode || 'READ_ONLY'} · {p.workflow_count} workflows
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono">
                  {['activate', 'deactivate', 'trigger', 'retry_execution', 'pause', 'update_settings'].map((k) => {
                    const supported = Boolean(p.capabilities?.[k]?.supported);
                    return (
                      <span
                        key={k}
                        title={p.capabilities?.[k]?.reason || ''}
                        className={`px-1.5 py-0.5 rounded border ${
                          supported
                            ? 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]'
                            : 'border-[#383838] bg-[#202020] text-[#B5AA99]/60 line-through'
                        }`}
                      >
                        {k}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Main Split: Unified Workflow Table & Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-[#383838] bg-[#202020] overflow-hidden flex flex-col">
          <div className="p-4 border-b border-[#383838] bg-[#1D1D1D] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#C52A18]" />
                <h2 className="text-sm font-semibold text-[#E9E5DC] uppercase tracking-wider">Unified Workflows</h2>
              </div>
              <span className="text-xs font-mono text-[#B5AA99] tabular-nums">
                {filteredWorkflows.length} of {workflows.length} · Role: {overview?.actor_role || 'VIEWER'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
              <div className="relative sm:col-span-2">
                <Search className="w-3.5 h-3.5 text-[#B5AA99] absolute left-2.5 top-2.5" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search workflow, ID, or platform..."
                  className="w-full rounded-md border border-[#383838] bg-[#171717] pl-8 pr-3 py-1.5 text-xs text-[#E9E5DC] focus:border-[#C52A18] focus:outline-none"
                />
              </div>
              <select
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
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Sort:</span>
                {(['last_execution', 'failures', 'name', 'status'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setSortBy(opt)}
                    className={`px-2 py-0.5 rounded border ${
                      sortBy === opt
                        ? 'border-[#C52A18] bg-[#2B1513] text-[#E9E5DC]'
                        : 'border-[#383838] bg-[#171717] text-[#B5AA99]'
                    }`}
                  >
                    {opt.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span>Group:</span>
                <button
                  onClick={() => setGroupBy(groupBy === 'none' ? 'platform' : 'none')}
                  className="px-2 py-0.5 rounded border border-[#383838] bg-[#171717] text-[#E9E5DC]"
                >
                  {groupBy === 'platform' ? 'By Platform' : 'Flat List'}
                </button>
              </div>
            </div>
          </div>

          <div className="divide-y divide-[#383838] max-h-[640px] overflow-y-auto">
            {loading && workflows.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#B5AA99]">Loading workflow fleet...</div>
            ) : filteredWorkflows.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#B5AA99]">No workflows match the selected filters.</div>
            ) : (
              grouped.map((grp) => (
                <div key={grp.label}>
                  {groupBy === 'platform' && (
                    <div className="px-4 py-2 bg-[#171717] text-[11px] font-mono uppercase tracking-wider text-[#B5AA99]">
                      {grp.label} ({grp.items.length})
                    </div>
                  )}
                  <div className="divide-y divide-[#383838]">
                    {grp.items.map((wf) => {
                      const caps = wf.capabilities || {};
                      const toggleAction = wf.is_active ? 'DEACTIVATE' : 'ACTIVATE';
                      const toggleCap = caps[ACTION_CAP_MAP[toggleAction]];
                      const trigCap = caps.trigger;
                      const retryCap = caps.retry_execution;

                      return (
                        <div
                          key={wf.id}
                          onClick={() => openDetail(wf.id)}
                          className={`p-4 cursor-pointer transition-colors hover:bg-[#171717]/70 ${
                            selectedWorkflowId === wf.id ? 'bg-[#211D10]' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-[#E9E5DC] truncate">{wf.name}</span>
                                <span
                                  className={`px-2 py-0.5 rounded border text-[10px] font-mono ${
                                    STATUS_STYLE[wf.control_status] || STATUS_STYLE.UNKNOWN
                                  }`}
                                >
                                  {wf.control_status}
                                </span>
                              </div>
                              <div className="mt-1 text-[11px] font-mono text-[#B5AA99] tabular-nums">
                                {wf.platform} · Last: {formatDate(wf.last_execution_at)}
                                {wf.next_scheduled_at ? ` · Next: ${formatDate(wf.next_scheduled_at)}` : ''}
                                {wf.consecutive_failures > 0 ? ` · ${wf.consecutive_failures} fails` : ''}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                disabled={!canExecute || !toggleCap?.supported}
                                title={
                                  !canExecute
                                    ? 'Read-only role cannot mutate workflows'
                                    : toggleCap?.reason || 'Toggle workflow active state'
                                }
                                onClick={() => stageControlAction(wf, toggleAction)}
                                className="px-2 py-1 rounded border border-[#383838] bg-[#171717] hover:border-[#B5AA99] disabled:opacity-40 text-[11px] text-[#E9E5DC] inline-flex items-center gap-1"
                              >
                                <Power className="w-3 h-3" />
                                <span>{wf.is_active ? 'Deactivate' : 'Activate'}</span>
                              </button>

                              <button
                                disabled={!canExecute || !trigCap?.supported}
                                title={
                                  !canExecute
                                    ? 'Read-only role'
                                    : trigCap?.reason || 'Trigger workflow run'
                                }
                                onClick={() => stageControlAction(wf, 'TRIGGER')}
                                className="px-2 py-1 rounded border border-[#383838] bg-[#171717] hover:border-[#C52A18] disabled:opacity-40 text-[11px] text-[#E9E5DC] inline-flex items-center gap-1"
                              >
                                <Play className="w-3 h-3 text-[#C52A18]" />
                                <span>Run</span>
                              </button>

                              <button
                                disabled={!canExecute || !retryCap?.supported}
                                title={retryCap?.reason || 'Retry failed execution'}
                                onClick={() => stageControlAction(wf, 'RETRY_EXECUTION')}
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

        {/* Right Column: Selected Workflow Inspector & Extended Controls */}
        <div className="lg:col-span-5 rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-5">
          {loadingDetail ? (
            <div className="text-xs text-[#B5AA99] py-8 text-center">Loading workflow inspector...</div>
          ) : !detailData?.workflow ? (
            <div className="text-xs text-[#B5AA99] py-8 text-center">
              Select a workflow on the left to inspect executions, incidents, capabilities, and controls.
            </div>
          ) : (
            <>
              <div className="border-b border-[#383838] pb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-[#C52A18]">{detailData.workflow.platform}</span>
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] font-mono ${
                      STATUS_STYLE[detailData.workflow.control_status] || STATUS_STYLE.UNKNOWN
                    }`}
                  >
                    {detailData.workflow.control_status}
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#E9E5DC] mt-1">{detailData.workflow.name}</h3>
                <p className="text-[11px] font-mono text-[#B5AA99] mt-0.5">
                  External ID: {detailData.workflow.external_workflow_id} · Health: {detailData.workflow.health_status}
                </p>
              </div>

              {/* Extended Controls Matrix (Pause, Resume, Settings, Schedule) */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#B5AA99]">
                  Provider Controls & Capability Guardrails
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {(
                    [
                      { key: 'PAUSE', label: 'Pause Workflow', icon: Pause },
                      { key: 'RESUME', label: 'Resume Workflow', icon: Play },
                      { key: 'UPDATE_SETTINGS', label: 'Update Settings', icon: Settings2 },
                      { key: 'MANAGE_SCHEDULE', label: 'Manage Schedule', icon: Clock },
                    ] as const
                  ).map((item) => {
                    const cap = detailData.workflow.capabilities?.[ACTION_CAP_MAP[item.key]];
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        disabled={!canExecute || !cap?.supported}
                        title={cap?.reason || 'Unsupported by provider'}
                        onClick={() => stageControlAction(detailData.workflow, item.key)}
                        className="rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] disabled:opacity-45 p-2.5 text-left transition-colors"
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-[#E9E5DC]">
                          <Icon className="w-3.5 h-3.5 text-[#C52A18]" />
                          <span>{item.label}</span>
                        </div>
                        <div className="mt-1 text-[10px] text-[#B5AA99] line-clamp-2">
                          {cap?.supported ? cap.reason : `Unavailable: ${cap?.reason || 'Not supported'}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Execution History */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#B5AA99]">
                  Recent Executions ({detailData.executions?.length || 0})
                </div>
                {detailData.executions?.length ? (
                  <div className="divide-y divide-[#383838] rounded-lg border border-[#383838] bg-[#171717] max-h-48 overflow-y-auto">
                    {detailData.executions.slice(0, 8).map((ex: any) => (
                      <div key={ex.id} className="px-3 py-2 text-[11px] flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-[#E9E5DC] truncate">
                            {ex.external_execution_id || ex.id.slice(0, 8)} · {ex.status}
                          </div>
                          <div className="text-[#B5AA99] truncate">{ex.error_message || formatDate(ex.started_at)}</div>
                        </div>
                        {ex.status === 'FAILED' && detailData.workflow.capabilities?.retry_execution?.supported && canExecute && (
                          <button
                            onClick={() =>
                              stageControlAction(
                                detailData.workflow,
                                'RETRY_EXECUTION',
                                ex.external_execution_id || ex.id
                              )
                            }
                            className="px-2 py-0.5 rounded border border-[#544021] bg-[#2D2414] text-[#E2B066] shrink-0"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[#B5AA99]">No executions recorded yet.</div>
                )}
              </div>

              {/* Associated Incidents */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#B5AA99]">
                  Incidents & Recoveries ({detailData.incidents?.length || 0} incidents ·{' '}
                  {detailData.recoveries?.length || 0} recoveries)
                </div>
                {detailData.incidents?.slice(0, 3).map((inc: any) => (
                  <div key={inc.id} className="rounded-lg border border-[#383838] bg-[#171717] p-2.5 text-[11px]">
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-[#E88A7E]">{inc.error_category} · {inc.severity}</span>
                      <span className="text-[#B5AA99]">{inc.status}</span>
                    </div>
                    <p className="text-[#B5AA99] mt-1 line-clamp-2">{inc.error_message}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom Grid: Approval Queue + AI Assistant + Activity History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Pending Control Approvals */}
        <section className="lg:col-span-5 rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#383838] pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#E2B066]" />
              <h2 className="text-sm font-bold text-[#E9E5DC]">High-Risk Action Approvals</h2>
            </div>
            <span className="text-xs font-mono text-[#E2B066] tabular-nums">{pendingApprovals.length} pending</span>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="text-xs text-[#B5AA99] py-4">No control actions awaiting Admin/Owner approval.</div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              {pendingApprovals.map((act) => (
                <div key={act.id} className="rounded-lg border border-[#544021] bg-[#211D10] p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-[#E9E5DC] font-semibold">{act.action_type}</span>
                    <span className="text-[#E2B066]">{act.risk_level} RISK</span>
                  </div>
                  <div className="text-[#B5AA99]">{act.reason || `Target workflow: ${act.workflow_id}`}</div>
                  {canApprove ? (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleApprove(act.id)}
                        className="px-3 py-1 rounded bg-[#A51B0B] hover:bg-[#C52A18] text-[#E9E5DC] text-[11px] font-semibold"
                      >
                        Approve &amp; Execute
                      </button>
                      <button
                        onClick={() => handleReject(act.id)}
                        className="px-3 py-1 rounded border border-[#383838] bg-[#171717] text-[#B5AA99] text-[11px]"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#E2B066]">Admin or Owner role required to approve.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* AI Control Center Assistant */}
        <section className="lg:col-span-7 rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#383838] pb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#C52A18]" />
              <h2 className="text-sm font-bold text-[#E9E5DC]">AI Automation Control Assistant</h2>
            </div>
            <span className="text-[11px] font-mono text-[#B5AA99]">Advisory · Validation &amp; Approval Enforced</span>
          </div>

          <form onSubmit={handleAskAssistant} className="flex gap-2">
            <input
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              placeholder="Ask e.g. 'Which workflows are currently unhealthy?' or 'What happens if I retry?'"
              className="flex-1 rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-xs text-[#E9E5DC] focus:border-[#C52A18] focus:outline-none"
            />
            <button
              type="submit"
              disabled={aiLoading}
              className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-50 px-4 py-2 text-xs font-semibold text-[#E9E5DC]"
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
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAiQuestion(preset)}
                className="rounded border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-2 py-1 text-[#B5AA99]"
              >
                {preset}
              </button>
            ))}
          </div>

          {aiResult && (
            <div className="rounded-lg border border-[#383838] bg-[#171717] p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#B5AA99]">
                <span>{aiResult.is_ai_generated ? `Gemini (${aiResult.model_used})` : `Rules Advisor (${aiResult.model_used})`}</span>
                <span>{aiResult.unhealthy_count} unhealthy · {aiResult.repeated_failures_count} repeated</span>
              </div>
              <p className="text-[#E9E5DC] leading-relaxed">{aiResult.answer}</p>

              {aiResult.proposed_actions?.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#383838]">
                  <div className="text-[11px] font-semibold uppercase text-[#E2B066]">
                    Proposed Safe Actions (Requires Confirmation)
                  </div>
                  {aiResult.proposed_actions.map((prop: any, idx: number) => {
                    const wf = workflows.find((w) => w.id === prop.workflow_id);
                    return (
                      <div key={idx} className="rounded border border-[#383838] bg-[#202020] p-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-[#E9E5DC]">
                            {prop.action_type} · {prop.workflow_name} ({prop.platform})
                          </div>
                          <div className="text-[#B5AA99] text-[11px]">{prop.reason}</div>
                        </div>
                        <button
                          disabled={!canExecute || !prop.supported || !wf}
                          onClick={() => wf && stageControlAction(wf, prop.action_type, undefined, prop.reason)}
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
          <h2 className="text-sm font-semibold text-[#E9E5DC] uppercase tracking-wider">Immutable Control Activity Log</h2>
          <span className="text-xs font-mono text-[#B5AA99] tabular-nums">{activityLogs.length} events</span>
        </div>
        {activityLogs.length === 0 ? (
          <div className="p-6 text-xs text-[#B5AA99]">No control center actions logged yet.</div>
        ) : (
          <div className="divide-y divide-[#383838] max-h-64 overflow-y-auto">
            {activityLogs.map((log) => (
              <div key={log.id} className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs">
                <div className="min-w-0">
                  <div className="text-[#E9E5DC] truncate">{log.summary}</div>
                  <div className="text-[11px] font-mono text-[#B5AA99]">
                    {log.platform} · {log.action_type} · Role: {log.actor_role || 'SYSTEM'} · {formatDate(log.created_at)}
                  </div>
                </div>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded border border-[#383838] bg-[#171717] text-[#E9E5DC] shrink-0">
                  {log.event_status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Explicit Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#383838] bg-[#202020] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#E9E5DC]">Confirm Control Action</h3>
              <button onClick={() => setConfirmModal(null)} className="text-[#B5AA99] hover:text-[#E9E5DC]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-lg border border-[#383838] bg-[#171717] p-3 text-xs space-y-1">
              <div className="font-semibold text-[#E9E5DC]">
                {confirmModal.actionType} on {confirmModal.workflow.name} ({confirmModal.workflow.platform})
              </div>
              <div className="text-[#B5AA99]">
                This action sends a live command through Zevkar&apos;s validated Control Engine. High-risk or financial actions will enter the Admin/Owner approval queue first.
              </div>
            </div>
            <div className="space-y-1.5 text-xs">
              <label className="block font-medium text-[#E9E5DC]">Operator Audit Note</label>
              <input
                value={confirmModal.reason}
                onChange={(e) => setConfirmModal({ ...confirmModal, reason: e.target.value })}
                className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-xs text-[#E9E5DC]"
              />
            </div>
            {(confirmModal.actionType === 'UPDATE_SETTINGS' || confirmModal.actionType === 'MANAGE_SCHEDULE' || confirmModal.actionType === 'TRIGGER') && (
              <div className="space-y-1.5 text-xs">
                <label className="block font-medium text-[#E9E5DC]">Action Payload (JSON)</label>
                <textarea
                  rows={4}
                  value={confirmModal.payloadText}
                  onChange={(e) => setConfirmModal({ ...confirmModal, payloadText: e.target.value })}
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 font-mono text-[11px] text-[#E9E5DC]"
                />
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-2 rounded-md border border-[#383838] bg-[#171717] text-xs text-[#B5AA99]"
              >
                Cancel
              </button>
              <button
                onClick={submitConfirmedAction}
                disabled={submittingAction}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-50 text-xs font-semibold text-[#E9E5DC]"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{submittingAction ? 'Submitting...' : 'Confirm & Submit'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api-client';

interface AlertsSlaConsoleProps {
  timezone: string;
  userRole?: string;
}

type SlaBadgeTone = 'success' | 'warning' | 'error' | 'neutral';

function StatusBadge({ label, tone }: { label: string; tone: SlaBadgeTone }) {
  const styles: Record<SlaBadgeTone, string> = {
    success: 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]',
    warning: 'border-[#544021] bg-[#2D2414] text-[#E2B066]',
    error: 'border-[#61231C] bg-[#2B1513] text-[#E88A7E]',
    neutral: 'border-[#383838] bg-[#171717] text-[#B5AA99]',
  };
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${styles[tone]}`}>
      {label}
    </span>
  );
}

function deliveryStatusTone(status?: string | null): SlaBadgeTone {
  switch (status) {
    case 'DELIVERED':
      return 'success';
    case 'FAILED':
      return 'error';
    case 'QUEUED':
    case 'RETRYING':
    case 'SKIPPED_UNCONFIGURED':
      return 'warning';
    default:
      return 'neutral';
  }
}

function formatTimestamp(iso: string | null | undefined, timezone: string): string {
  if (!iso) return 'N/A';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return 'N/A';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(dt);
  } catch {
    return dt.toISOString();
  }
}

export function AlertsSlaConsole({ timezone, userRole = 'VIEWER' }: AlertsSlaConsoleProps) {
  const queryClient = useQueryClient();
  const canWrite = userRole !== 'VIEWER';
  const canAdmin = userRole === 'OWNER' || userRole === 'ADMIN';

  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Policy form state
  const [targetSuccessRate, setTargetSuccessRate] = useState('99.0');
  const [targetMttr, setTargetMttr] = useState('15');
  const [maxCritIncidents, setMaxCritIncidents] = useState('1');
  const [windowHours, setWindowHours] = useState('24');

  // Create channel form state
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [chName, setChName] = useState('');
  const [chType, setChType] = useState('SLACK');
  const [chTargetUrl, setChTargetUrl] = useState('');
  const [chSeverity, setChSeverity] = useState('HIGH');

  // Create / Edit rule form state
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [ruleCondition, setRuleCondition] = useState('CONSECUTIVE_FAILURES');
  const [ruleThreshold, setRuleThreshold] = useState('3');
  const [ruleSeverity, setRuleSeverity] = useState('HIGH');
  const [ruleAction, setRuleAction] = useState('NOTIFY_CHANNELS');
  const [ruleCooldown, setRuleCooldown] = useState('15');
  const [ruleChannelIds, setRuleChannelIds] = useState<string[]>([]);

  const policyQuery = useQuery({
    queryKey: ['sla', 'policy'],
    queryFn: () => api.sla.getPolicy(),
  });
  const reportQuery = useQuery({
    queryKey: ['sla', 'report'],
    queryFn: () => api.sla.getReport(),
  });
  const channelsQuery = useQuery({
    queryKey: ['alerts', 'channels'],
    queryFn: () => api.alerts.listChannels(),
  });
  const rulesQuery = useQuery({
    queryKey: ['alerts', 'rules'],
    queryFn: () => api.alerts.listRules(),
  });
  const deliveriesQuery = useQuery({
    queryKey: ['alerts', 'deliveries'],
    queryFn: () => api.alerts.listDeliveries(50),
  });

  useEffect(() => {
    if (policyQuery.data) {
      setTargetSuccessRate(String(policyQuery.data.target_success_rate_percent ?? 99.0));
      setTargetMttr(String(policyQuery.data.target_mttr_minutes ?? 15));
      setMaxCritIncidents(String(policyQuery.data.max_open_critical_incidents ?? 1));
      setWindowHours(String(policyQuery.data.evaluation_window_hours ?? 24));
    }
  }, [policyQuery.data]);

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['sla'] });
    void queryClient.invalidateQueries({ queryKey: ['alerts'] });
  };

  const updatePolicyMutation = useMutation({
    mutationFn: () =>
      api.sla.updatePolicy({
        target_success_rate_percent: Number(targetSuccessRate),
        target_mttr_minutes: Number(targetMttr),
        max_open_critical_incidents: Number(maxCritIncidents),
        evaluation_window_hours: Number(windowHours),
      }),
    onSuccess: () => {
      setBanner({ type: 'success', text: 'SLA policy targets updated and compliance recalculated.' });
      invalidateAll();
    },
    onError: (err: any) => setBanner({ type: 'error', text: err?.message || 'Failed to update SLA policy.' }),
  });

  const createChannelMutation = useMutation({
    mutationFn: () =>
      api.alerts.createChannel({
        name: chName.trim(),
        channel_type: chType,
        target_url: chTargetUrl.trim(),
        min_severity: chSeverity,
        is_enabled: true,
      }),
    onSuccess: (data) => {
      setChName('');
      setChTargetUrl('');
      setShowChannelForm(false);
      setBanner({
        type: 'success',
        text: `Alert channel "${data.name}" saved with masked endpoint ${data.target_preview}.`,
      });
      invalidateAll();
    },
    onError: (err: any) => setBanner({ type: 'error', text: err?.message || 'Failed to register alert channel.' }),
  });

  const toggleChannelMutation = useMutation({
    mutationFn: (ch: any) => api.alerts.updateChannel(ch.id, { is_enabled: !ch.is_enabled }),
    onSuccess: () => invalidateAll(),
    onError: (err: any) => setBanner({ type: 'error', text: err?.message || 'Failed to update channel state.' }),
  });

  const deleteChannelMutation = useMutation({
    mutationFn: (id: string) => api.alerts.deleteChannel(id),
    onSuccess: () => {
      setBanner({ type: 'success', text: 'Alert channel deleted.' });
      invalidateAll();
    },
    onError: (err: any) => setBanner({ type: 'error', text: err?.message || 'Failed to delete alert channel.' }),
  });

  const testChannelMutation = useMutation({
    mutationFn: (id: string) => api.alerts.testChannel(id, false),
    onSuccess: (data) => {
      const delivery = data?.delivery;
      if (delivery?.status === 'FAILED' || delivery?.status === 'SKIPPED_UNCONFIGURED') {
        setBanner({
          type: 'error',
          text: `Test dispatch (${delivery.status}): ${delivery.response_summary}`,
        });
      } else {
        setBanner({
          type: 'success',
          text: `Test dispatch ${delivery?.status || 'DELIVERED'}: ${delivery?.response_summary || 'Accepted by endpoint.'}`,
        });
      }
      invalidateAll();
    },
    onError: (err: any) => setBanner({ type: 'error', text: err?.message || 'Test alert request failed.' }),
  });

  const saveRuleMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: ruleName.trim(),
        condition_type: ruleCondition,
        threshold_value: Number(ruleThreshold),
        severity: ruleSeverity,
        action_type: ruleAction,
        cooldown_minutes: Number(ruleCooldown),
        target_channel_ids: ruleChannelIds,
      };
      return editingRuleId ? api.alerts.updateRule(editingRuleId, body) : api.alerts.createRule({ ...body, is_enabled: true });
    },
    onSuccess: (data) => {
      setBanner({
        type: 'success',
        text: editingRuleId ? `Guardrail rule "${data.name}" updated.` : `Guardrail rule "${data.name}" created.`,
      });
      resetRuleForm();
      invalidateAll();
    },
    onError: (err: any) => setBanner({ type: 'error', text: err?.message || 'Unable to save reliability rule.' }),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: (rule: any) => api.alerts.updateRule(rule.id, { is_enabled: !rule.is_enabled }),
    onSuccess: () => invalidateAll(),
    onError: (err: any) => setBanner({ type: 'error', text: err?.message || 'Failed to toggle rule.' }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => api.alerts.deleteRule(id),
    onSuccess: () => {
      setBanner({ type: 'success', text: 'Guardrail rule deleted.' });
      invalidateAll();
    },
    onError: (err: any) => setBanner({ type: 'error', text: err?.message || 'Failed to delete guardrail rule.' }),
  });

  const evaluateMutation = useMutation({
    mutationFn: () => api.alerts.evaluateRules(true, false),
    onSuccess: (data) => {
      setBanner({
        type: 'success',
        text: `Evaluated ${data.rulesEvaluated ?? 0} active rule(s): ${data.triggeredCount ?? 0} triggered, ${(data.deliveriesCreated || []).length} delivery attempt(s) logged.`,
      });
      invalidateAll();
    },
    onError: (err: any) => setBanner({ type: 'error', text: err?.message || 'Failed to run guardrail evaluation.' }),
  });

  function resetRuleForm() {
    setEditingRuleId(null);
    setRuleName('');
    setRuleCondition('CONSECUTIVE_FAILURES');
    setRuleThreshold('3');
    setRuleSeverity('HIGH');
    setRuleAction('NOTIFY_CHANNELS');
    setRuleCooldown('15');
    setRuleChannelIds([]);
    setShowRuleForm(false);
  }

  function startEditingRule(rule: any) {
    setEditingRuleId(rule.id);
    setRuleName(rule.name || '');
    setRuleCondition(rule.condition_type || 'CONSECUTIVE_FAILURES');
    setRuleThreshold(String(rule.threshold_value ?? 3));
    setRuleSeverity(rule.severity || 'HIGH');
    setRuleAction(rule.action_type || 'NOTIFY_CHANNELS');
    setRuleCooldown(String(rule.cooldown_minutes ?? 15));
    setRuleChannelIds(Array.isArray(rule.target_channel_ids) ? rule.target_channel_ids : []);
    setShowRuleForm(true);
  }

  const isLoadingInitial =
    policyQuery.isLoading || reportQuery.isLoading || channelsQuery.isLoading || rulesQuery.isLoading || deliveriesQuery.isLoading;

  const queryError =
    policyQuery.error || reportQuery.error || channelsQuery.error || rulesQuery.error || deliveriesQuery.error;

  const report = reportQuery.data;
  const policy = policyQuery.data;
  const channels = channelsQuery.data || [];
  const rules = rulesQuery.data || [];
  const deliveries = deliveriesQuery.data || [];

  const slaTone: SlaBadgeTone =
    report?.status === 'BREACHING' ? 'error' : report?.status === 'AT_RISK' ? 'warning' : 'success';

  if (isLoadingInitial && !report) {
    return (
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-10 text-center text-xs text-[#B5AA99]">
        Loading SLA compliance targets, encrypted alert channels, and reliability guardrails...
      </div>
    );
  }

  if (queryError && !report) {
    return (
      <div role="alert" className="rounded-xl border border-[#61231C] bg-[#2B1513] p-6 text-xs text-[#E88A7E] flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{(queryError as Error)?.message || 'Failed to load SLA & alert routing console.'}</span>
        </div>
        <button
          type="button"
          onClick={invalidateAll}
          className="rounded border border-[#61231C] bg-[#171717] px-3 py-1.5 text-[#E9E5DC] font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-[#E9E5DC]">SLA Monitoring, Guardrails &amp; Alert Routing</h1>
            {report && <StatusBadge label={`SLA ${report.status}`} tone={slaTone} />}
          </div>
          <p className="text-xs text-[#B5AA99] mt-1">
            Monitor workspace SLOs, configure AES-GCM encrypted alert channels, and evaluate HMAC-SHA256 reliability guardrails
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={invalidateAll}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] px-3 py-2 text-xs font-semibold text-[#E9E5DC]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Refresh</span>
          </button>

          {canWrite && (
            <button
              type="button"
              disabled={evaluateMutation.isPending}
              onClick={() => evaluateMutation.mutate()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-50 px-3.5 py-2 text-xs font-semibold text-[#E9E5DC]"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{evaluateMutation.isPending ? 'Evaluating...' : 'Run Guardrail Evaluation'}</span>
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div
          role={banner.type === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border px-4 py-3 text-xs flex items-center justify-between gap-3 ${
            banner.type === 'error'
              ? 'border-[#61231C] bg-[#2B1513] text-[#E88A7E]'
              : 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'error' ? <XCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
            <span>{banner.text}</span>
          </div>
          <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss banner" className="text-[#E9E5DC]">
            &times;
          </button>
        </div>
      )}

      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-[#383838] bg-[#202020] p-5">
            <div className="flex items-center justify-between text-xs text-[#B5AA99]">
              <span>Execution Success Rate</span>
              <Activity className="h-4 w-4 text-[#8CC59B]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-3xl font-extrabold text-[#E9E5DC] tabular-nums">{report.currentSuccessRatePercent}%</p>
            <span className="mt-1 block text-[11px] text-[#B5AA99] tabular-nums">
              Target SLA: {report.targetSuccessRatePercent}% ({policy?.evaluation_window_hours || 24}h window)
            </span>
          </div>

          <div className="rounded-xl border border-[#383838] bg-[#202020] p-5">
            <div className="flex items-center justify-between text-xs text-[#B5AA99]">
              <span>Actual MTTR vs Target</span>
              <Clock className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-3xl font-extrabold text-[#E9E5DC] tabular-nums">{report.currentMttrMinutes}m</p>
            <span className="mt-1 block text-[11px] text-[#B5AA99] tabular-nums">
              Target MTTR: &le; {report.targetMttrMinutes} mins
            </span>
          </div>

          <div className="rounded-xl border border-[#383838] bg-[#202020] p-5">
            <div className="flex items-center justify-between text-xs text-[#B5AA99]">
              <span>Error Budget Remaining</span>
              <ShieldCheck className="h-4 w-4 text-[#E2B066]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-3xl font-extrabold text-[#E2B066] tabular-nums">{report.errorBudgetRemainingPercent}%</p>
            <div className="mt-2 h-1.5 w-full rounded bg-[#171717] overflow-hidden">
              <div
                className="h-full bg-[#C52A18]"
                style={{ width: `${Math.max(4, Math.min(100, report.errorBudgetRemainingPercent))}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#383838] bg-[#202020] p-5">
            <div className="flex items-center justify-between text-xs text-[#B5AA99]">
              <span>Breaching Workflows</span>
              <AlertTriangle className="h-4 w-4 text-[#E88A7E]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-3xl font-extrabold text-[#E9E5DC] tabular-nums">{report.breachingWorkflows.length}</p>
            <span className="mt-1 block text-[11px] text-[#B5AA99] tabular-nums">
              {report.healthyWorkflows}/{report.totalWorkflows} healthy · {report.activeCriticalIncidents} critical open
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#383838] pb-3">
            <div>
              <h2 className="text-sm font-bold text-[#E9E5DC]">SLA Breach Monitor</h2>
              <p className="text-xs text-[#B5AA99]">Workflows degraded or crossing consecutive failure budgets</p>
            </div>
            <span className="font-mono text-xs text-[#B5AA99] tabular-nums">
              {report?.breachingWorkflows?.length || 0} flagged
            </span>
          </div>

          {!report || report.breachingWorkflows.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#B5AA99]">
              All monitored workflows are currently operating within your SLA policy targets.
            </div>
          ) : (
            <div className="space-y-2.5">
              {report.breachingWorkflows.map((wf: any) => (
                <div
                  key={wf.workflowId}
                  className="rounded-lg border border-[#383838] bg-[#171717] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#E9E5DC]">{wf.workflowName}</span>
                      <StatusBadge label={wf.healthStatus} tone={wf.healthStatus === 'FAILING' ? 'error' : 'warning'} />
                    </div>
                    <p className="text-[11px] text-[#B5AA99] mt-0.5">
                      {wf.clientName} · {wf.reason}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-[#E88A7E] tabular-nums shrink-0">
                    {wf.consecutiveFailures} consecutive failure(s)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-xl border border-[#383838] bg-[#202020] p-5">
          <h2 className="text-sm font-bold text-[#E9E5DC]">SLA Target Policy</h2>
          <p className="text-xs text-[#B5AA99] mt-0.5 mb-4">
            Workspace-wide SLO thresholds used for compliance reporting and SLA breach alerts
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canAdmin) updatePolicyMutation.mutate();
            }}
            className="space-y-3 text-xs"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="next-sla-rate" className="block font-semibold text-[#E9E5DC] mb-1">
                  Target Success (%)
                </label>
                <input
                  id="next-sla-rate"
                  type="number"
                  step="0.1"
                  min="50"
                  max="100"
                  disabled={!canAdmin}
                  value={targetSuccessRate}
                  onChange={(e) => setTargetSuccessRate(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC] tabular-nums disabled:opacity-60"
                />
              </div>

              <div>
                <label htmlFor="next-sla-mttr" className="block font-semibold text-[#E9E5DC] mb-1">
                  Target MTTR (mins)
                </label>
                <input
                  id="next-sla-mttr"
                  type="number"
                  min="1"
                  max="1440"
                  disabled={!canAdmin}
                  value={targetMttr}
                  onChange={(e) => setTargetMttr(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC] tabular-nums disabled:opacity-60"
                />
              </div>

              <div>
                <label htmlFor="next-sla-crit" className="block font-semibold text-[#E9E5DC] mb-1">
                  Max Open Critical
                </label>
                <input
                  id="next-sla-crit"
                  type="number"
                  min="0"
                  max="100"
                  disabled={!canAdmin}
                  value={maxCritIncidents}
                  onChange={(e) => setMaxCritIncidents(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC] tabular-nums disabled:opacity-60"
                />
              </div>

              <div>
                <label htmlFor="next-sla-window" className="block font-semibold text-[#E9E5DC] mb-1">
                  Window (hours)
                </label>
                <input
                  id="next-sla-window"
                  type="number"
                  min="1"
                  max="720"
                  disabled={!canAdmin}
                  value={windowHours}
                  onChange={(e) => setWindowHours(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC] tabular-nums disabled:opacity-60"
                />
              </div>
            </div>

            {canAdmin ? (
              <button
                type="submit"
                disabled={updatePolicyMutation.isPending}
                className="w-full rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-50 py-2 font-semibold text-[#E9E5DC]"
              >
                {updatePolicyMutation.isPending ? 'Saving SLA Targets...' : 'Save SLA Targets'}
              </button>
            ) : (
              <p className="text-[11px] text-[#B5AA99]">Only OWNER or ADMIN roles may modify SLA policy targets.</p>
            )}
          </form>
        </div>
      </div>

      {/* Outbound Alert Channels */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#383838] pb-3">
          <div>
            <h2 className="text-sm font-bold text-[#E9E5DC]">Outbound Alert Routing Channels</h2>
            <p className="text-xs text-[#B5AA99]">
              AES-GCM encrypted Slack, Discord, PagerDuty, Webhook (HMAC-SHA256), and Email Digest destinations
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowChannelForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-3 py-1.5 text-xs font-semibold text-[#E9E5DC]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showChannelForm ? 'Cancel' : 'Add Alert Channel'}</span>
            </button>
          )}
        </div>

        {showChannelForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createChannelMutation.mutate();
            }}
            className="rounded-lg border border-[#383838] bg-[#171717] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs"
          >
            <div>
              <label htmlFor="next-ch-name" className="block font-semibold text-[#E9E5DC] mb-1">
                Channel Name
              </label>
              <input
                id="next-ch-name"
                type="text"
                required
                value={chName}
                onChange={(e) => setChName(e.target.value)}
                placeholder="Production Ops Slack"
                className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC]"
              />
            </div>

            <div>
              <label htmlFor="next-ch-type" className="block font-semibold text-[#E9E5DC] mb-1">
                Channel Type
              </label>
              <select
                id="next-ch-type"
                value={chType}
                onChange={(e) => setChType(e.target.value)}
                className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC]"
              >
                <option value="SLACK">Slack Webhook</option>
                <option value="DISCORD">Discord Webhook</option>
                <option value="CUSTOM_WEBHOOK">Custom Signed Webhook</option>
                <option value="PAGERDUTY">PagerDuty Events</option>
                <option value="EMAIL_DIGEST">Email Digest</option>
              </select>
            </div>

            <div>
              <label htmlFor="next-ch-target" className="block font-semibold text-[#E9E5DC] mb-1">
                {chType === 'EMAIL_DIGEST' ? 'Recipient Email' : 'Webhook Target URL'}
              </label>
              <input
                id="next-ch-target"
                type={chType === 'EMAIL_DIGEST' ? 'email' : 'url'}
                required
                value={chTargetUrl}
                onChange={(e) => setChTargetUrl(e.target.value)}
                placeholder={chType === 'EMAIL_DIGEST' ? 'oncall@company.com' : 'https://hooks.slack.com/services/...'}
                className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC]"
              />
            </div>

            <div>
              <label htmlFor="next-ch-severity" className="block font-semibold text-[#E9E5DC] mb-1">
                Min Severity
              </label>
              <div className="flex gap-2">
                <select
                  id="next-ch-severity"
                  value={chSeverity}
                  onChange={(e) => setChSeverity(e.target.value)}
                  className="flex-1 rounded-md border border-[#383838] bg-[#202020] px-2.5 py-2 text-[#E9E5DC]"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
                <button
                  type="submit"
                  disabled={createChannelMutation.isPending}
                  className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-50 px-3.5 py-2 font-semibold text-[#E9E5DC]"
                >
                  {createChannelMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        )}

        {channels.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#B5AA99]">
            No outbound alert channels configured yet. Add Slack, Discord, PagerDuty, Email Digest, or custom webhooks above.
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((ch: any) => (
              <div
                key={ch.id}
                className="rounded-lg border border-[#383838] bg-[#171717] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#E9E5DC] text-sm">{ch.name}</span>
                    <StatusBadge label={ch.channel_type} tone="neutral" />
                    <StatusBadge label={`MIN: ${ch.min_severity}`} tone="warning" />
                    {ch.last_delivery_status && (
                      <StatusBadge label={ch.last_delivery_status} tone={deliveryStatusTone(ch.last_delivery_status)} />
                    )}
                  </div>
                  <p className="font-mono text-[11px] text-[#B5AA99]">
                    Target: {ch.target_preview}{' '}
                    {ch.signing_secret_preview ? `· Secret: ${ch.signing_secret_preview}` : ''}
                  </p>
                  {ch.last_error && <p className="text-[11px] text-[#E88A7E]">{ch.last_error}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canWrite && (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleChannelMutation.mutate(ch)}
                        aria-label={`Toggle channel ${ch.name}`}
                        className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${
                          ch.is_enabled
                            ? 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]'
                            : 'border-[#383838] bg-[#202020] text-[#B5AA99]'
                        }`}
                      >
                        {ch.is_enabled ? 'Enabled' : 'Paused'}
                      </button>

                      <button
                        type="button"
                        disabled={testChannelMutation.isPending}
                        onClick={() => testChannelMutation.mutate(ch.id)}
                        aria-label={`Send test alert to ${ch.name}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#544021] bg-[#211D10] hover:border-[#C52A18] disabled:opacity-50 px-3 py-1.5 text-[11px] font-semibold text-[#E9E5DC]"
                      >
                        <Send className="h-3 w-3 text-[#C52A18]" aria-hidden="true" />
                        <span>Test Alert</span>
                      </button>
                    </>
                  )}

                  {canAdmin && (
                    <button
                      type="button"
                      onClick={() => deleteChannelMutation.mutate(ch.id)}
                      aria-label={`Delete channel ${ch.name}`}
                      className="rounded-md border border-[#383838] bg-[#202020] hover:border-[#E88A7E] p-1.5 text-[#B5AA99] hover:text-[#E88A7E]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reliability Rules */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#383838] pb-3">
          <div>
            <h2 className="text-sm font-bold text-[#E9E5DC]">Automated Reliability &amp; Escalation Rules</h2>
            <p className="text-xs text-[#B5AA99]">
              Evaluated manually or every 5 minutes by Celery Beat across active workflows and incidents
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => {
                if (showRuleForm) {
                  resetRuleForm();
                } else {
                  setEditingRuleId(null);
                  setShowRuleForm(true);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-3 py-1.5 text-xs font-semibold text-[#E9E5DC]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showRuleForm ? 'Cancel' : 'Add Guardrail Rule'}</span>
            </button>
          )}
        </div>

        {showRuleForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveRuleMutation.mutate();
            }}
            className="rounded-lg border border-[#383838] bg-[#171717] p-4 space-y-3 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label htmlFor="next-rule-name" className="block font-semibold text-[#E9E5DC] mb-1">
                  Rule Name
                </label>
                <input
                  id="next-rule-name"
                  type="text"
                  required
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="Consecutive Failure Circuit Alert"
                  className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC]"
                />
              </div>

              <div>
                <label htmlFor="next-rule-cond" className="block font-semibold text-[#E9E5DC] mb-1">
                  Condition
                </label>
                <select
                  id="next-rule-cond"
                  value={ruleCondition}
                  onChange={(e) => setRuleCondition(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC]"
                >
                  <option value="CONSECUTIVE_FAILURES">Consecutive Failures (&ge; N runs)</option>
                  <option value="FAILURE_RATE_SPIKE">Failure Rate Spike (&ge; N%)</option>
                  <option value="CRITICAL_INCIDENT_OPEN">High/Critical Incident Open (&ge; N mins)</option>
                  <option value="SLA_BREACH">Workspace SLA Breach (&lt; N% success)</option>
                </select>
              </div>

              <div>
                <label htmlFor="next-rule-threshold" className="block font-semibold text-[#E9E5DC] mb-1">
                  Threshold
                </label>
                <input
                  id="next-rule-threshold"
                  type="number"
                  min="0"
                  step="0.1"
                  required
                  value={ruleThreshold}
                  onChange={(e) => setRuleThreshold(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC] tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="next-rule-severity" className="block font-semibold text-[#E9E5DC] mb-1">
                  Severity
                </label>
                <select
                  id="next-rule-severity"
                  value={ruleSeverity}
                  onChange={(e) => setRuleSeverity(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC]"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>

              <div>
                <label htmlFor="next-rule-action" className="block font-semibold text-[#E9E5DC] mb-1">
                  Action
                </label>
                <select
                  id="next-rule-action"
                  value={ruleAction}
                  onChange={(e) => setRuleAction(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC]"
                >
                  <option value="NOTIFY_CHANNELS">Dispatch Channel Alerts</option>
                  <option value="ESCALATE_SEVERITY">Escalate Incident Severity + Alert</option>
                  <option value="OPEN_RECOVERY_REQUEST">Flag Recovery Gate + Alert</option>
                </select>
              </div>

              <div>
                <label htmlFor="next-rule-cooldown" className="block font-semibold text-[#E9E5DC] mb-1">
                  Cooldown (mins)
                </label>
                <input
                  id="next-rule-cooldown"
                  type="number"
                  min="1"
                  max="1440"
                  value={ruleCooldown}
                  onChange={(e) => setRuleCooldown(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC] tabular-nums"
                />
              </div>
            </div>

            {channels.length > 0 && (
              <div>
                <span className="block font-semibold text-[#E9E5DC] mb-1.5">
                  Target Channels (leave unselected to broadcast to all matching enabled channels)
                </span>
                <div className="flex flex-wrap gap-2">
                  {channels.map((c: any) => {
                    const selected = ruleChannelIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setRuleChannelIds((prev) =>
                            prev.includes(c.id) ? prev.filter((item) => item !== c.id) : [...prev, c.id]
                          )
                        }
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
                          selected
                            ? 'border-[#C52A18] bg-[#A51B0B]/20 text-[#E9E5DC]'
                            : 'border-[#383838] bg-[#202020] text-[#B5AA99]'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {editingRuleId && (
                <button
                  type="button"
                  onClick={resetRuleForm}
                  className="rounded-md border border-[#383838] bg-[#202020] px-4 py-2 font-semibold text-[#B5AA99]"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="submit"
                disabled={saveRuleMutation.isPending}
                className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-50 px-4 py-2 font-semibold text-[#E9E5DC]"
              >
                {saveRuleMutation.isPending
                  ? 'Saving...'
                  : editingRuleId
                  ? 'Update Guardrail Rule'
                  : 'Save Guardrail Rule'}
              </button>
            </div>
          </form>
        )}

        {rules.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#B5AA99]">
            No automated reliability rules configured yet.
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule: any) => (
              <div
                key={rule.id}
                className="rounded-lg border border-[#383838] bg-[#171717] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#E9E5DC] text-sm">{rule.name}</span>
                    <StatusBadge
                      label={rule.severity}
                      tone={rule.severity === 'CRITICAL' ? 'error' : rule.severity === 'HIGH' ? 'warning' : 'neutral'}
                    />
                    <span className="font-mono text-[11px] text-[#B5AA99]">
                      {rule.condition_type} (&ge; {rule.threshold_value})
                    </span>
                  </div>
                  <p className="text-[11px] text-[#B5AA99]">
                    Action: {rule.action_type} · Cooldown: {rule.cooldown_minutes}m · Triggers: {rule.trigger_count}
                    {rule.last_triggered_at ? ` · Last triggered ${formatTimestamp(rule.last_triggered_at, timezone)}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {canWrite && (
                    <>
                      <button
                        type="button"
                        onClick={() => startEditingRule(rule)}
                        aria-label={`Edit rule ${rule.name}`}
                        className="rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] p-1.5 text-[#B5AA99] hover:text-[#E9E5DC]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleRuleMutation.mutate(rule)}
                        aria-label={`Toggle rule ${rule.name}`}
                        className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${
                          rule.is_enabled
                            ? 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]'
                            : 'border-[#383838] bg-[#202020] text-[#B5AA99]'
                        }`}
                      >
                        {rule.is_enabled ? 'Active' : 'Paused'}
                      </button>
                    </>
                  )}
                  {canAdmin && (
                    <button
                      type="button"
                      onClick={() => deleteRuleMutation.mutate(rule.id)}
                      aria-label={`Delete rule ${rule.name}`}
                      className="rounded-md border border-[#383838] bg-[#202020] hover:border-[#E88A7E] p-1.5 text-[#B5AA99] hover:text-[#E88A7E]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outbound Alert Delivery History */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#383838] pb-3">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
            <h2 className="text-sm font-bold text-[#E9E5DC]">Outbound Alert Delivery History</h2>
          </div>
          <span className="font-mono text-xs text-[#B5AA99] tabular-nums">{deliveries.length} events</span>
        </div>

        {deliveries.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#B5AA99]">
            No outbound alerts dispatched yet. Click &quot;Test Alert&quot; or run guardrail evaluation above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#383838] text-[11px] uppercase tracking-wider text-[#B5AA99]">
                  <th className="py-2 pr-3">Channel</th>
                  <th className="py-2 pr-3">Event &amp; Summary</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Attempts / Mode</th>
                  <th className="py-2 pr-3">Signature</th>
                  <th className="py-2">Delivered ({timezone})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#383838]">
                {deliveries.map((d: any) => (
                  <tr key={d.id} className="align-top">
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-[#E9E5DC]">{d.channel_name}</div>
                      <div className="font-mono text-[11px] text-[#B5AA99]">{d.channel_type}</div>
                    </td>
                    <td className="py-3 pr-3 max-w-md">
                      <div className="font-medium text-[#E9E5DC]">{d.title}</div>
                      <div className="text-[11px] text-[#B5AA99] mt-0.5">{d.response_summary}</div>
                    </td>
                    <td className="py-3 pr-3">
                      <StatusBadge
                        label={d.http_status ? `${d.status} (${d.http_status})` : d.status}
                        tone={deliveryStatusTone(d.status)}
                      />
                    </td>
                    <td className="py-3 pr-3 font-mono text-[11px] text-[#B5AA99] whitespace-nowrap">
                      {d.attempt_count ?? 1}x · {d.dispatched_via || 'SYNC'}
                    </td>
                    <td className="py-3 pr-3 font-mono text-[11px] text-[#B5AA99]">{d.signature_header || 'N/A'}</td>
                    <td className="py-3 font-mono text-[11px] text-[#B5AA99] whitespace-nowrap">
                      {formatTimestamp(d.delivered_at, timezone)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

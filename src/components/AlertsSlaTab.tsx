import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { authFetch } from '../lib/api';
import { formatInTimezone } from '../lib/datetime';
import type {
  AlertChannel,
  AlertChannelType,
  AlertDeliveryLog,
  ReliabilityRule,
  ReliabilityRuleAction,
  ReliabilityRuleCondition,
  Role,
  Severity,
  SlaComplianceReport,
  SlaPolicy,
} from '../types';
import { StatusBadge } from './marketing/StatusBadge';

interface AlertsSlaTabProps {
  timezone: string;
  currentUserRole?: Role;
  onDataChanged?: () => Promise<void> | void;
}

export const AlertsSlaTab: React.FC<AlertsSlaTabProps> = ({
  timezone,
  currentUserRole = 'OWNER',
  onDataChanged,
}) => {
  const canWrite = currentUserRole !== 'VIEWER';
  const canAdmin = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [slaPolicy, setSlaPolicy] = useState<SlaPolicy | null>(null);
  const [slaReport, setSlaReport] = useState<SlaComplianceReport | null>(null);
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [rules, setRules] = useState<ReliabilityRule[]>([]);
  const [deliveries, setDeliveries] = useState<AlertDeliveryLog[]>([]);

  // SLA form states
  const [targetSuccessRate, setTargetSuccessRate] = useState('99.0');
  const [targetMttr, setTargetMttr] = useState('15');
  const [maxCritIncidents, setMaxCritIncidents] = useState('1');
  const [windowHours, setWindowHours] = useState('24');
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Add Channel form states
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [chName, setChName] = useState('');
  const [chType, setChType] = useState<AlertChannelType>('SLACK');
  const [chTargetUrl, setChTargetUrl] = useState('');
  const [chSeverity, setChSeverity] = useState<Severity>('HIGH');
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);

  // Add Rule form states
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleCondition, setRuleCondition] = useState<ReliabilityRuleCondition>('CONSECUTIVE_FAILURES');
  const [ruleThreshold, setRuleThreshold] = useState('3');
  const [ruleSeverity, setRuleSeverity] = useState<Severity>('HIGH');
  const [ruleAction, setRuleAction] = useState<ReliabilityRuleAction>('NOTIFY_CHANNELS');
  const [ruleCooldown, setRuleCooldown] = useState('15');
  const [ruleChannelIds, setRuleChannelIds] = useState<string[]>([]);
  const [creatingRule, setCreatingRule] = useState(false);
  const [evaluatingRules, setEvaluatingRules] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [policyRes, reportRes, channelsRes, rulesRes, deliveriesRes] = await Promise.all([
        authFetch('/api/v1/sla/policy'),
        authFetch('/api/v1/sla/report'),
        authFetch('/api/v1/alerts/channels'),
        authFetch('/api/v1/alerts/rules'),
        authFetch('/api/v1/alerts/deliveries'),
      ]);

      if (!policyRes.ok || !reportRes.ok || !channelsRes.ok || !rulesRes.ok || !deliveriesRes.ok) {
        throw new Error('Failed to load SLA compliance and alert routing configuration.');
      }

      const [policyData, reportData, channelsData, rulesData, deliveriesData] = await Promise.all([
        policyRes.json(),
        reportRes.json(),
        channelsRes.json(),
        rulesRes.json(),
        deliveriesRes.json(),
      ]);

      setSlaPolicy(policyData);
      setTargetSuccessRate(String(policyData.targetSuccessRatePercent ?? 99));
      setTargetMttr(String(policyData.targetMttrMinutes ?? 15));
      setMaxCritIncidents(String(policyData.maxOpenCriticalIncidents ?? 1));
      setWindowHours(String(policyData.evaluationWindowHours ?? 24));
      setSlaReport(reportData);
      setChannels(Array.isArray(channelsData) ? channelsData : []);
      setRules(Array.isArray(rulesData) ? rulesData : []);
      setDeliveries(Array.isArray(deliveriesData) ? deliveriesData : []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load SLA and Alert Routing data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdmin) return;
    setSavingPolicy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await authFetch('/api/v1/sla/policy', {
        method: 'PUT',
        body: JSON.stringify({
          targetSuccessRatePercent: Number(targetSuccessRate),
          targetMttrMinutes: Number(targetMttr),
          maxOpenCriticalIncidents: Number(maxCritIncidents),
          evaluationWindowHours: Number(windowHours),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update SLA policy.');
      setSuccessMsg('SLA targets updated and compliance report recalculated.');
      await loadAll();
      if (onDataChanged) await onDataChanged();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save SLA policy.');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    setCreatingChannel(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await authFetch('/api/v1/alerts/channels', {
        method: 'POST',
        body: JSON.stringify({
          name: chName.trim(),
          channelType: chType,
          targetUrl: chTargetUrl.trim(),
          minSeverity: chSeverity,
          isEnabled: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to create alert channel.');
      setChName('');
      setChTargetUrl('');
      setShowChannelForm(false);
      setSuccessMsg(`Alert channel "${data.name}" registered with masked preview (${data.targetPreview}).`);
      await loadAll();
      if (onDataChanged) await onDataChanged();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to register alert channel.');
    } finally {
      setCreatingChannel(false);
    }
  };

  const handleToggleChannel = async (channel: AlertChannel) => {
    if (!canWrite) return;
    setErrorMsg(null);
    const res = await authFetch(`/api/v1/alerts/channels/${channel.id}`, {
      method: 'PUT',
      body: JSON.stringify({ isEnabled: !channel.isEnabled }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErrorMsg(d.error || 'Failed to update alert channel.');
      return;
    }
    await loadAll();
  };

  const handleDeleteChannel = async (channel: AlertChannel) => {
    if (!canAdmin) return;
    setErrorMsg(null);
    const res = await authFetch(`/api/v1/alerts/channels/${channel.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErrorMsg(d.error || 'Failed to delete alert channel.');
      return;
    }
    setSuccessMsg(`Deleted alert channel "${channel.name}".`);
    await loadAll();
    if (onDataChanged) await onDataChanged();
  };

  const handleTestChannel = async (channel: AlertChannel) => {
    if (!canWrite) return;
    setTestingChannelId(channel.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await authFetch(`/api/v1/alerts/channels/${channel.id}/test`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Test alert request failed.');
      const delivery = data.delivery as AlertDeliveryLog | undefined;
      if (delivery?.status === 'FAILED') {
        setErrorMsg(`Test alert failed on "${channel.name}": ${delivery.responseSummary}`);
      } else {
        setSuccessMsg(`Test alert ${delivery?.status || 'SENT'} on "${channel.name}": ${delivery?.responseSummary || 'Payload signed and queued.'}`);
      }
      await loadAll();
      if (onDataChanged) await onDataChanged();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Test alert dispatch failed.');
    } finally {
      setTestingChannelId(null);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    setCreatingRule(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await authFetch('/api/v1/alerts/rules', {
        method: 'POST',
        body: JSON.stringify({
          name: ruleName.trim(),
          conditionType: ruleCondition,
          thresholdValue: Number(ruleThreshold),
          severity: ruleSeverity,
          actionType: ruleAction,
          cooldownMinutes: Number(ruleCooldown),
          targetChannelIds: ruleChannelIds,
          isEnabled: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to create guardrail rule.');
      setRuleName('');
      setRuleChannelIds([]);
      setShowRuleForm(false);
      setSuccessMsg(`Reliability guardrail rule "${data.name}" saved.`);
      await loadAll();
      if (onDataChanged) await onDataChanged();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save guardrail rule.');
    } finally {
      setCreatingRule(false);
    }
  };

  const handleToggleRule = async (rule: ReliabilityRule) => {
    if (!canWrite) return;
    const res = await authFetch(`/api/v1/alerts/rules/${rule.id}`, {
      method: 'PUT',
      body: JSON.stringify({ isEnabled: !rule.isEnabled }),
    });
    if (res.ok) {
      await loadAll();
    }
  };

  const handleDeleteRule = async (rule: ReliabilityRule) => {
    if (!canAdmin) return;
    const res = await authFetch(`/api/v1/alerts/rules/${rule.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErrorMsg(d.error || 'Failed to delete guardrail rule.');
      return;
    }
    setSuccessMsg(`Deleted guardrail rule "${rule.name}".`);
    await loadAll();
  };

  const handleEvaluateRules = async (force = false) => {
    if (!canWrite) return;
    setEvaluatingRules(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await authFetch('/api/v1/alerts/evaluate', {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Guardrail evaluation failed.');
      setSuccessMsg(
        `Evaluated ${data.rulesEvaluated ?? 0} enabled rule(s): ${data.triggeredCount ?? 0} triggered, ${(data.deliveriesCreated || []).length} outbound alert(s) dispatched.`
      );
      await loadAll();
      if (onDataChanged) await onDataChanged();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to evaluate guardrail rules.');
    } finally {
      setEvaluatingRules(false);
    }
  };

  const toggleRuleChannelSelection = (id: string) => {
    setRuleChannelIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  if (loading && !slaReport) {
    return (
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-8 text-center text-xs text-[#B5AA99]">
        Loading SLA compliance targets, alert channels, and guardrail rules...
      </div>
    );
  }

  const slaTone =
    slaReport?.status === 'BREACHING'
      ? 'error'
      : slaReport?.status === 'AT_RISK'
      ? 'warning'
      : 'success';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
              SLA Monitoring, Guardrail Rules &amp; Alert Routing
            </h2>
            {slaReport && <StatusBadge label={`SLA ${slaReport.status}`} tone={slaTone} />}
          </div>
          <p className="text-xs text-[#B5AA99] mt-0.5">
            Track reliability SLOs, enforce automated circuit-breaker rules, and route HMAC-signed alerts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadAll()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] px-3 py-2 text-xs font-semibold text-[#E9E5DC]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Refresh</span>
          </button>

          {canWrite && (
            <button
              type="button"
              disabled={evaluatingRules}
              onClick={() => void handleEvaluateRules(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-50 px-3.5 py-2 text-xs font-semibold text-[#E9E5DC]"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{evaluatingRules ? 'Evaluating...' : 'Run Guardrail Evaluation'}</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-lg border border-[#61231C] bg-[#2B1513] px-4 py-3 text-xs text-[#E88A7E] flex items-center gap-2">
          <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div role="status" className="rounded-lg border border-[#2E4A36] bg-[#1C2A20] px-4 py-3 text-xs text-[#8CC59B] flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* SLA Compliance Metrics */}
      {slaReport && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-[#383838] bg-[#202020] p-5">
            <div className="flex items-center justify-between text-xs text-[#B5AA99]">
              <span>Execution Success Rate</span>
              <Activity className="h-4 w-4 text-[#8CC59B]" aria-hidden="true" />
            </div>
            <p className="mt-2 font-[var(--font-display)] text-3xl font-extrabold text-[#E9E5DC] tabular-nums">
              {slaReport.currentSuccessRatePercent}%
            </p>
            <span className="mt-1 block text-[11px] text-[#B5AA99] tabular-nums">
              Target SLA: {slaReport.targetSuccessRatePercent}% ({slaPolicy?.evaluationWindowHours || 24}h window)
            </span>
          </div>

          <div className="rounded-xl border border-[#383838] bg-[#202020] p-5">
            <div className="flex items-center justify-between text-xs text-[#B5AA99]">
              <span>Actual MTTR vs Target</span>
              <Clock className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
            </div>
            <p className="mt-2 font-[var(--font-display)] text-3xl font-extrabold text-[#E9E5DC] tabular-nums">
              {slaReport.currentMttrMinutes}m
            </p>
            <span className="mt-1 block text-[11px] text-[#B5AA99] tabular-nums">
              Target MTTR: &le; {slaReport.targetMttrMinutes} mins
            </span>
          </div>

          <div className="rounded-xl border border-[#383838] bg-[#202020] p-5">
            <div className="flex items-center justify-between text-xs text-[#B5AA99]">
              <span>Error Budget Remaining</span>
              <ShieldCheck className="h-4 w-4 text-[#E2B066]" aria-hidden="true" />
            </div>
            <p className="mt-2 font-[var(--font-display)] text-3xl font-extrabold text-[#E2B066] tabular-nums">
              {slaReport.errorBudgetRemainingPercent}%
            </p>
            <div className="mt-2 h-1.5 w-full rounded bg-[#171717] overflow-hidden">
              <div
                className="h-full bg-[#C52A18]"
                style={{ width: `${Math.max(4, Math.min(100, slaReport.errorBudgetRemainingPercent))}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#383838] bg-[#202020] p-5">
            <div className="flex items-center justify-between text-xs text-[#B5AA99]">
              <span>Breaching Workflows</span>
              <AlertTriangle className="h-4 w-4 text-[#E88A7E]" aria-hidden="true" />
            </div>
            <p className="mt-2 font-[var(--font-display)] text-3xl font-extrabold text-[#E9E5DC] tabular-nums">
              {slaReport.breachingWorkflows.length}
            </p>
            <span className="mt-1 block text-[11px] text-[#B5AA99] tabular-nums">
              {slaReport.healthyWorkflows}/{slaReport.totalWorkflows} workflows healthy · {slaReport.activeCriticalIncidents} critical open
            </span>
          </div>
        </div>
      )}

      {/* Breaching Workflows & Editable SLA Policy */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#383838] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[#E9E5DC]">SLA Breach Monitor</h3>
              <p className="text-xs text-[#B5AA99]">Workflows currently degraded or crossing failure budgets</p>
            </div>
            <span className="font-mono text-xs text-[#B5AA99] tabular-nums">
              {slaReport?.breachingWorkflows.length || 0} flagged
            </span>
          </div>

          {!slaReport || slaReport.breachingWorkflows.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#B5AA99]">
              All monitored workflows are operating within your workspace SLA target.
            </div>
          ) : (
            <div className="space-y-2.5">
              {slaReport.breachingWorkflows.map((wf) => (
                <div
                  key={wf.workflowId}
                  className="rounded-lg border border-[#383838] bg-[#171717] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#E9E5DC]">{wf.workflowName}</span>
                      <StatusBadge
                        label={wf.healthStatus}
                        tone={wf.healthStatus === 'FAILING' ? 'error' : 'warning'}
                      />
                    </div>
                    <p className="text-[11px] text-[#B5AA99] mt-0.5">
                      {wf.clientName} · {wf.reason}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-[#E88A7E] tabular-nums whitespace-nowrap shrink-0">
                    {wf.consecutiveFailures} consecutive failure(s)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-xl border border-[#383838] bg-[#202020] p-5">
          <h3 className="text-sm font-bold text-[#E9E5DC]">SLA Target Policy</h3>
          <p className="text-xs text-[#B5AA99] mt-0.5 mb-4">
            Workspace-wide SLO thresholds used for compliance reporting and SLA breach rules
          </p>

          <form onSubmit={handleSavePolicy} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sla-target-rate" className="block font-semibold text-[#E9E5DC] mb-1">
                  Target Success (%)
                </label>
                <input
                  id="sla-target-rate"
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
                <label htmlFor="sla-target-mttr" className="block font-semibold text-[#E9E5DC] mb-1">
                  Target MTTR (mins)
                </label>
                <input
                  id="sla-target-mttr"
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
                <label htmlFor="sla-max-critical" className="block font-semibold text-[#E9E5DC] mb-1">
                  Max Open Critical
                </label>
                <input
                  id="sla-max-critical"
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
                <label htmlFor="sla-window-hours" className="block font-semibold text-[#E9E5DC] mb-1">
                  Window (hours)
                </label>
                <input
                  id="sla-window-hours"
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
                disabled={savingPolicy}
                className="w-full rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-50 py-2 text-xs font-semibold text-[#E9E5DC]"
              >
                {savingPolicy ? 'Saving SLA Targets...' : 'Save SLA Targets'}
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
            <h3 className="text-sm font-bold text-[#E9E5DC]">Outbound Alert Routing Channels</h3>
            <p className="text-xs text-[#B5AA99]">
              Signed webhooks (HMAC-SHA256), Slack, Discord, PagerDuty &amp; Email digests. Secrets are masked after save.
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
          <form onSubmit={handleCreateChannel} className="rounded-lg border border-[#383838] bg-[#171717] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label htmlFor="ch-name" className="block font-semibold text-[#E9E5DC] mb-1">Channel Name</label>
              <input
                id="ch-name"
                type="text"
                required
                value={chName}
                onChange={(e) => setChName(e.target.value)}
                placeholder="On-Call Slack Channel"
                className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC]"
              />
            </div>

            <div>
              <label htmlFor="ch-type" className="block font-semibold text-[#E9E5DC] mb-1">Channel Type</label>
              <select
                id="ch-type"
                value={chType}
                onChange={(e) => setChType(e.target.value as AlertChannelType)}
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
              <label htmlFor="ch-target" className="block font-semibold text-[#E9E5DC] mb-1">
                {chType === 'EMAIL_DIGEST' ? 'Recipient Email' : 'Webhook Target URL'}
              </label>
              <input
                id="ch-target"
                type={chType === 'EMAIL_DIGEST' ? 'email' : 'url'}
                required
                value={chTargetUrl}
                onChange={(e) => setChTargetUrl(e.target.value)}
                placeholder={chType === 'EMAIL_DIGEST' ? 'oncall@company.com' : 'https://hooks.slack.com/services/...'}
                className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC]"
              />
            </div>

            <div>
              <label htmlFor="ch-severity" className="block font-semibold text-[#E9E5DC] mb-1">Min Severity</label>
              <div className="flex gap-2">
                <select
                  id="ch-severity"
                  value={chSeverity}
                  onChange={(e) => setChSeverity(e.target.value as Severity)}
                  className="flex-1 rounded-md border border-[#383838] bg-[#202020] px-2.5 py-2 text-[#E9E5DC]"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
                <button
                  type="submit"
                  disabled={creatingChannel}
                  className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-50 px-3.5 py-2 font-semibold text-[#E9E5DC]"
                >
                  {creatingChannel ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        )}

        {channels.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#B5AA99]">
            No outbound alert channels configured yet. Add Slack, Discord, email digest, or custom webhook endpoints above.
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((ch) => (
              <div
                key={ch.id}
                className="rounded-lg border border-[#383838] bg-[#171717] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#E9E5DC] text-sm">{ch.name}</span>
                    <StatusBadge label={ch.channelType} tone="neutral" />
                    <StatusBadge label={`MIN: ${ch.minSeverity}`} tone="warning" />
                    {ch.lastDeliveryStatus && (
                      <StatusBadge
                        label={ch.lastDeliveryStatus}
                        tone={
                          ch.lastDeliveryStatus === 'DELIVERED'
                            ? 'success'
                            : ch.lastDeliveryStatus === 'FAILED'
                            ? 'error'
                            : 'warning'
                        }
                      />
                    )}
                  </div>
                  <p className="font-mono text-[11px] text-[#B5AA99]">
                    Target: {ch.targetPreview} {ch.signingSecretPreview ? `· Secret: ${ch.signingSecretPreview}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canWrite && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleToggleChannel(ch)}
                        aria-label={`Toggle ${ch.name}`}
                        className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${
                          ch.isEnabled
                            ? 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]'
                            : 'border-[#383838] bg-[#202020] text-[#B5AA99]'
                        }`}
                      >
                        {ch.isEnabled ? 'Enabled' : 'Paused'}
                      </button>

                      <button
                        type="button"
                        disabled={testingChannelId === ch.id}
                        onClick={() => void handleTestChannel(ch)}
                        aria-label={`Send test alert to ${ch.name}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#544021] bg-[#211D10] hover:border-[#C52A18] disabled:opacity-50 px-3 py-1.5 text-[11px] font-semibold text-[#E9E5DC]"
                      >
                        <Send className="h-3 w-3 text-[#C52A18]" aria-hidden="true" />
                        <span>{testingChannelId === ch.id ? 'Sending...' : 'Test Alert'}</span>
                      </button>
                    </>
                  )}

                  {canAdmin && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteChannel(ch)}
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

      {/* Reliability & Guardrail Rules */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#383838] pb-3">
          <div>
            <h3 className="text-sm font-bold text-[#E9E5DC]">Automated Reliability &amp; Escalation Rules</h3>
            <p className="text-xs text-[#B5AA99]">
              Trigger outbound notifications or incident severity escalations automatically when thresholds trip
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowRuleForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-3 py-1.5 text-xs font-semibold text-[#E9E5DC]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showRuleForm ? 'Cancel' : 'Add Guardrail Rule'}</span>
            </button>
          )}
        </div>

        {showRuleForm && (
          <form onSubmit={handleCreateRule} className="rounded-lg border border-[#383838] bg-[#171717] p-4 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label htmlFor="rule-name" className="block font-semibold text-[#E9E5DC] mb-1">Rule Name</label>
                <input
                  id="rule-name"
                  type="text"
                  required
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="High Failure Rate Guardrail"
                  className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC]"
                />
              </div>

              <div>
                <label htmlFor="rule-condition" className="block font-semibold text-[#E9E5DC] mb-1">Condition</label>
                <select
                  id="rule-condition"
                  value={ruleCondition}
                  onChange={(e) => setRuleCondition(e.target.value as ReliabilityRuleCondition)}
                  className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC]"
                >
                  <option value="CONSECUTIVE_FAILURES">Consecutive Failures (&ge; N runs)</option>
                  <option value="FAILURE_RATE_SPIKE">Failure Rate Spike (&ge; N%)</option>
                  <option value="CRITICAL_INCIDENT_OPEN">High/Critical Incident Open (&ge; N mins)</option>
                  <option value="SLA_BREACH">Workspace SLA Breach (&lt; N% success)</option>
                </select>
              </div>

              <div>
                <label htmlFor="rule-threshold" className="block font-semibold text-[#E9E5DC] mb-1">Threshold</label>
                <input
                  id="rule-threshold"
                  type="number"
                  min="0"
                  required
                  value={ruleThreshold}
                  onChange={(e) => setRuleThreshold(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC] tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="rule-severity" className="block font-semibold text-[#E9E5DC] mb-1">Alert Severity</label>
                <select
                  id="rule-severity"
                  value={ruleSeverity}
                  onChange={(e) => setRuleSeverity(e.target.value as Severity)}
                  className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC]"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>

              <div>
                <label htmlFor="rule-action" className="block font-semibold text-[#E9E5DC] mb-1">Action</label>
                <select
                  id="rule-action"
                  value={ruleAction}
                  onChange={(e) => setRuleAction(e.target.value as ReliabilityRuleAction)}
                  className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-[#E9E5DC]"
                >
                  <option value="NOTIFY_CHANNELS">Dispatch Channel Alerts</option>
                  <option value="ESCALATE_SEVERITY">Escalate Incident Severity + Alert</option>
                  <option value="OPEN_RECOVERY_REQUEST">Flag Recovery Gate + Alert</option>
                </select>
              </div>

              <div>
                <label htmlFor="rule-cooldown" className="block font-semibold text-[#E9E5DC] mb-1">Cooldown (mins)</label>
                <input
                  id="rule-cooldown"
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
                <span className="block font-semibold text-[#E9E5DC] mb-1.5">Target Channels (leave empty to broadcast to all matching channels)</span>
                <div className="flex flex-wrap gap-2">
                  {channels.map((c) => {
                    const selected = ruleChannelIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleRuleChannelSelection(c.id)}
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

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creatingRule}
                className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-50 px-4 py-2 font-semibold text-[#E9E5DC]"
              >
                {creatingRule ? 'Creating Rule...' : 'Save Guardrail Rule'}
              </button>
            </div>
          </form>
        )}

        {rules.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#B5AA99]">
            No automated guardrail rules configured yet. Add a rule above to evaluate execution health and trigger routed alerts.
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
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
                      {rule.conditionType} (&ge; {rule.thresholdValue})
                    </span>
                  </div>
                  <p className="text-[11px] text-[#B5AA99]">
                    Action: {rule.actionType} · Cooldown: {rule.cooldownMinutes}m · Triggers: {rule.triggerCount}
                    {rule.lastTriggeredAt ? ` · Last triggered ${formatInTimezone(rule.lastTriggeredAt, timezone)}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => void handleToggleRule(rule)}
                      aria-label={`Toggle rule ${rule.name}`}
                      className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${
                        rule.isEnabled
                          ? 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]'
                          : 'border-[#383838] bg-[#202020] text-[#B5AA99]'
                      }`}
                    >
                      {rule.isEnabled ? 'Active' : 'Paused'}
                    </button>
                  )}
                  {canAdmin && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteRule(rule)}
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
            <h3 className="text-sm font-bold text-[#E9E5DC]">Outbound Alert Delivery History</h3>
          </div>
          <span className="font-mono text-xs text-[#B5AA99] tabular-nums">{deliveries.length} events</span>
        </div>

        {deliveries.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#B5AA99]">
            No outbound alerts dispatched yet. Click &quot;Test Alert&quot; on any channel or run guardrail evaluation.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#383838] text-[11px] uppercase tracking-wider text-[#B5AA99]">
                  <th className="py-2 pr-3">Channel</th>
                  <th className="py-2 pr-3">Event &amp; Message</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Signature</th>
                  <th className="py-2">Delivered ({timezone})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#383838]">
                {deliveries.map((d) => (
                  <tr key={d.id} className="align-top">
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-[#E9E5DC]">{d.channelName}</div>
                      <div className="font-mono text-[11px] text-[#B5AA99]">{d.channelType}</div>
                    </td>
                    <td className="py-3 pr-3 max-w-md">
                      <div className="font-medium text-[#E9E5DC]">{d.title}</div>
                      <div className="text-[11px] text-[#B5AA99] mt-0.5">{d.responseSummary}</div>
                    </td>
                    <td className="py-3 pr-3">
                      <StatusBadge
                        label={d.httpStatus ? `${d.status} (${d.httpStatus})` : d.status}
                        tone={d.status === 'DELIVERED' ? 'success' : d.status === 'FAILED' ? 'error' : 'warning'}
                      />
                    </td>
                    <td className="py-3 pr-3 font-mono text-[11px] text-[#B5AA99]">
                      {d.signatureHeader || 'signed'}
                    </td>
                    <td className="py-3 font-mono text-[11px] text-[#B5AA99] tabular-nums whitespace-nowrap">
                      {formatInTimezone(d.deliveredAt, timezone)}
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
};

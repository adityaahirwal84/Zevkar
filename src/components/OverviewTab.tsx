import React from 'react';
import {
  CheckCircle2,
  Circle,
  ArrowUpRight,
  Zap,
  Bot,
  Activity,
  BookOpen,
  Plug,
  Users,
} from 'lucide-react';
import {
  Agency,
  AuditLogItem,
  DashboardStats,
  Execution,
  Incident,
  Client,
  Integration,
  NotificationPreferenceItem,
  OnboardingState,
  Workflow,
  ApprovalRequest,
} from '../types';
import { formatInTimezone, sortByTimestampDesc } from '../lib/datetime';
import { computeGettingStartedChecklist } from '../lib/onboarding';
import { AppRoute } from '../lib/router';
import { IncidentCard } from './dashboard/IncidentCard';
import { StatusBadge } from './marketing/StatusBadge';

interface OverviewTabProps {
  stats: DashboardStats;
  incidents: Incident[];
  clients: Client[];
  workflows: Workflow[];
  integrations?: Integration[];
  executions?: Execution[];
  approvals?: ApprovalRequest[];
  agency?: Agency;
  onboardingState?: OnboardingState | null;
  notificationPreferences?: NotificationPreferenceItem[];
  auditLogs?: AuditLogItem[];
  timezone?: string;
  onSelectIncident: (incident: Incident) => void;
  onOpenDiagnosis: (incident: Incident) => void;
  onNavigateToTab: (tab: any) => void;
  onResumeOnboarding?: () => void;
  onOpenRoute?: (route: AppRoute) => void;
  onTriggerSimulatedWebhook: () => void;
  isSimulating: boolean;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  stats,
  incidents,
  clients,
  workflows,
  integrations = [],
  executions = [],
  approvals = [],
  agency,
  onboardingState,
  notificationPreferences = [],
  auditLogs = [],
  timezone = 'UTC',
  onSelectIncident,
  onOpenDiagnosis,
  onNavigateToTab,
  onResumeOnboarding,
  onOpenRoute,
  onTriggerSimulatedWebhook,
  isSimulating,
}) => {
  const activeIncidents = sortByTimestampDesc(
    incidents.filter((i) => i.status !== 'RESOLVED' && i.status !== 'IGNORED'),
    (i) => i.lastDetectedAt
  );
  const nextPendingApproval = approvals.find((a) => a.status === 'PENDING');

  const isOnboardingIncomplete = Boolean(
    (onboardingState && !onboardingState.completed) ||
      (agency && agency.onboardingCompleted === false)
  );
  const currentOnboardingStep =
    onboardingState?.currentStep || agency?.onboardingStep || 1;

  const checklist = computeGettingStartedChecklist({
    onboardingState,
    clients,
    integrations,
    workflows,
    executions,
    incidents,
    notificationPreferences,
  });

  const hasAnyConnectedRuntime =
    workflows.length > 0 || integrations.length > 0 || executions.length > 0;
  const recentAudit = sortByTimestampDesc(auditLogs, (log) => log.createdAt).slice(0, 6);

  return (
    <div className="space-y-6">
      {isOnboardingIncomplete && (
        <div className="rounded-xl border border-[#544021] bg-[#211D10] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <StatusBadge
                label={`SETUP STEP ${currentOnboardingStep}/8`}
                tone="warning"
                withIcon
              />
              <span className="text-xs font-mono text-[#B5AA99]">
                {agency?.name || 'Workspace Setup'}
              </span>
            </div>
            <h2 className="font-[var(--font-display)] text-base font-bold text-[#E9E5DC]">
              Finish onboarding your automation workspace
            </h2>
            <p className="text-xs text-[#B5AA99]">
              Your saved setup state is preserved at step {currentOnboardingStep} of 8. Resume to configure your client, connector, and initial sync.
            </p>
          </div>
          {onResumeOnboarding && (
            <button
              type="button"
              onClick={onResumeOnboarding}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors shrink-0"
            >
              <span>Resume Setup ({currentOnboardingStep}/8)</span>
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Top Banner with Health Score & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-[#383838] bg-[#202020] p-6 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={hasAnyConnectedRuntime ? 'TELEMETRY LIVE' : 'AWAITING CONNECTOR'}
                  tone={hasAnyConnectedRuntime ? 'success' : 'warning'}
                  withIcon
                />
                <span className="text-xs text-[#B5AA99]">Display TZ: {timezone}</span>
              </div>
              <h1 className="font-[var(--font-display)] text-2xl font-bold tracking-tight text-[#E9E5DC]">
                Automation Fleet Health
              </h1>
              <p className="text-xs text-[#B5AA99] max-w-xl leading-relaxed">
                Monitoring {stats.totalWorkflows} workflows across {stats.totalClients} clients.{' '}
                {stats.activeIncidentsCount} active incident(s) require triage and{' '}
                {stats.pendingApprovalsCount} recovery approval(s) await review.
              </p>
            </div>

            <div className="rounded-xl border border-[#383838] bg-[#171717] px-5 py-4 shrink-0 text-center">
              <div className="text-[11px] font-medium uppercase tracking-wider text-[#B5AA99]">
                Health Score
              </div>
              <div className="mt-1 font-[var(--font-display)] text-3xl font-extrabold text-[#E9E5DC] tabular-nums">
                {stats.overallHealthScore}%
              </div>
              <div className="mt-0.5 text-[11px] font-mono text-[#8CC59B] tabular-nums">
                MTTR {stats.meanTimeToRecoveryMinutes}m
              </div>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-[#383838] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onTriggerSimulatedWebhook}
                disabled={isSimulating}
                className="inline-flex items-center gap-2 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors disabled:opacity-50"
              >
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isSimulating ? 'Simulating Webhook...' : 'Simulate n8n Failure Event'}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateToTab('assistant')}
                className="inline-flex items-center gap-2 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
              >
                <Bot className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
                <span>Ask Zevkar</span>
              </button>
            </div>

            <div className="text-xs text-[#B5AA99] tabular-nums">
              Estimated value at risk:{' '}
              <strong className="font-mono text-[#E2B066]">
                ${stats.estimatedRevenueAtRisk.toLocaleString()}
              </strong>
            </div>
          </div>
        </div>

        {/* Pending Approvals Card (Live State) */}
        <div className="rounded-xl border border-[#544021] bg-[#211D10] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#B5AA99]">
                Action Required
              </span>
              <StatusBadge
                label={`${stats.pendingApprovalsCount} Pending`}
                tone={stats.pendingApprovalsCount > 0 ? 'warning' : 'success'}
                withIcon
              />
            </div>
            <h2 className="mt-2 font-[var(--font-display)] text-lg font-bold text-[#E9E5DC]">
              Human Approval Gate
            </h2>
            <p className="mt-1 text-xs text-[#B5AA99] leading-relaxed">
              High-impact financial and customer-facing retries stay quarantined until authorized by an admin.
            </p>
          </div>

          {nextPendingApproval ? (
            <div className="mt-4 rounded-lg border border-[#383838] bg-[#171717] p-3.5">
              <p className="text-xs font-semibold text-[#E9E5DC] truncate">{nextPendingApproval.incidentTitle}</p>
              <p className="text-[11px] text-[#E2B066] mt-0.5 line-clamp-1">{nextPendingApproval.proposedAction}</p>
              <button
                type="button"
                onClick={() => onNavigateToTab('approvals')}
                className="mt-3 w-full rounded-md bg-[#A51B0B] hover:bg-[#C52A18] py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
              >
                Review &amp; Authorize
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-[#383838] bg-[#171717] p-3.5 text-center">
              <p className="text-xs font-semibold text-[#8CC59B]">Queue Clear</p>
              <p className="text-[11px] text-[#B5AA99] mt-0.5">No pending human authorizations.</p>
            </div>
          )}
        </div>
      </div>

      {/* Getting Started Activation Checklist */}
      {checklist.progressPercent < 100 && (
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#383838]">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-[var(--font-display)] text-base font-bold text-[#E9E5DC]">
                  Getting Started Checklist
                </h2>
                <span className="rounded bg-[#171717] border border-[#383838] px-2 py-0.5 font-mono text-[11px] text-[#E9E5DC] tabular-nums">
                  {checklist.completedCount}/{checklist.totalCount} · {checklist.progressPercent}%
                </span>
              </div>
              <p className="text-xs text-[#B5AA99] mt-0.5">
                Complete these activation milestones to enable automated monitoring, AI diagnosis, and guarded recovery.
              </p>
            </div>

            {onOpenRoute && (
              <button
                type="button"
                onClick={() => onOpenRoute('/docs')}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-3 py-1.5 text-xs font-semibold text-[#E9E5DC] transition-colors shrink-0"
              >
                <BookOpen className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
                <span>Setup Docs</span>
              </button>
            )}
          </div>

          <div className="mt-3 h-1.5 w-full rounded bg-[#171717] overflow-hidden">
            <div
              className="h-full bg-[#A51B0B] transition-all duration-300"
              style={{ width: `${checklist.progressPercent}%` }}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {checklist.items.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg border p-3.5 flex flex-col justify-between gap-3 ${
                  item.completed
                    ? 'border-[#2E4A36] bg-[#171E19]'
                    : 'border-[#383838] bg-[#171717]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {item.completed ? (
                    <CheckCircle2 className="h-4 w-4 text-[#8CC59B] shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <Circle className="h-4 w-4 text-[#B5AA99] shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#E9E5DC]">{item.title}</p>
                    <p className="text-[11px] text-[#B5AA99] mt-0.5 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>

                {item.targetTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateToTab(item.targetTab)}
                    className={`self-start inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      item.completed
                        ? 'text-[#8CC59B] hover:text-[#E9E5DC]'
                        : 'bg-[#202020] border border-[#383838] text-[#E9E5DC] hover:border-[#C52A18]'
                    }`}
                  >
                    <span>{item.actionLabel}</span>
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-4">
          <p className="text-xs text-[#B5AA99]">Total Clients</p>
          <p className="mt-1.5 font-[var(--font-display)] text-2xl font-bold text-[#E9E5DC] tabular-nums">
            {stats.totalClients}
          </p>
          <span className="mt-1 block text-[11px] text-[#8CC59B]">Isolated portfolios</span>
        </div>

        <div className="rounded-xl border border-[#383838] bg-[#202020] p-4">
          <p className="text-xs text-[#B5AA99]">Workflows</p>
          <p className="mt-1.5 font-[var(--font-display)] text-2xl font-bold text-[#E9E5DC] tabular-nums">
            {stats.totalWorkflows}
          </p>
          <span className="mt-1 block text-[11px] text-[#B5AA99]">Connected clusters</span>
        </div>

        <div className="rounded-xl border border-[#383838] bg-[#202020] p-4">
          <p className="text-xs text-[#B5AA99]">24h Executions</p>
          <p className="mt-1.5 font-[var(--font-display)] text-2xl font-bold text-[#E9E5DC] tabular-nums">
            {(stats.successfulExecutions24h + stats.failedExecutions24h).toLocaleString()}
          </p>
          <span className="mt-1 block text-[11px] text-[#8CC59B] tabular-nums">
            {stats.workflowSuccessRate}% success
          </span>
        </div>

        <div className="rounded-xl border border-[#383838] bg-[#202020] p-4">
          <p className="text-xs text-[#B5AA99]">Active Incidents</p>
          <p className="mt-1.5 font-[var(--font-display)] text-2xl font-bold text-[#E88A7E] tabular-nums">
            {stats.activeIncidentsCount}
          </p>
          <span className="mt-1 block text-[11px] text-[#B5AA99]">Needs triage</span>
        </div>

        <div className="rounded-xl border border-[#383838] bg-[#202020] p-4">
          <p className="text-xs text-[#B5AA99]">Recovery Rate</p>
          <p className="mt-1.5 font-[var(--font-display)] text-2xl font-bold text-[#E9E5DC] tabular-nums">
            {stats.recoverySuccessRate}%
          </p>
          <span className="mt-1 block text-[11px] text-[#B5AA99]">Idempotent retries</span>
        </div>

        <div className="rounded-xl border border-[#383838] bg-[#202020] p-4">
          <p className="text-xs text-[#B5AA99]">Mean Recovery</p>
          <p className="mt-1.5 font-[var(--font-display)] text-2xl font-bold text-[#E9E5DC] tabular-nums">
            {stats.meanTimeToRecoveryMinutes}m
          </p>
          <span className="mt-1 block text-[11px] text-[#B5AA99]">Across fleet</span>
        </div>
      </div>

      {/* Main Grid: Active Incidents & Client Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-[#383838] bg-[#202020] p-6">
          <div className="flex items-center justify-between pb-4 border-b border-[#383838]">
            <div>
              <h2 className="font-[var(--font-display)] text-base font-bold text-[#E9E5DC]">
                Active Incident Priority Queue
              </h2>
              <p className="text-xs text-[#B5AA99]">Failures captured by monitoring hooks</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToTab('incidents')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#E9E5DC] hover:text-[#C52A18]"
            >
              <span>View all</span>
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {activeIncidents.length === 0 ? (
              !hasAnyConnectedRuntime ? (
                <div className="py-10 text-center space-y-3">
                  <Plug className="h-9 w-9 text-[#E2B066] mx-auto" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-[#E9E5DC]">No Automations Connected Yet</p>
                    <p className="text-xs text-[#B5AA99] max-w-md mx-auto mt-1">
                      Connect your n8n instance, webhook listener, or simulate a failure event to populate telemetry and incident triage.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onNavigateToTab('integrations')}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
                    >
                      <Plug className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Connect Platform</span>
                    </button>
                    <button
                      type="button"
                      onClick={onTriggerSimulatedWebhook}
                      disabled={isSimulating}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors disabled:opacity-50"
                    >
                      <Zap className="h-3.5 w-3.5 text-[#E2B066]" aria-hidden="true" />
                      <span>Simulate Test Event</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center space-y-2">
                  <CheckCircle2 className="h-9 w-9 text-[#8CC59B] mx-auto" aria-hidden="true" />
                  <p className="text-sm font-semibold text-[#E9E5DC]">All Automations Healthy</p>
                  <p className="text-xs text-[#B5AA99]">No active incidents detected.</p>
                </div>
              )
            ) : (
              activeIncidents.map((inc) => (
                <IncidentCard
                  key={inc.id}
                  incident={inc}
                  timezone={timezone}
                  onSelect={onSelectIncident}
                  onOpenDiagnosis={onOpenDiagnosis}
                  onExecuteRecovery={() => onNavigateToTab('recovery')}
                />
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[#383838] bg-[#202020] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#383838]">
              <h2 className="font-[var(--font-display)] text-base font-bold text-[#E9E5DC]">
                Client Portfolio Health
              </h2>
              <button
                type="button"
                onClick={() => onNavigateToTab('clients')}
                className="text-xs font-semibold text-[#E9E5DC] hover:text-[#C52A18]"
              >
                Manage
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {clients.length === 0 ? (
                <div className="rounded-lg border border-[#383838] bg-[#171717] p-6 text-center space-y-2">
                  <Users className="h-6 w-6 text-[#B5AA99] mx-auto" aria-hidden="true" />
                  <p className="text-xs font-semibold text-[#E9E5DC]">No clients configured</p>
                  <p className="text-[11px] text-[#B5AA99]">
                    Create your first client or internal project to organize workflows.
                  </p>
                </div>
              ) : (
                clients.map((client) => (
                  <div
                    key={client.id}
                    className="rounded-lg border border-[#383838] bg-[#171717] p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#E9E5DC] truncate">{client.name}</p>
                      <p className="text-[11px] text-[#B5AA99] truncate">{client.industry}</p>
                      <span className="text-[10px] text-[#B5AA99]/75 tabular-nums">
                        {client.monitoredWorkflowsCount} workflows
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`font-mono text-sm font-bold tabular-nums ${
                          client.healthScore >= 90
                            ? 'text-[#8CC59B]'
                            : client.healthScore >= 70
                            ? 'text-[#E2B066]'
                            : 'text-[#E88A7E]'
                        }`}
                      >
                        {client.healthScore}%
                      </span>
                      <p className="text-[10px] text-[#B5AA99]">
                        {client.activeIncidentsCount > 0 ? `${client.activeIncidentsCount} active` : 'Operational'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#383838] text-center">
            <button
              type="button"
              onClick={() => onNavigateToTab('clients')}
              className="text-xs font-semibold text-[#E9E5DC] hover:text-[#C52A18]"
            >
              + Add New Client
            </button>
          </div>
        </div>
      </div>

      {/* Recent Workspace Activity */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#383838]">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
            <h2 className="font-[var(--font-display)] text-base font-bold text-[#E9E5DC]">
              Recent Workspace Activity
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToTab('audit')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#E9E5DC] hover:text-[#C52A18]"
          >
            <span>Audit Log</span>
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {recentAudit.length === 0 ? (
          <p className="py-6 text-center text-xs text-[#B5AA99]">
            Workspace activity will appear here as you configure integrations, triage incidents, and invite teammates.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-[#383838]">
            {recentAudit.map((entry) => (
              <div
                key={entry.id}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-mono text-[11px] text-[#E2B066] mr-2">
                    {entry.action}
                  </span>
                  <span className="text-[#E9E5DC]">{entry.details}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[#B5AA99] shrink-0">
                  <span>{entry.actorName}</span>
                  <span className="font-mono tabular-nums">
                    {formatInTimezone(entry.createdAt, timezone, 'datetime')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

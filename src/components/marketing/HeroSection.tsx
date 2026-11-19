import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Stethoscope,
  RotateCcw,
} from 'lucide-react';
import { AppRoute, resolveCtaRoute } from '../../lib/router';
import { useAuth } from '../../context/AuthContext';
import { DashboardStats, Incident } from '../../types';

interface HeroSectionProps {
  onNavigate: (route: AppRoute) => void;
}

const DEFAULT_HERO_STATS: DashboardStats = {
  totalClients: 4,
  totalIntegrations: 4,
  totalWorkflows: 12,
  successfulExecutions24h: 4280,
  failedExecutions24h: 20,
  activeIncidentsCount: 2,
  pendingApprovalsCount: 1,
  recoverySuccessRate: 92.5,
  workflowSuccessRate: 99.5,
  overallHealthScore: 88,
  meanTimeToRecoveryMinutes: 4.8,
  estimatedRevenueAtRisk: 18400,
};

export const HeroSection: React.FC<HeroSectionProps> = ({ onNavigate }) => {
  const { isAuthenticated, userRole } = useAuth();
  const [selectedSample, setSelectedSample] = useState<'diagnosis' | 'recovery'>('diagnosis');
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_HERO_STATS);
  const [featuredIncident, setFeaturedIncident] = useState<Incident | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/v1/analytics/overview').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/v1/incidents').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([statsData, incidentsData]) => {
        if (!active) return;
        if (statsData && typeof statsData.overallHealthScore === 'number') {
          setStats(statsData);
        }
        if (Array.isArray(incidentsData) && incidentsData.length > 0) {
          const openFirst = incidentsData.find((i) => i.status !== 'RESOLVED') || incidentsData[0];
          setFeaturedIncident(openFirst);
        }
      })
      .catch(() => {
        // Keep baseline telemetry structure if backend is temporarily unreachable
      });
    return () => {
      active = false;
    };
  }, []);

  const incidentTitle =
    featuredIncident?.workflowName || 'Stripe Settlement Webhook -> NetSuite Invoice Sync';
  const incidentError =
    featuredIncident?.errorMessage ||
    'HTTP 401 Unauthorized: Restricted API key revoked before settlement batch.';
  const incidentId = featuredIncident?.id || 'inc_8041';
  const incidentOccurrences = featuredIncident?.occurrenceCount ?? 4;
  const diagnosisSummary =
    featuredIncident?.aiDiagnosis?.simpleExplanation ||
    'The Stripe restricted credential expired before invoice generation ran, blocking downstream NetSuite writes.';
  const diagnosisAction =
    featuredIncident?.aiDiagnosis?.recommendedActions?.[0] ||
    'Rotate credential in vault and update n8n Credential #41 before replay.';
  const recoverySuggestion =
    featuredIncident?.aiDiagnosis?.suggestedRecovery ||
    'Create a governed recovery request with SHA-256 idempotency verification after operator sign-off.';
  const recoveryStatusLabel =
    featuredIncident?.status === 'APPROVAL_REQUIRED'
      ? 'APPROVAL GATE'
      : featuredIncident?.status || 'APPROVAL GATE';

  return (
    <section className="border-b border-[#363125] bg-[#211D10] py-16 md:py-24">
      <div className="mx-auto max-w-[1320px] px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Editorial Column */}
          <div className="lg:col-span-6 space-y-6">
            <div className="text-xs font-semibold tracking-wider uppercase text-[#C52A18]">
              Zevkar · Automation Monitoring, Diagnosis &amp; Recovery Platform
            </div>

            <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight text-[#F0E9D9] leading-[1.08]">
              Keep Business Automations Running with Zevkar.
            </h1>

            <p className="text-base sm:text-lg text-[#B8AE9B] leading-relaxed max-w-xl">
              Monitor, diagnose, and recover your business automations before failures impact your operations.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => onNavigate(resolveCtaRoute(isAuthenticated, userRole, '/signup'))}
                className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-6 py-3 text-sm font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap shrink-0"
              >
                <span>{isAuthenticated ? 'Open Console' : 'Start Free'}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('/product')}
                className="inline-flex items-center gap-2 rounded-md border border-[#363125] bg-[#171A1B] hover:border-[#B8AE9B] px-6 py-3 text-sm font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap shrink-0"
              >
                <span>Explore Product</span>
              </button>
            </div>

            <div className="pt-4 border-t border-[#363125] grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-x-5 gap-y-1.5 text-xs text-[#B8AE9B]">
              <span>n8n Sync &amp; Retries</span>
              <span className="hidden sm:inline" aria-hidden="true">·</span>
              <span>Python &amp; FastAPI Webhooks</span>
              <span className="hidden sm:inline" aria-hidden="true">·</span>
              <span>Human Approval Gates</span>
            </div>
          </div>

          {/* Right Live Telemetry Preview Panel */}
          <div className="lg:col-span-6">
            <div className="rounded-xl border border-[#363125] bg-[#171A1B] overflow-hidden shadow-2xl shadow-black/40">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-b border-[#363125] bg-[#202326] px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-medium text-[#F0E9D9]">
                  <span>Telemetry Console Preview</span>
                  <span className="text-[#B8AE9B]" aria-hidden="true">·</span>
                  <span className="font-mono text-[#B8AE9B]">{incidentId}</span>
                </div>
                <div className="flex items-center gap-1 rounded-md border border-[#363125] bg-[#211D10] p-0.5">
                  <button
                    type="button"
                    onClick={() => setSelectedSample('diagnosis')}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      selectedSample === 'diagnosis'
                        ? 'bg-[#202326] text-[#F0E9D9]'
                        : 'text-[#B8AE9B] hover:text-[#F0E9D9]'
                    }`}
                  >
                    AI Diagnosis
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSample('recovery')}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      selectedSample === 'recovery'
                        ? 'bg-[#202326] text-[#F0E9D9]'
                        : 'text-[#B8AE9B] hover:text-[#F0E9D9]'
                    }`}
                  >
                    Recovery Engine
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="rounded-lg border border-[#363125] bg-[#211D10] p-3">
                    <div className="text-[#B8AE9B]">Workflow health</div>
                    <div className="mt-1 font-mono text-base font-bold text-[#8CC59B] tabular-nums">
                      {stats.overallHealthScore}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#363125] bg-[#211D10] p-3">
                    <div className="text-[#B8AE9B]">Active connections</div>
                    <div className="mt-1 font-mono text-base font-bold text-[#F0E9D9] tabular-nums">
                      {stats.totalIntegrations}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#363125] bg-[#211D10] p-3">
                    <div className="text-[#B8AE9B]">Healthy runs (24h)</div>
                    <div className="mt-1 font-mono text-base font-bold text-[#F0E9D9] tabular-nums">
                      {stats.successfulExecutions24h.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#363125] bg-[#211D10] p-3">
                    <div className="text-[#B8AE9B]">Failed runs (24h)</div>
                    <div className="mt-1 font-mono text-base font-bold text-[#E88A7E] tabular-nums">
                      {stats.failedExecutions24h}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#363125] bg-[#211D10] p-3">
                    <div className="text-[#B8AE9B]">Open incidents</div>
                    <div className="mt-1 font-mono text-base font-bold text-[#E2B066] tabular-nums">
                      {stats.activeIncidentsCount}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#363125] bg-[#211D10] p-3">
                    <div className="text-[#B8AE9B]">Recovery gate</div>
                    <div className="mt-1.5 font-mono text-xs font-bold tracking-wide text-[#E2B066] uppercase">
                      {recoveryStatusLabel}
                    </div>
                  </div>
                </div>

                {/* Active Incident Signal */}
                <div className="rounded-lg border border-[#61231C] bg-[#211D10] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#F0E9D9] min-w-0">
                      <AlertTriangle className="h-4 w-4 text-[#C52A18] shrink-0" aria-hidden="true" />
                      <span className="truncate">{incidentTitle}</span>
                    </div>
                    <span className="font-mono text-[11px] text-[#B8AE9B] tabular-nums shrink-0">
                      {incidentOccurrences}x events
                    </span>
                  </div>
                  <div className="rounded border border-[#363125] bg-[#171A1B] px-3 py-2 font-mono text-[11px] text-[#E88A7E] overflow-x-auto">
                    {incidentError}
                  </div>
                </div>

                {selectedSample === 'diagnosis' ? (
                  <div className="space-y-3 rounded-lg border border-[#363125] bg-[#202326] p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#F0E9D9]">
                        <Stethoscope className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                        <span>AI Diagnosis Summary</span>
                      </div>
                      <span className="font-mono text-xs text-[#8CC59B] tabular-nums">
                        {Math.round((featuredIncident?.aiDiagnosis?.confidence ?? 0.96) * 100)}% confidence
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-[#F0E9D9]">
                      {diagnosisSummary}
                    </p>
                    <div className="pt-2 border-t border-[#363125] text-xs text-[#B8AE9B] space-y-1.5">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#8CC59B] shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{diagnosisAction}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <ShieldCheck className="h-3.5 w-3.5 text-[#E2B066] shrink-0 mt-0.5" aria-hidden="true" />
                        <span>Financial or high-risk recoveries pause for operator sign-off.</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-lg border border-[#363125] bg-[#202326] p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#F0E9D9]">
                        <RotateCcw className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                        <span>Governed Recovery Pipeline</span>
                      </div>
                      <span className="font-mono text-[11px] text-[#B8AE9B]">
                        {stats.recoverySuccessRate}% verified rate
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-[#B8AE9B]">
                      {recoverySuggestion}
                    </p>
                    <div className="pt-2 flex items-center justify-between gap-3">
                      <span className="font-mono text-[11px] text-[#B8AE9B]">
                        {stats.pendingApprovalsCount} approval(s) queued
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigate('/dashboard')}
                        className="rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-3.5 py-1.5 text-xs font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap"
                      >
                        Open Recovery Center
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

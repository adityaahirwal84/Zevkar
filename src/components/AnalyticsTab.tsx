import React from 'react';
import { Clock, ShieldCheck, DollarSign, Activity } from 'lucide-react';
import { DashboardStats, Client, Incident } from '../types';

interface AnalyticsTabProps {
  stats: DashboardStats;
  clients: Client[];
  incidents?: Incident[];
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ stats, clients, incidents = [] }) => {
  const categoryColors: Record<string, string> = {
    AUTH_FAILURE: 'bg-[#C52A18]',
    DATABASE_FAILURE: 'bg-[#A51B0B]',
    RATE_LIMIT: 'bg-[#E2B066]',
    TIMEOUT: 'bg-[#E88A7E]',
    SCHEMA_MISMATCH: 'bg-[#8CC59B]',
    INVALID_PAYLOAD: 'bg-[#8CC59B]',
  };

  const countsByCategory = incidents.reduce<Record<string, number>>((acc, inc) => {
    const key = inc.errorCategory || 'UNKNOWN';
    acc[key] = (acc[key] || 0) + Math.max(1, inc.occurrenceCount || 1);
    return acc;
  }, {});
  const totalOccurrences = Object.values(countsByCategory).reduce((s, v) => s + v, 0);

  const categories = Object.entries(countsByCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({
      name: name.replace(/_/g, ' '),
      count,
      percentage: totalOccurrences > 0 ? Math.round((count / totalOccurrences) * 100) : 0,
      color: categoryColors[name] || 'bg-[#B5AA99]',
    }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
          Fleet Analytics &amp; Business Impact
        </h2>
        <p className="text-xs text-[#B5AA99]">
          Reliability telemetry, failure category distribution, and estimated transaction exposure
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#B5AA99]">
            <Clock className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
            <span>Mean Time to Recovery (MTTR)</span>
          </div>
          <p className="mt-2 font-[var(--font-display)] text-3xl font-extrabold text-[#E9E5DC] tabular-nums">
            {stats.meanTimeToRecoveryMinutes} <span className="text-sm font-normal text-[#B5AA99]">mins</span>
          </p>
          <span className="mt-1 block text-[11px] text-[#8CC59B]">Across verified retries</span>
        </div>

        <div className="rounded-xl border border-[#383838] bg-[#202020] p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#B5AA99]">
            <Activity className="h-4 w-4 text-[#8CC59B]" aria-hidden="true" />
            <span>Fleet Success Rate</span>
          </div>
          <p className="mt-2 font-[var(--font-display)] text-3xl font-extrabold text-[#E9E5DC] tabular-nums">
            {stats.workflowSuccessRate}%
          </p>
          <span className="mt-1 block text-[11px] text-[#B5AA99] tabular-nums">
            {(stats.successfulExecutions24h + stats.failedExecutions24h).toLocaleString()} executions in 24h
          </span>
        </div>

        <div className="rounded-xl border border-[#383838] bg-[#202020] p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#B5AA99]">
            <ShieldCheck className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
            <span>Recovery Success Ratio</span>
          </div>
          <p className="mt-2 font-[var(--font-display)] text-3xl font-extrabold text-[#E9E5DC] tabular-nums">
            {stats.recoverySuccessRate}%
          </p>
          <span className="mt-1 block text-[11px] text-[#B5AA99]">Idempotency verified</span>
        </div>

        <div className="rounded-xl border border-[#383838] bg-[#202020] p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#B5AA99]">
            <DollarSign className="h-4 w-4 text-[#E2B066]" aria-hidden="true" />
            <span>Estimated Value at Risk</span>
          </div>
          <p className="mt-2 font-[var(--font-display)] text-3xl font-extrabold text-[#E2B066] font-mono tabular-nums">
            ${stats.estimatedRevenueAtRisk.toLocaleString()}
          </p>
          <span className="mt-1 block text-[11px] text-[#B5AA99]">From active incident exposure</span>
        </div>
      </div>

      {/* Breakdown Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-6">
          <h3 className="text-sm font-bold text-[#E9E5DC] mb-1">Root Cause Category Distribution</h3>
          <p className="text-xs text-[#B5AA99] mb-5">
            Primary failure classifications across monitored workflows
          </p>

          <div className="space-y-4">
            {categories.length === 0 ? (
              <p className="text-xs text-[#B5AA99] py-6 text-center">No failures recorded yet.</p>
            ) : (
              categories.map((cat) => (
                <div key={cat.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#E9E5DC] font-medium">{cat.name}</span>
                    <span className="text-[#B5AA99] font-mono tabular-nums">
                      {cat.count} events ({cat.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded bg-[#171717] overflow-hidden">
                    <div className={`h-full rounded ${cat.color}`} style={{ width: `${cat.percentage}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[#383838] bg-[#202020] p-6">
          <h3 className="text-sm font-bold text-[#E9E5DC] mb-1">Client Reliability Ranking</h3>
          <p className="text-xs text-[#B5AA99] mb-4">
            Automation health scores and operational stability by client portfolio
          </p>

          <div className="space-y-3">
            {clients.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-[#383838] bg-[#171717] p-3.5 flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-bold text-[#E9E5DC]">{c.name}</p>
                  <p className="text-[11px] text-[#B5AA99]">
                    {c.industry} · {c.monitoredWorkflowsCount} workflows
                  </p>
                </div>

                <div className="text-right">
                  <span
                    className={`font-mono text-sm font-bold tabular-nums ${
                      c.healthScore >= 90
                        ? 'text-[#8CC59B]'
                        : c.healthScore >= 70
                        ? 'text-[#E2B066]'
                        : 'text-[#E88A7E]'
                    }`}
                  >
                    {c.healthScore}%
                  </span>
                  <p className="text-[10px] text-[#B5AA99]">
                    {c.activeIncidentsCount > 0 ? `${c.activeIncidentsCount} active issue` : 'Operational'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

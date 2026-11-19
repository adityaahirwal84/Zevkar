import React from 'react';
import { Workflow } from '../../types';
import { formatInTimezone } from '../../lib/datetime';
import { StatusBadge } from '../marketing/StatusBadge';

interface WorkflowTableProps {
  workflows: Workflow[];
  timezone?: string;
}

export const WorkflowTable: React.FC<WorkflowTableProps> = ({ workflows, timezone = 'UTC' }) => {
  if (workflows.length === 0) {
    return (
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-10 text-center text-xs text-[#B5AA99]">
        No workflows match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#383838] bg-[#202020]">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-[#383838] bg-[#1D1D1D] text-[#B5AA99]">
          <tr>
            <th className="px-4 py-3 font-semibold">Workflow</th>
            <th className="px-4 py-3 font-semibold">Client</th>
            <th className="px-4 py-3 font-semibold">Platform</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold text-right">Consecutive Fails</th>
            <th className="px-4 py-3 font-semibold text-right">Avg Latency</th>
            <th className="px-4 py-3 font-semibold text-right">Last Executed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#383838]">
          {workflows.map((wf) => {
            const tone =
              wf.healthStatus === 'HEALTHY'
                ? 'success'
                : wf.healthStatus === 'DEGRADED'
                ? 'warning'
                : 'error';
            return (
              <tr key={wf.id} className="hover:bg-[#171717]/60 transition-colors">
                <td className="px-4 py-3.5">
                  <div className="font-semibold text-[#E9E5DC]">{wf.name}</div>
                  <div className="font-mono text-[11px] text-[#B5AA99] mt-0.5 flex flex-wrap items-center gap-2">
                    <span>{wf.externalWorkflowId}</span>
                    {wf.allowLongRunning && (
                      <span className="rounded border border-[#383838] bg-[#171717] px-1.5 py-0.5 text-[10px] text-[#E2B066]">
                        Long-running (4h SLA)
                      </span>
                    )}
                    {wf.stuckTimeoutSeconds && !wf.allowLongRunning && (
                      <span className="rounded border border-[#383838] bg-[#171717] px-1.5 py-0.5 text-[10px] text-[#B5AA99]">
                        SLA {wf.stuckTimeoutSeconds}s
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-[#E9E5DC]">{wf.clientName}</td>
                <td className="px-4 py-3.5 font-mono text-[#B5AA99]">{wf.platform}</td>
                <td className="px-4 py-3.5">
                  <StatusBadge label={wf.healthStatus} tone={tone} withIcon />
                </td>
                <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                  <span className={wf.consecutiveFailures > 0 ? 'text-[#E88A7E] font-semibold' : 'text-[#8CC59B]'}>
                    {wf.consecutiveFailures}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-[#B5AA99] tabular-nums">
                  {wf.avgDurationMs}ms
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-[#B5AA99] tabular-nums whitespace-nowrap">
                  {formatInTimezone(wf.lastExecutionAt, timezone, 'datetime')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

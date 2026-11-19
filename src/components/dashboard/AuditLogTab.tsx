import React, { useState } from 'react';
import { FileText, Search, RefreshCw } from 'lucide-react';
import { AuditLogItem } from '../../types';
import { formatInTimezone, sortByTimestampDesc } from '../../lib/datetime';
import { StatusBadge } from '../marketing/StatusBadge';

interface AuditLogTabProps {
  logs: AuditLogItem[];
  timezone?: string;
  onRefresh: () => Promise<void> | void;
  isLoading?: boolean;
}

export const AuditLogTab: React.FC<AuditLogTabProps> = ({
  logs,
  timezone = 'UTC',
  onRefresh,
  isLoading = false,
}) => {
  const [query, setQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState('ALL');

  const entities = ['ALL', ...Array.from(new Set(logs.map((l) => l.entityType)))];

  const filtered = sortByTimestampDesc(
    logs.filter((log) => {
    const q = query.trim().toLowerCase();
    const matchesSearch =
      !q ||
      log.action.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q) ||
      log.actorName.toLowerCase().includes(q) ||
      log.entityId.toLowerCase().includes(q);
    const matchesEntity = entityFilter === 'ALL' || log.entityType === entityFilter;
    return matchesSearch && matchesEntity;
  }),
    (l) => l.createdAt
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
            Workspace Audit Log
          </h2>
          <p className="text-xs text-[#B5AA99]">
            Chronological record of webhook events, AI diagnoses, approval decisions, and recovery runs
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Refresh Trail</span>
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-4 flex flex-col md:flex-row items-center gap-3">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#B5AA99]" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by action, actor, or entity ID..."
            className="w-full rounded-md border border-[#383838] bg-[#171717] pl-9 pr-3 py-2 text-xs text-[#E9E5DC] placeholder:text-[#B5AA99]/60"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto md:ml-auto">
          {entities.map((ent) => (
            <button
              key={ent}
              type="button"
              onClick={() => setEntityFilter(ent)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                entityFilter === ent
                  ? 'bg-[#A51B0B] text-[#E9E5DC]'
                  : 'border border-[#383838] bg-[#171717] text-[#B5AA99] hover:text-[#E9E5DC]'
              }`}
            >
              {ent}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Entries Table */}
      <div className="overflow-x-auto rounded-xl border border-[#383838] bg-[#202020]">
        {filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <FileText className="h-8 w-8 text-[#B5AA99] mx-auto" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#E9E5DC]">No audit entries match</p>
            <p className="text-xs text-[#B5AA99]">Try clearing your search filter or trigger an action in the console.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#383838] bg-[#1D1D1D] text-[#B5AA99]">
              <tr>
                <th className="px-4 py-3 font-semibold">Timestamp</th>
                <th className="px-4 py-3 font-semibold">Actor</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Entity</th>
                <th className="px-4 py-3 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#383838]">
              {filtered.map((item) => {
                const tone = item.action.includes('REJECTED') || item.action.includes('CREATED')
                  ? 'warning'
                  : item.action.includes('EXECUTED') || item.action.includes('VERIFIED') || item.action.includes('GRANTED')
                  ? 'success'
                  : 'neutral';
                return (
                  <tr key={item.id} className="hover:bg-[#171717]/60">
                    <td className="px-4 py-3.5 font-mono text-[#B5AA99] whitespace-nowrap tabular-nums">
                      {formatInTimezone(item.createdAt, timezone, 'datetime')}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-[#E9E5DC]">{item.actorName}</div>
                      <div className="font-mono text-[11px] text-[#B5AA99]">{item.ipAddress}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge label={item.action} tone={tone} />
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[#B5AA99]">
                      {item.entityType} · {item.entityId}
                    </td>
                    <td className="px-4 py-3.5 text-[#E9E5DC]/90 max-w-md">{item.details}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

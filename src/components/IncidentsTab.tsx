import React, { useState } from 'react';
import { Search, CheckCircle2 } from 'lucide-react';
import { Incident } from '../types';
import { sortByTimestampDesc } from '../lib/datetime';
import { IncidentCard } from './dashboard/IncidentCard';

interface IncidentsTabProps {
  incidents: Incident[];
  timezone?: string;
  onSelectIncident: (incident: Incident) => void;
  onOpenDiagnosis: (incident: Incident) => void;
  onExecuteRecovery: (incident: Incident) => void;
}

export const IncidentsTab: React.FC<IncidentsTabProps> = ({
  incidents,
  timezone = 'UTC',
  onSelectIncident,
  onOpenDiagnosis,
  onExecuteRecovery,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const filteredIncidents = sortByTimestampDesc(
    incidents.filter((inc) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        inc.workflowName.toLowerCase().includes(q) ||
        inc.clientName.toLowerCase().includes(q) ||
        inc.errorMessage.toLowerCase().includes(q) ||
        inc.id.toLowerCase().includes(q);

      const matchesSeverity = selectedSeverity === 'ALL' || inc.severity === selectedSeverity;
      const matchesStatus = selectedStatus === 'ALL' || inc.status === selectedStatus;

      return matchesSearch && matchesSeverity && matchesStatus;
    }),
    (inc) => inc.lastDetectedAt
  );

  const activeCount = incidents.filter((i) => i.status !== 'RESOLVED' && i.status !== 'IGNORED').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
            Incident Management &amp; Triage
          </h2>
          <p className="text-xs text-[#B5AA99]">
            Detected execution failures, root-cause diagnoses, and recovery states ({timezone})
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-[#B5AA99] tabular-nums">
          <span>
            Total: <strong className="text-[#E9E5DC]">{incidents.length}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-[#E88A7E] font-medium">{activeCount} Active</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-4 flex flex-col xl:flex-row items-stretch xl:items-center gap-3">
        <div className="relative w-full xl:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#B5AA99]" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by workflow, client, or error message..."
            className="w-full rounded-md border border-[#383838] bg-[#171717] pl-9 pr-3 py-2 text-xs text-[#E9E5DC] placeholder:text-[#B5AA99]/60"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[#B5AA99] font-semibold uppercase tracking-wider mr-1">
            Severity:
          </span>
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSelectedSeverity(sev)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                selectedSeverity === sev
                  ? 'bg-[#A51B0B] text-[#E9E5DC]'
                  : 'border border-[#383838] bg-[#171717] text-[#B5AA99] hover:text-[#E9E5DC]'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 xl:ml-auto">
          <span className="text-[11px] text-[#B5AA99] font-semibold uppercase tracking-wider mr-1">
            Status:
          </span>
          {['ALL', 'OPEN', 'APPROVAL_REQUIRED', 'RESOLVED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setSelectedStatus(st)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                selectedStatus === st
                  ? 'bg-[#A51B0B] text-[#E9E5DC]'
                  : 'border border-[#383838] bg-[#171717] text-[#B5AA99] hover:text-[#E9E5DC]'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Incidents List */}
      <div className="space-y-3">
        {filteredIncidents.length === 0 ? (
          <div className="rounded-xl border border-[#383838] bg-[#202020] p-12 text-center space-y-2">
            <CheckCircle2 className="h-9 w-9 text-[#8CC59B] mx-auto" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#E9E5DC]">No Incidents Found</p>
            <p className="text-xs text-[#B5AA99]">All automations matching these filters are operating normally.</p>
          </div>
        ) : (
          filteredIncidents.map((inc) => (
            <IncidentCard
              key={inc.id}
              incident={inc}
              timezone={timezone}
              onSelect={onSelectIncident}
              onOpenDiagnosis={onOpenDiagnosis}
              onExecuteRecovery={onExecuteRecovery}
              showDiagnosisPreview
            />
          ))
        )}
      </div>
    </div>
  );
};

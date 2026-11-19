import React from 'react';
import { Stethoscope, RotateCcw } from 'lucide-react';
import { Incident } from '../../types';
import { formatInTimezone } from '../../lib/datetime';
import { StatusBadge } from '../marketing/StatusBadge';

interface IncidentCardProps {
  incident: Incident;
  timezone?: string;
  onSelect?: (incident: Incident) => void;
  onOpenDiagnosis: (incident: Incident) => void;
  onExecuteRecovery?: (incident: Incident) => void;
  showDiagnosisPreview?: boolean;
}

export const IncidentCard: React.FC<IncidentCardProps> = ({
  incident,
  timezone = 'UTC',
  onSelect,
  onOpenDiagnosis,
  onExecuteRecovery,
  showDiagnosisPreview = false,
}) => {
  const sevTone =
    incident.severity === 'CRITICAL'
      ? 'error'
      : incident.severity === 'HIGH'
      ? 'warning'
      : 'neutral';

  const statusTone =
    incident.status === 'RESOLVED'
      ? 'success'
      : incident.status === 'APPROVAL_REQUIRED'
      ? 'warning'
      : 'error';

  return (
    <div
      onClick={() => onSelect && onSelect(incident)}
      className={`rounded-xl border p-4 sm:p-5 transition-colors ${
        incident.status === 'RESOLVED'
          ? 'border-[#383838]/70 bg-[#171717] opacity-85'
          : 'border-[#383838] bg-[#202020] hover:border-[#B5AA99]/60'
      } ${onSelect ? 'cursor-pointer' : ''}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={incident.severity} tone={sevTone} />
          <StatusBadge label={incident.status.replace('_', ' ')} tone={statusTone} withIcon />
          <span className="font-mono text-xs text-[#B5AA99]">#{incident.id}</span>
          <span className="text-sm font-bold text-[#E9E5DC]">{incident.workflowName}</span>
        </div>

        <div className="flex items-center gap-3 text-xs text-[#B5AA99] shrink-0">
          <span className="rounded border border-[#383838] bg-[#171717] px-2 py-0.5 text-[#E9E5DC]">
            {incident.clientName}
          </span>
          <span className="font-mono tabular-nums whitespace-nowrap">
            {formatInTimezone(incident.lastDetectedAt, timezone, 'datetime')}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-[#383838] bg-[#171717] p-3 font-mono text-xs text-[#E88A7E] overflow-x-auto">
        {incident.errorMessage}
      </div>

      {showDiagnosisPreview && incident.aiDiagnosis && (
        <div className="mt-3 rounded-lg border border-[#383838] bg-[#211D10] p-3.5 text-xs space-y-1">
          <div className="font-semibold text-[#E9E5DC]">
            Root Cause: {incident.aiDiagnosis.rootCause}
          </div>
          <p className="text-[#B5AA99]">
            <strong className="text-[#E9E5DC]">Client Summary:</strong> {incident.aiDiagnosis.simpleExplanation}
          </p>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-[#383838] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-[#B5AA99]">
          <span className="tabular-nums">
            Occurrences: <strong className="text-[#E9E5DC]">{incident.occurrenceCount}x</strong>
          </span>
          <span>
            Category: <strong className="text-[#E9E5DC]">{incident.errorCategory}</strong>
          </span>
          <span>
            Platform: <strong className="text-[#E9E5DC]">{incident.platform}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDiagnosis(incident);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-3 py-1.5 text-xs font-semibold text-[#E9E5DC] transition-colors"
          >
            <Stethoscope className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
            <span>{incident.aiDiagnosis ? 'View Diagnosis' : 'Analyze Root Cause'}</span>
          </button>

          {incident.status !== 'RESOLVED' && onExecuteRecovery && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExecuteRecovery(incident);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-3 py-1.5 text-xs font-semibold text-[#E9E5DC] transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{incident.status === 'APPROVAL_REQUIRED' ? 'Review & Recover' : 'Recover'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

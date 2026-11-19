import React, { useState } from 'react';
import { X, Stethoscope, RotateCcw, RefreshCw, Copy, Check } from 'lucide-react';
import { Incident } from '../types';
import { DiagnosisPanel } from './dashboard/DiagnosisPanel';
import { StatusBadge } from './marketing/StatusBadge';

interface AIDiagnosisModalProps {
  incident: Incident;
  onClose: () => void;
  onTriggerReanalyze: (incidentId: string) => Promise<void>;
  onProceedToRecovery: (incident: Incident) => void;
  isAnalyzing: boolean;
}

export const AIDiagnosisModal: React.FC<AIDiagnosisModalProps> = ({
  incident,
  onClose,
  onTriggerReanalyze,
  onProceedToRecovery,
  isAnalyzing,
}) => {
  const [copied, setCopied] = useState(false);
  const diagnosis = incident.aiDiagnosis;

  const handleCopyClientSummary = () => {
    if (!diagnosis) return;
    const text = `Incident Report - ${incident.workflowName} (${incident.clientName})\nIssue: ${diagnosis.simpleExplanation}\nRecommended Action: ${diagnosis.suggestedRecovery}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl rounded-xl border border-[#383838] bg-[#202020] p-6 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#383838] shrink-0 gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#383838] bg-[#171717] text-[#C52A18]">
              <Stethoscope className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-[var(--font-display)] text-lg font-bold text-[#E9E5DC]">
                  AI Root Cause Diagnosis
                </h3>
                {diagnosis ? (
                  <StatusBadge
                    label={
                      diagnosis.isAiGenerated
                        ? `Gemini (${diagnosis.modelUsed || 'gemini-4-hydrogen'})`
                        : 'Deterministic Fallback'
                    }
                    tone={diagnosis.isAiGenerated ? 'success' : 'warning'}
                  />
                ) : (
                  <StatusBadge label="Pending Analysis" tone="neutral" />
                )}
              </div>
              <p className="text-xs text-[#B5AA99]">
                Incident #{incident.id} · {incident.workflowName} ({incident.clientName})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-[#B5AA99] hover:bg-[#171717] hover:text-[#E9E5DC]"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto py-5 space-y-5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#383838] bg-[#171717] p-3">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge
                label={`${incident.severity} SEVERITY`}
                tone={incident.severity === 'CRITICAL' ? 'error' : 'warning'}
              />
              <span className="text-[#B5AA99]">
                Category: <strong className="text-[#E9E5DC]">{incident.errorCategory}</strong>
              </span>
              <span className="text-[#B5AA99]">
                Platform: <strong className="text-[#E9E5DC]">{incident.platform}</strong>
              </span>
            </div>

            {diagnosis && (
              <button
                type="button"
                onClick={handleCopyClientSummary}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#E9E5DC] hover:text-[#C52A18]"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-[#8CC59B]" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied Summary' : 'Copy Client Summary'}</span>
              </button>
            )}
          </div>

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#B5AA99]">
              Observed Failure Log
            </span>
            <div className="mt-1.5 rounded-lg border border-[#383838] bg-[#171717] p-3 font-mono text-[11px] text-[#E88A7E] overflow-x-auto">
              {incident.errorMessage}
            </div>
          </div>

          <DiagnosisPanel diagnosis={diagnosis} errorMessage={incident.errorMessage} />
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[#383838] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onTriggerReanalyze(incident.id)}
            disabled={isAnalyzing}
            className="inline-flex items-center gap-2 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{isAnalyzing ? 'Analyzing...' : 'Re-Analyze Root Cause'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[#383838] bg-[#171717] px-3.5 py-2 text-xs font-medium text-[#B5AA99] hover:text-[#E9E5DC]"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onProceedToRecovery(incident);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Proceed to Safe Recovery</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

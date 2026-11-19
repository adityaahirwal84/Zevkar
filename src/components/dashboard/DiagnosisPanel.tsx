import React from 'react';
import { CheckCircle2, ShieldAlert, AlertCircle, Cpu, ShieldCheck } from 'lucide-react';
import { AIDiagnosis } from '../../types';
import { StatusBadge } from '../marketing/StatusBadge';

interface DiagnosisPanelProps {
  diagnosis?: AIDiagnosis;
  errorMessage: string;
}

export const DiagnosisPanel: React.FC<DiagnosisPanelProps> = ({ diagnosis, errorMessage }) => {
  if (!diagnosis) {
    return (
      <div className="rounded-xl border border-[#383838] bg-[#171717] p-6 text-center text-xs text-[#B5AA99]">
        Diagnosis has not been computed yet. Trigger analysis to classify root cause and safe remediation steps.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {diagnosis.isAiGenerated === false && diagnosis.fallbackReason && (
        <div className="rounded-lg border border-[#544021] bg-[#211D10] p-3.5 flex items-start gap-2.5 text-xs text-[#E2B066]">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <span className="font-semibold text-[#E9E5DC]">Deterministic Rules Engine Used: </span>
            <span className="text-[#B5AA99]">{diagnosis.fallbackReason}</span>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[#383838] bg-[#211D10] p-4 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
            Identified Root Cause
          </span>
          <StatusBadge
            label={`${Math.round(diagnosis.confidence * 100)}% confidence`}
            tone={diagnosis.isAiGenerated ? 'success' : 'warning'}
          />
        </div>
        <p className="text-sm font-medium text-[#E9E5DC] leading-relaxed">{diagnosis.rootCause}</p>
      </div>

      {/* Phase 7 Structured Recovery Recommendation */}
      <div className="rounded-lg border border-[#383838] bg-[#171717] p-4 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-[#E9E5DC]">
            <Cpu className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
            <span>AI Recovery Recommendation</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={diagnosis.isRecoverable === false ? 'NON-RECOVERABLE' : 'RECOVERABLE'}
              tone={diagnosis.isRecoverable === false ? 'error' : 'success'}
            />
            {diagnosis.expectedRiskLevel && (
              <StatusBadge
                label={`${diagnosis.expectedRiskLevel} RISK`}
                tone={
                  diagnosis.expectedRiskLevel === 'CRITICAL' || diagnosis.expectedRiskLevel === 'HIGH'
                    ? 'error'
                    : 'warning'
                }
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="rounded-md border border-[#383838] bg-[#202020] p-3">
            <span className="text-[10px] uppercase tracking-wider text-[#B5AA99] block">Suggested Strategy</span>
            <span className="font-mono text-xs font-semibold text-[#E9E5DC] mt-1 block">
              {diagnosis.recommendedStrategy || 'MANUAL_RECOVERY'}
            </span>
          </div>
          <div className="rounded-md border border-[#383838] bg-[#202020] p-3">
            <span className="text-[10px] uppercase tracking-wider text-[#B5AA99] block">Max Recommended Retries</span>
            <span className="font-mono text-xs font-semibold text-[#E9E5DC] mt-1 block tabular-nums">
              {diagnosis.maxRecommendedRetries ?? 1} attempt(s)
            </span>
          </div>
        </div>

        {diagnosis.recommendationReason && (
          <p className="text-[#B5AA99] leading-relaxed">
            <strong className="text-[#E9E5DC]">Rationale: </strong>
            {diagnosis.recommendationReason}
          </p>
        )}
        {diagnosis.requiredUserAction && (
          <div className="flex items-start gap-2 rounded-md border border-[#383838] bg-[#202020] p-2.5 text-[#E9E5DC]">
            <ShieldCheck className="h-4 w-4 text-[#C52A18] shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <strong>Required Operator Action: </strong>
              {diagnosis.requiredUserAction}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-[#383838] bg-[#171717] p-4 space-y-2">
          <div className="text-xs font-semibold text-[#E9E5DC]">Non-Technical Stakeholder Summary</div>
          <p className="text-xs text-[#B5AA99] leading-relaxed">{diagnosis.simpleExplanation}</p>
        </div>

        <div className="rounded-lg border border-[#383838] bg-[#171717] p-4 space-y-2">
          <div className="text-xs font-semibold text-[#E9E5DC]">Technical Breakdown</div>
          <p className="text-xs font-mono text-[#B5AA99] leading-relaxed">
            {diagnosis.technicalExplanation || errorMessage}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-[#383838] bg-[#171717] p-4 space-y-2">
        <div className="text-xs font-semibold text-[#E9E5DC]">Recommended Remediation Steps</div>
        <ul className="space-y-2">
          {diagnosis.recommendedActions.map((action, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs text-[#E9E5DC]/90">
              <CheckCircle2 className="h-4 w-4 text-[#8CC59B] shrink-0 mt-0.5" aria-hidden="true" />
              <span>{action}</span>
            </li>
          ))}
        </ul>
      </div>

      <div
        className={`rounded-lg border p-4 text-xs ${
          diagnosis.requiresHumanApproval
            ? 'border-[#544021] bg-[#292114] text-[#E2B066]'
            : 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]'
        }`}
      >
        <div className="flex items-center gap-2 font-semibold mb-1">
          {diagnosis.requiresHumanApproval ? (
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>
            {diagnosis.requiresHumanApproval
              ? 'Human Approval Gate Required Prior to Retry'
              : 'Cleared for Policy-Governed Recovery'}
          </span>
        </div>
        <p className="text-[#E9E5DC]/90">{diagnosis.suggestedRecovery}</p>
      </div>
    </div>
  );
};

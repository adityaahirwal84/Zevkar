import React, { useState } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Ban,
} from 'lucide-react';
import { ApprovalRequest } from '../types';
import { formatInTimezone } from '../lib/datetime';
import { StatusBadge } from './marketing/StatusBadge';

interface ApprovalsTabProps {
  approvals: ApprovalRequest[];
  timezone?: string;
  onRespondApproval: (approvalId: string, decision: 'APPROVE' | 'REJECT', rejectionReason?: string) => Promise<void>;
  onCancelApproval?: (approvalId: string, reason?: string) => Promise<void>;
  isProcessing: boolean;
}

export const ApprovalsTab: React.FC<ApprovalsTabProps> = ({
  approvals,
  timezone = 'UTC',
  onRespondApproval,
  onCancelApproval,
  isProcessing,
}) => {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const pendingApprovals = approvals.filter((a) => a.status === 'PENDING');
  const pastApprovals = approvals.filter((a) => a.status !== 'PENDING');

  const handleApprove = async (id: string) => {
    await onRespondApproval(id, 'APPROVE');
  };

  const handleRejectSubmit = async (id: string) => {
    if (!rejectReason.trim()) return;
    await onRespondApproval(id, 'REJECT', rejectReason.trim());
    setRejectingId(null);
    setRejectReason('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
            Human Approval Gate
          </h2>
          <p className="text-xs text-[#B5AA99]">
            RBAC-governed authorization workflow for high-impact, customer-facing, or financial automation recoveries
          </p>
        </div>

        <StatusBadge label={`${pendingApprovals.length} Pending Approval`} tone="warning" withIcon />
      </div>

      {/* Pending Approvals Queue */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#B5AA99]">
          Pending Authorizations
        </h3>

        {pendingApprovals.length === 0 ? (
          <div className="rounded-xl border border-[#383838] bg-[#202020] p-12 text-center space-y-2">
            <ShieldCheck className="h-9 w-9 text-[#8CC59B] mx-auto" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#E9E5DC]">All Clear</p>
            <p className="text-xs text-[#B5AA99]">No recovery requests are currently waiting for human approval.</p>
          </div>
        ) : (
          pendingApprovals.map((req) => (
            <div
              key={req.id}
              className="rounded-xl border border-[#544021] bg-[#211D10] p-6 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-lg border border-[#544021] bg-[#292114] text-[#E2B066] p-2">
                    <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-[#E2B066]">Approval #{req.id}</span>
                      {req.recoveryRequestId && (
                        <span className="text-[11px] font-mono text-[#B5AA99]">
                          · Request #{req.recoveryRequestId}
                        </span>
                      )}
                      {req.riskLevel && (
                        <StatusBadge
                          label={`${req.riskLevel} RISK`}
                          tone={req.riskLevel === 'CRITICAL' || req.riskLevel === 'HIGH' ? 'error' : 'warning'}
                        />
                      )}
                      {req.strategy && (
                        <span className="text-[10px] font-mono rounded border border-[#383838] bg-[#171717] px-2 py-0.5 text-[#E9E5DC]">
                          {req.strategy}
                        </span>
                      )}
                    </div>
                    <h4 className="text-base font-bold text-[#E9E5DC] mt-0.5">{req.incidentTitle}</h4>
                  </div>
                </div>

                <div className="flex flex-col sm:items-end gap-1 text-xs text-[#B5AA99]">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    Requested by: <strong className="text-[#E9E5DC]">{req.requestedBy}</strong>
                  </span>
                  <span className="font-mono text-[10px] tabular-nums">
                    {formatInTimezone(req.createdAt, timezone, 'datetime')}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-[#383838] bg-[#171717] p-4 text-xs space-y-1">
                <span className="font-semibold text-[#B5AA99] block">Proposed Recovery Operation:</span>
                <p className="text-[#E9E5DC] font-medium">{req.proposedAction}</p>
              </div>

              <div className="rounded-lg border border-[#61231C] bg-[#2B1513] p-4 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-[#E88A7E]">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Identified Risk Factor</span>
                </div>
                <p className="text-[#E9E5DC]/90 leading-relaxed">{req.riskReason}</p>
              </div>

              {rejectingId === req.id ? (
                <div className="rounded-lg border border-[#61231C] bg-[#171717] p-4 space-y-3">
                  <label className="text-xs font-semibold text-[#E9E5DC] block">
                    Reason for Rejection (Recorded in Audit Log):
                  </label>
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g., Stripe API key not yet rotated in client vault..."
                    className="w-full rounded-md border border-[#383838] bg-[#202020] px-3 py-2 text-xs text-[#E9E5DC]"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setRejectingId(null)}
                      className="rounded-md border border-[#383838] bg-[#202020] px-3 py-1.5 text-xs text-[#B5AA99] hover:text-[#E9E5DC]"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectSubmit(req.id)}
                      disabled={!rejectReason.trim() || isProcessing}
                      className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-[#E9E5DC]"
                    >
                      Confirm Rejection
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-[#383838] flex flex-wrap items-center justify-end gap-3">
                  {onCancelApproval && (
                    <button
                      type="button"
                      onClick={() => onCancelApproval(req.id, 'Cancelled from Approvals queue')}
                      disabled={isProcessing}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-3.5 py-2 text-xs font-medium text-[#B5AA99] hover:text-[#E9E5DC] transition-colors"
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Cancel Pending</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setRejectingId(req.id)}
                    disabled={isProcessing}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#171717] hover:border-[#61231C] hover:text-[#E88A7E] px-4 py-2 text-xs font-semibold text-[#B5AA99] transition-colors"
                  >
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    <span>Reject &amp; Hold</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApprove(req.id)}
                    disabled={isProcessing}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] disabled:opacity-50 px-5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span>Authorize Recovery Execution</span>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Past Decision History */}
      {pastApprovals.length > 0 && (
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-6 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#B5AA99]">
            Authorization History
          </h3>

          <div className="space-y-2">
            {pastApprovals.map((req) => (
              <div
                key={req.id}
                className="rounded-lg border border-[#383838] bg-[#171717] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3"
              >
                <div>
                  <span className="font-semibold text-[#E9E5DC]">{req.incidentTitle}</span>
                  <p className="text-[11px] text-[#B5AA99] mt-0.5">
                    Reviewed by: {req.respondedBy || 'Operator'}
                    {req.respondedAt ? ` · ${formatInTimezone(req.respondedAt, timezone, 'datetime')}` : ''}
                  </p>
                  {req.rejectionReason && (
                    <p className="text-[11px] text-[#E88A7E] mt-0.5 font-mono">Note: {req.rejectionReason}</p>
                  )}
                </div>

                <StatusBadge
                  label={req.status}
                  tone={req.status === 'APPROVED' ? 'success' : req.status === 'CANCELLED' ? 'neutral' : 'error'}
                  withIcon
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

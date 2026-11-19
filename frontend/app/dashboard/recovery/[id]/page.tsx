'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCircle2, Play, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/components/AuthProvider';
import { DoctorBrandMark } from '@/components/NextMarketingShell';

export default function RecoveryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, dashboardRoute } = useAuth();
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const detailQuery = useQuery({
    queryKey: ['recovery', 'detail', params?.id],
    queryFn: () => api.recovery.getRequestDetail(params.id),
    enabled: isAuthenticated && Boolean(params?.id),
  });

  const executeMutation = useMutation({
    mutationFn: () => api.recovery.executeRequest(params.id),
    onSuccess: (res) => {
      setFeedback(res.details || `Execution status: ${res.status}`);
      queryClient.invalidateQueries({ queryKey: ['recovery'] });
    },
    onError: (err: any) => setFeedback(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.recovery.cancelRequest(params.id, 'Cancelled from Recovery Detail view'),
    onSuccess: () => {
      setFeedback('Recovery request cancelled.');
      queryClient.invalidateQueries({ queryKey: ['recovery'] });
    },
    onError: (err: any) => setFeedback(err.message),
  });

  const verifyMutation = useMutation({
    mutationFn: () => api.recovery.verifyRequest(params.id),
    onSuccess: (res) => {
      setFeedback(res.details || `Verification status: ${res.verification_status}`);
      queryClient.invalidateQueries({ queryKey: ['recovery'] });
    },
    onError: (err: any) => setFeedback(err.message),
  });

  const data = detailQuery.data;
  const req = data?.recovery_request;
  const incident = data?.incident;
  const workflow = data?.workflow;
  const diagnosis = data?.ai_diagnosis;
  const attempts = data?.attempts || [];
  const approvals = data?.approvals || [];

  return (
    <div className="min-h-screen bg-[#1B180D] text-[#E8E3D8] flex flex-col">
      <header className="border-b border-[#2E2D26] bg-[#1B180D] px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={dashboardRoute} aria-label="Zevkar dashboard home">
            <DoctorBrandMark />
          </Link>
          <Link
            href="/dashboard/recovery"
            className="inline-flex items-center gap-1.5 text-xs text-[#B5AA99] hover:text-[#E9E5DC]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Recovery Dashboard</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 space-y-6">
        {feedback && (
          <div className="p-3.5 rounded-lg border border-[#383838] bg-[#202020] text-xs text-[#E9E5DC]">
            {feedback}
          </div>
        )}

        {detailQuery.isLoading || !req ? (
          <div className="p-8 rounded-xl border border-[#383838] bg-[#202020] text-center text-xs text-[#B5AA99]">
            {detailQuery.isError ? 'Failed to load recovery request details.' : 'Loading recovery details...'}
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-[#383838] bg-[#202020] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-mono text-[#C52A18]">RECOVERY REQUEST #{req.id}</span>
                  <h1 className="text-xl font-bold text-[#E9E5DC] mt-1">
                    {workflow?.name || req.workflow_id}
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded border border-[#383838] bg-[#171717] text-xs font-mono">
                    {req.risk_level} RISK
                  </span>
                  <span className="px-2.5 py-1 rounded border border-[#383838] bg-[#171717] text-xs font-mono text-[#E2B066]">
                    {req.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded border border-[#383838] bg-[#171717] p-3">
                  <span className="text-[10px] uppercase text-[#B5AA99] block">Strategy</span>
                  <span className="font-mono text-[#E9E5DC] mt-1 block">{req.strategy}</span>
                </div>
                <div className="rounded border border-[#383838] bg-[#171717] p-3">
                  <span className="text-[10px] uppercase text-[#B5AA99] block">Retries</span>
                  <span className="font-mono text-[#E9E5DC] mt-1 block tabular-nums">
                    {req.retry_count} / {req.max_retry_attempts}
                  </span>
                </div>
                <div className="rounded border border-[#383838] bg-[#171717] p-3">
                  <span className="text-[10px] uppercase text-[#B5AA99] block">Verified Outcome</span>
                  <span className="font-mono text-[#E9E5DC] mt-1 block">
                    {req.result_verified ? 'VERIFIED' : 'PENDING'}
                  </span>
                </div>
                <div className="rounded border border-[#383838] bg-[#171717] p-3">
                  <span className="text-[10px] uppercase text-[#B5AA99] block">External Execution</span>
                  <span className="font-mono text-[#E9E5DC] mt-1 block">{req.external_execution_id || 'N/A'}</span>
                </div>
              </div>

              {(req.final_result_summary || req.last_error) && (
                <div className="rounded-lg border border-[#383838] bg-[#171717] p-3.5 text-xs font-mono text-[#E9E5DC]">
                  {req.final_result_summary || req.last_error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#383838]">
                {['PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'FAILED'].includes(req.status) && (
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded border border-[#383838] bg-[#171717] px-3.5 py-2 text-xs text-[#B5AA99] hover:text-[#E9E5DC]"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Cancel Request</span>
                  </button>
                )}
                {req.status === 'VERIFYING' && (
                  <button
                    onClick={() => verifyMutation.mutate()}
                    disabled={verifyMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded border border-[#544021] bg-[#211D10] hover:border-[#C52A18] px-4 py-2 text-xs font-semibold text-[#E2B066]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{verifyMutation.isPending ? 'Verifying...' : 'Verify Outcome'}</span>
                  </button>
                )}
                {['APPROVED', 'SCHEDULED', 'FAILED'].includes(req.status) && req.is_recoverable && (
                  <button
                    onClick={() => executeMutation.mutate()}
                    disabled={executeMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 text-xs font-semibold text-[#E9E5DC]"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{executeMutation.isPending ? 'Executing...' : 'Execute & Verify Recovery'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Incident + AI Diagnosis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-2 text-xs">
                <h2 className="text-sm font-bold text-[#E9E5DC]">Original Incident</h2>
                <p className="text-[#B5AA99]">Category: {incident?.error_category}</p>
                <p className="font-mono text-[#E88A7E] bg-[#171717] p-3 rounded border border-[#383838]">
                  {incident?.error_message}
                </p>
              </div>

              <div className="rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-2 text-xs">
                <h2 className="text-sm font-bold text-[#E9E5DC]">AI Diagnosis &amp; Recommendation</h2>
                {diagnosis ? (
                  <>
                    <p className="text-[#E9E5DC]">{diagnosis.root_cause}</p>
                    <p className="text-[#B5AA99]">
                      Strategy: <span className="font-mono text-[#E9E5DC]">{diagnosis.recommended_strategy}</span>
                    </p>
                    <p className="text-[#B5AA99]">{diagnosis.recommendation_reason}</p>
                    {Array.isArray(diagnosis.verified_facts) && diagnosis.verified_facts.length > 0 && (
                      <div className="pt-1">
                        <span className="text-[10px] font-mono uppercase text-[#8CC59B]">Verified Facts:</span>
                        <ul className="list-disc pl-4 text-[#E9E5DC]">
                          {diagnosis.verified_facts.map((f: string, idx: number) => (
                            <li key={idx}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(diagnosis.ai_hypotheses) && diagnosis.ai_hypotheses.length > 0 && (
                      <div className="pt-1">
                        <span className="text-[10px] font-mono uppercase text-[#E2B066]">Hypotheses:</span>
                        <ul className="list-disc pl-4 text-[#B5AA99]">
                          {diagnosis.ai_hypotheses.map((h: string, idx: number) => (
                            <li key={idx}>{h}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[#B5AA99]">No AI diagnosis linked.</p>
                )}
              </div>
            </div>

            {/* Approval History */}
            <div className="rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-3 text-xs">
              <div className="flex items-center gap-2 font-bold text-[#E9E5DC]">
                <ShieldAlert className="w-4 h-4 text-[#E2B066]" />
                <span>Approval History ({approvals.length})</span>
              </div>
              {approvals.length === 0 ? (
                <p className="text-[#B5AA99]">No approval gates recorded for this request.</p>
              ) : (
                approvals.map((a: any) => (
                  <div key={a.id} className="rounded border border-[#383838] bg-[#171717] p-3 flex justify-between">
                    <div>
                      <div className="font-semibold text-[#E9E5DC]">{a.proposed_action}</div>
                      <div className="text-[#B5AA99]">Responded by: {a.responded_by || 'Pending'}</div>
                    </div>
                    <span className="font-mono">{a.status}</span>
                  </div>
                ))
              )}
            </div>

            {/* Retry Attempts */}
            <div className="rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-3 text-xs">
              <h2 className="text-sm font-bold text-[#E9E5DC]">Retry Attempts ({attempts.length})</h2>
              {attempts.length === 0 ? (
                <p className="text-[#B5AA99]">No retry attempts executed yet.</p>
              ) : (
                attempts.map((att: any) => (
                  <div key={att.id} className="rounded border border-[#383838] bg-[#171717] p-3 flex justify-between items-center">
                    <div>
                      <div className="font-mono text-[#E9E5DC]">
                        Attempt #{att.attempt_number} · {att.verification_status}
                      </div>
                      <div className="text-[#B5AA99]">{att.details}</div>
                    </div>
                    {att.status === 'SUCCESS' ? (
                      <CheckCircle2 className="w-4 h-4 text-[#8CC59B]" />
                    ) : (
                      <XCircle className="w-4 h-4 text-[#E88A7E]" />
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

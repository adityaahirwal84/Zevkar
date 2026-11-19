import React, { useState } from 'react';
import { Activity, Stethoscope, ShieldAlert, FileText, ArrowRight } from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { StatusBadge } from './StatusBadge';

interface ProductPreviewProps {
  onNavigate: (route: AppRoute) => void;
}

type PreviewTab = 'monitoring' | 'diagnosis' | 'approvals' | 'audit';

export const ProductPreview: React.FC<ProductPreviewProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<PreviewTab>('monitoring');

  const tabs: { id: PreviewTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'monitoring', label: 'Workflow Monitoring', icon: Activity },
    { id: 'diagnosis', label: 'AI Diagnosis', icon: Stethoscope },
    { id: 'approvals', label: 'Approval Gate', icon: ShieldAlert },
    { id: 'audit', label: 'Audit Trail', icon: FileText },
  ];

  return (
    <section className="border-t border-[#363125] bg-[#171A1B] py-20 md:py-24">
      <div className="mx-auto max-w-[1320px] px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div className="max-w-2xl space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
              Inside the Control Console
            </div>
            <h2 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold text-[#F0E9D9]">
              One operational surface from failure detection to verified recovery.
            </h2>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('/dashboard')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#F0E9D9] hover:text-[#C52A18] transition-colors whitespace-nowrap shrink-0"
          >
            <span>Open Live Console</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Interactive Console Preview Frame */}
        <div className="rounded-xl border border-[#363125] bg-[#211D10] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#363125] bg-[#202326] px-4 py-3">
            <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Product preview views">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#A51D0B] text-[#F0E9D9]'
                        : 'text-[#B8AE9B] hover:bg-[#171A1B] hover:text-[#F0E9D9]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="text-xs font-mono text-[#B8AE9B] hidden sm:block">
              Zevkar AI · Console Architecture
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'monitoring' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-lg border border-[#363125] bg-[#171A1B] p-4">
                    <div className="text-xs text-[#B8AE9B]">Monitored Workflows</div>
                    <div className="mt-1 text-2xl font-bold text-[#F0E9D9] tabular-nums">12</div>
                  </div>
                  <div className="rounded-lg border border-[#363125] bg-[#171A1B] p-4">
                    <div className="text-xs text-[#B8AE9B]">24h Executions</div>
                    <div className="mt-1 text-2xl font-bold text-[#F0E9D9] tabular-nums">4,280</div>
                  </div>
                  <div className="rounded-lg border border-[#363125] bg-[#171A1B] p-4">
                    <div className="text-xs text-[#B8AE9B]">Active Incidents</div>
                    <div className="mt-1 text-2xl font-bold text-[#E88A7E] tabular-nums">2</div>
                  </div>
                  <div className="rounded-lg border border-[#363125] bg-[#171A1B] p-4">
                    <div className="text-xs text-[#B8AE9B]">Mean Recovery Time</div>
                    <div className="mt-1 text-2xl font-bold text-[#F0E9D9] tabular-nums">4.8m</div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-[#363125]">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#363125] bg-[#171A1B] text-[#B8AE9B]">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Workflow</th>
                        <th className="px-4 py-3 font-semibold">Source</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold text-right">Avg Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#363125] bg-[#211D10]">
                      <tr>
                        <td className="px-4 py-3 font-medium text-[#F0E9D9]">Stripe Settlement -&gt; NetSuite Invoice</td>
                        <td className="px-4 py-3 font-mono text-[#B8AE9B]">n8n</td>
                        <td className="px-4 py-3"><StatusBadge label="FAILING" tone="error" /></td>
                        <td className="px-4 py-3 text-right font-mono text-[#B8AE9B] tabular-nums">1,420ms</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-medium text-[#F0E9D9]">Inbound Lead Qualifier -&gt; CRM Dispatch</td>
                        <td className="px-4 py-3 font-mono text-[#B8AE9B]">Webhook</td>
                        <td className="px-4 py-3"><StatusBadge label="HEALTHY" tone="success" /></td>
                        <td className="px-4 py-3 text-right font-mono text-[#B8AE9B] tabular-nums">820ms</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-medium text-[#F0E9D9]">EMR Intake -&gt; PostgreSQL Patient Sync</td>
                        <td className="px-4 py-3 font-mono text-[#B8AE9B]">FastAPI</td>
                        <td className="px-4 py-3"><StatusBadge label="DEGRADED" tone="warning" /></td>
                        <td className="px-4 py-3 text-right font-mono text-[#B8AE9B] tabular-nums">2,310ms</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'diagnosis' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-lg border border-[#363125] bg-[#171A1B] p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#F0E9D9]">Technical Root Cause</span>
                    <span className="font-mono text-[#8CC59B] tabular-nums">94% confidence</span>
                  </div>
                  <p className="text-sm text-[#F0E9D9] leading-relaxed">
                    Concurrent webhook deliveries triggered a PostgreSQL row-level deadlock on table &quot;patients_ehr&quot; during batch intake sync.
                  </p>
                  <div className="rounded border border-[#363125] bg-[#211D10] p-3 font-mono text-[11px] text-[#E88A7E]">
                    PostgreSQL error: deadlock detected on process 18239 while updating table &quot;patients_ehr&quot;
                  </div>
                </div>

                <div className="rounded-lg border border-[#363125] bg-[#171A1B] p-5 space-y-3">
                  <div className="text-xs font-semibold text-[#F0E9D9]">Plain-Language Stakeholder Summary</div>
                  <p className="text-sm text-[#B8AE9B] leading-relaxed">
                    Two patient intake updates attempted to modify the same record at the exact same millisecond. The database safely cancelled the second write to protect data integrity.
                  </p>
                  <div className="pt-2 border-t border-[#363125] text-xs text-[#F0E9D9]">
                    Recommended Recovery: RETRY_AFTER_DELAY with 3-minute backoff once lock clears.
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'approvals' && (
              <div className="rounded-lg border border-[#544021] bg-[#202326] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-mono text-[#E2B066]">APPROVAL REQUEST · appr_01</div>
                    <h3 className="text-base font-bold text-[#F0E9D9] mt-1">
                      Batch Re-execution of Failed Stripe Settlement Runs
                    </h3>
                  </div>
                  <StatusBadge label="PENDING APPROVAL" tone="warning" withIcon />
                </div>
                <p className="text-sm text-[#B8AE9B] leading-relaxed">
                  Risk Assessment: High financial sensitivity. Automated retries are paused until an authorized operator (OWNER or ADMIN) verifies credential rotation and approves idempotent replay.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => onNavigate('/dashboard')}
                    className="rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-4 py-2 text-xs font-semibold text-[#F0E9D9] transition-colors"
                  >
                    Open Approvals Queue
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="overflow-x-auto rounded-lg border border-[#363125]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#363125] bg-[#171A1B] text-[#B8AE9B]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Timestamp</th>
                      <th className="px-4 py-3 font-semibold">Actor</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                      <th className="px-4 py-3 font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#363125] bg-[#211D10]">
                    <tr>
                      <td className="px-4 py-3 font-mono text-[#B8AE9B] tabular-nums">14:12:04 UTC</td>
                      <td className="px-4 py-3 text-[#F0E9D9]">Webhook Listener</td>
                      <td className="px-4 py-3 font-mono text-[#E88A7E]">INCIDENT_CREATED</td>
                      <td className="px-4 py-3 text-[#B8AE9B]">Captured Stripe 401 failure; retry gated.</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-mono text-[#B8AE9B] tabular-nums">14:12:07 UTC</td>
                      <td className="px-4 py-3 text-[#F0E9D9]">Diagnosis Engine</td>
                      <td className="px-4 py-3 font-mono text-[#F0E9D9]">AI_DIAGNOSIS_COMPLETED</td>
                      <td className="px-4 py-3 text-[#B8AE9B]">AUTH_FAILURE classified (96% confidence).</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-mono text-[#B8AE9B] tabular-nums">13:45:19 UTC</td>
                      <td className="px-4 py-3 text-[#F0E9D9]">Workspace Admin</td>
                      <td className="px-4 py-3 font-mono text-[#8CC59B]">INTEGRATION_VERIFIED</td>
                      <td className="px-4 py-3 text-[#B8AE9B]">Validated n8n API credentials and encrypted vault entry.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

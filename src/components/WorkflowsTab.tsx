import React, { useEffect, useState } from 'react';
import { Search, Plus, RefreshCw, Clock, Activity } from 'lucide-react';
import { Workflow, Client, Integration, Execution } from '../types';
import { formatInTimezone, sortByTimestampDesc } from '../lib/datetime';
import { WorkflowTable } from './dashboard/WorkflowTable';
import { StatusBadge } from './marketing/StatusBadge';

interface WorkflowsTabProps {
  workflows: Workflow[];
  executions?: Execution[];
  clients: Client[];
  integrations: Integration[];
  timezone?: string;
  onAddWorkflow: (workflow: Partial<Workflow>) => Promise<void>;
  onTriggerSync: (integrationId?: string) => Promise<void>;
  onDetectStuck?: () => Promise<void>;
  isSyncing: boolean;
  isDetectingStuck?: boolean;
}

export const WorkflowsTab: React.FC<WorkflowsTabProps> = ({
  workflows,
  executions = [],
  clients,
  timezone = 'UTC',
  onAddWorkflow,
  onTriggerSync,
  onDetectStuck,
  isSyncing,
  isDetectingStuck = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('ALL');
  const [execStatusFilter, setExecStatusFilter] = useState<string>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  const [newWfName, setNewWfName] = useState('');
  const [newWfClient, setNewWfClient] = useState(clients[0]?.id || '');
  const [newWfPlatform, setNewWfPlatform] = useState('n8n');
  const [newWfExternalId, setNewWfExternalId] = useState('');
  const [allowLongRunning, setAllowLongRunning] = useState(false);

  useEffect(() => {
    if (!newWfClient && clients[0]?.id) {
      setNewWfClient(clients[0].id);
    }
  }, [clients, newWfClient]);

  const filteredWorkflows = workflows.filter((wf) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      wf.name.toLowerCase().includes(q) ||
      wf.clientName.toLowerCase().includes(q) ||
      wf.externalWorkflowId.toLowerCase().includes(q);

    const matchesPlatform = selectedPlatform === 'ALL' || wf.platform === selectedPlatform;
    return matchesSearch && matchesPlatform;
  });

  const filteredExecutions = sortByTimestampDesc(
    executions.filter((ex) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        ex.workflowName.toLowerCase().includes(q) ||
        ex.clientName.toLowerCase().includes(q) ||
        (ex.externalExecutionId || ex.id).toLowerCase().includes(q);
      const matchesPlatform = selectedPlatform === 'ALL' || ex.platform === selectedPlatform;
      const matchesStatus = execStatusFilter === 'ALL' || ex.status === execStatusFilter;
      return matchesSearch && matchesPlatform && matchesStatus;
    }),
    (e) => e.startedAt
  ).slice(0, 25);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWfName.trim()) return;
    await onAddWorkflow({
      name: newWfName.trim(),
      clientId: newWfClient || clients[0]?.id,
      platform: newWfPlatform as any,
      externalWorkflowId: newWfExternalId.trim() || `wf_${Date.now()}`,
      allowLongRunning,
    });
    setShowAddModal(false);
    setNewWfName('');
    setNewWfExternalId('');
    setAllowLongRunning(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
            Monitored Automations &amp; Executions
          </h2>
          <p className="text-xs text-[#B5AA99]">
            Synchronized workflows and execution telemetry across n8n, Zapier, Make, and custom jobs ({timezone})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onDetectStuck && (
            <button
              type="button"
              onClick={onDetectStuck}
              disabled={isDetectingStuck}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors disabled:opacity-50"
            >
              <Clock className={`h-3.5 w-3.5 text-[#E2B066] ${isDetectingStuck ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{isDetectingStuck ? 'Checking...' : 'Check Stuck Runs'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onTriggerSync()}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{isSyncing ? 'Syncing...' : 'Sync Fleet'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add Workflow</span>
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#B5AA99]" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by workflow, client, or execution ID..."
            className="w-full rounded-md border border-[#383838] bg-[#171717] pl-9 pr-3 py-2 text-xs text-[#E9E5DC] placeholder:text-[#B5AA99]/60"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 md:ml-auto">
          <span className="text-[11px] text-[#B5AA99] font-semibold uppercase tracking-wider mr-1">
            Platform:
          </span>
          {['ALL', 'n8n', 'Zapier', 'Make'].map((plat) => (
            <button
              key={plat}
              type="button"
              onClick={() => setSelectedPlatform(plat)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                selectedPlatform === plat
                  ? 'bg-[#A51B0B] text-[#E9E5DC]'
                  : 'border border-[#383838] bg-[#171717] text-[#B5AA99] hover:text-[#E9E5DC]'
              }`}
            >
              {plat}
            </button>
          ))}
        </div>
      </div>

      {workflows.length === 0 ? (
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-10 text-center space-y-3">
          <p className="text-sm font-semibold text-[#E9E5DC]">No monitored workflows registered yet</p>
          <p className="text-xs text-[#B5AA99] max-w-md mx-auto">
            Sync an active connector or add a workflow manually to monitor execution health, detect stuck runs, and route failures to AI diagnosis.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => onTriggerSync()}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Sync Connected Fleet</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add First Workflow</span>
            </button>
          </div>
        </div>
      ) : (
        <WorkflowTable workflows={filteredWorkflows} timezone={timezone} />
      )}

      {/* Recent Execution History */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
            <h3 className="font-[var(--font-display)] text-base font-bold text-[#E9E5DC]">
              Recent Execution History
            </h3>
            <span className="text-xs font-mono text-[#B5AA99] tabular-nums">
              ({filteredExecutions.length})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {['ALL', 'SUCCESS', 'FAILED', 'RUNNING', 'TIMED_OUT'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setExecStatusFilter(st)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  execStatusFilter === st
                    ? 'bg-[#A51B0B] text-[#E9E5DC]'
                    : 'border border-[#383838] bg-[#171717] text-[#B5AA99] hover:text-[#E9E5DC]'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#383838] bg-[#202020]">
          {filteredExecutions.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#B5AA99]">
              No executions recorded for the selected filters yet.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#383838] bg-[#1D1D1D] text-[#B5AA99]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Started ({timezone})</th>
                  <th className="px-4 py-3 font-semibold">Execution</th>
                  <th className="px-4 py-3 font-semibold">Workflow</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Duration</th>
                  <th className="px-4 py-3 font-semibold">Details / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#383838]">
                {filteredExecutions.map((ex) => {
                  const tone =
                    ex.status === 'SUCCESS'
                      ? 'success'
                      : ex.status === 'RUNNING'
                      ? 'warning'
                      : 'error';
                  return (
                    <tr key={ex.id} className="hover:bg-[#171717]/60 transition-colors">
                      <td className="px-4 py-3 font-mono text-[#B5AA99] whitespace-nowrap tabular-nums">
                        {formatInTimezone(ex.startedAt, timezone, 'datetime')}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#E9E5DC] whitespace-nowrap">
                        <div>#{ex.externalExecutionId || ex.id}</div>
                        <div className="text-[10px] text-[#B5AA99]">{ex.mode || 'trigger'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#E9E5DC]">{ex.workflowName}</div>
                        <div className="text-[11px] text-[#B5AA99]">{ex.clientName} · {ex.platform}</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={ex.status.replace('_', ' ')} tone={tone} withIcon />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#B5AA99] tabular-nums whitespace-nowrap">
                        {ex.durationMs > 0 ? `${ex.durationMs}ms` : ex.status === 'RUNNING' ? 'In flight' : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-xs">
                        {ex.errorMessage ? (
                          <span className="font-mono text-[11px] text-[#E88A7E] line-clamp-2">
                            {ex.errorMessage}
                          </span>
                        ) : (
                          <span className="text-[#8CC59B]">Completed cleanly</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-[#383838] bg-[#202020] p-6 shadow-2xl">
            <h3 className="font-[var(--font-display)] text-base font-bold text-[#E9E5DC] mb-4">
              Add Automation to Monitor
            </h3>
            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Workflow Name</label>
                <input
                  type="text"
                  required
                  value={newWfName}
                  onChange={(e) => setNewWfName(e.target.value)}
                  placeholder="e.g., Stripe Webhook -> HubSpot Deal Sync"
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>

              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Assign to Client</label>
                <select
                  value={newWfClient}
                  onChange={(e) => setNewWfClient(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Automation Platform</label>
                <select
                  value={newWfPlatform}
                  onChange={(e) => setNewWfPlatform(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                >
                  <option value="n8n">n8n (Self-Hosted / Cloud)</option>
                  <option value="Zapier">Zapier Enterprise</option>
                  <option value="Make">Make.com</option>
                  <option value="custom_node">Custom Node.js Microservice</option>
                  <option value="custom_python">Custom Python / FastAPI</option>
                </select>
              </div>

              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">External Workflow ID</label>
                <input
                  type="text"
                  value={newWfExternalId}
                  onChange={(e) => setNewWfExternalId(e.target.value)}
                  placeholder="e.g., n8n_flow_98214"
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>

              <label className="flex items-center gap-2 text-[#B5AA99] cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowLongRunning}
                  onChange={(e) => setAllowLongRunning(e.target.checked)}
                  className="rounded border-[#383838] bg-[#171717] accent-[#A51B0B]"
                />
                <span>Allow long-running execution (4h stuck threshold instead of 15m)</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#383838]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-md border border-[#383838] bg-[#171717] px-3.5 py-2 text-[#B5AA99] hover:text-[#E9E5DC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 font-semibold text-[#E9E5DC]"
                >
                  Save &amp; Monitor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

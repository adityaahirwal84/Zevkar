import React, { useState } from 'react';
import { RefreshCw, Copy, Check, Plus, Zap } from 'lucide-react';
import { Integration, PlatformType } from '../types';
import { formatInTimezone } from '../lib/datetime';
import { StatusBadge } from './marketing/StatusBadge';

interface IntegrationsTabProps {
  integrations: Integration[];
  timezone?: string;
  onAddIntegration: (integration: Partial<Integration> & { apiKey?: string }) => Promise<void>;
  onTestConnection: (platform: PlatformType, instanceUrl: string, apiKey?: string) => Promise<any>;
  onTriggerSync: (integrationId: string) => Promise<void>;
  isSyncing: boolean;
}

export const IntegrationsTab: React.FC<IntegrationsTabProps> = ({
  integrations,
  timezone = 'UTC',
  onAddIntegration,
  onTestConnection,
  onTriggerSync,
  isSyncing,
}) => {
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<PlatformType>('n8n');
  const [instanceUrl, setInstanceUrl] = useState('https://n8n.internal.agency/api/v1');
  const [apiKey, setApiKey] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const webhookListenerUrl = `${window.location.origin}/api/v1/webhooks/listener`;

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookListenerUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleRunTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await onTestConnection(platform, instanceUrl, apiKey);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ connected: false, message: err?.message || 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !platform) return;
    await onAddIntegration({
      name: name.trim(),
      platform,
      instanceUrl: instanceUrl.trim(),
      hasCredentials: !!apiKey,
      apiKey: apiKey.trim() || undefined,
    });
    setShowConnectModal(false);
    setName('');
    setApiKey('');
    setTestResult(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
            Automation Platform Integrations
          </h2>
          <p className="text-xs text-[#B5AA99]">
            Connectors and webhook listeners for n8n clusters, Zapier workspaces, Make scenarios, and custom runtimes
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowConnectModal(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Connect New Instance</span>
        </button>
      </div>

      {/* Webhook Gateway Box */}
      <div className="rounded-xl border border-[#383838] bg-[#211D10] p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#E9E5DC] text-xs font-semibold mb-1">
              <Zap className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
              <span>Universal Webhook Failure Ingestion Gateway</span>
            </div>
            <p className="text-xs text-[#B5AA99] max-w-2xl leading-relaxed">
              Point your n8n Error Trigger node, Zapier Catch Hook, or FastAPI exception hook to this endpoint for automated incident ingestion.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-xs font-mono text-[#E9E5DC]">
            <span className="truncate max-w-xs">{webhookListenerUrl}</span>
            <button
              type="button"
              onClick={handleCopyWebhook}
              className="text-[#B5AA99] hover:text-[#E9E5DC] p-1 shrink-0"
              title="Copy URL"
              aria-label="Copy webhook listener URL"
            >
              {copiedUrl ? <Check className="h-4 w-4 text-[#8CC59B]" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Connected Integrations Grid */}
      {integrations.length === 0 ? (
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-10 text-center space-y-3">
          <p className="text-sm font-semibold text-[#E9E5DC]">No automation integrations connected yet</p>
          <p className="text-xs text-[#B5AA99] max-w-md mx-auto">
            Connect your n8n cluster, Make scenario, Zapier workspace, or send webhook failure payloads to the gateway endpoint above.
          </p>
          <button
            type="button"
            onClick={() => setShowConnectModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Connect First Integration</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map((integ) => (
            <div
              key={integ.id}
              className="rounded-xl border border-[#383838] bg-[#202020] p-5 flex flex-col justify-between hover:border-[#B5AA99]/60 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-md border border-[#383838] bg-[#171717] flex items-center justify-center text-[#C52A18] font-mono font-bold text-xs">
                      {integ.platform.slice(0, 3).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#E9E5DC]">{integ.name}</h3>
                      <span className="text-[11px] text-[#B5AA99]">{integ.platform} Connector</span>
                    </div>
                  </div>

                  <StatusBadge
                    label={integ.lastSyncStatus === 'ERROR' ? 'SYNC ERROR' : integ.status}
                    tone={integ.lastSyncStatus === 'ERROR' ? 'error' : 'success'}
                    withIcon
                  />
                </div>

                {integ.instanceUrl && (
                  <div className="mt-3 rounded-md border border-[#383838] bg-[#171717] p-2.5 font-mono text-[11px] text-[#B5AA99] truncate">
                    {integ.instanceUrl}
                  </div>
                )}

                {integ.lastSyncError && (
                  <div className="mt-2 rounded-md border border-[#61231C] bg-[#2B1513] p-2 font-mono text-[11px] text-[#E88A7E]">
                    {integ.lastSyncError}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between text-xs text-[#B5AA99] tabular-nums">
                  <span>
                    Monitored Workflows: <strong className="text-[#E9E5DC]">{integ.workflowCount}</strong>
                  </span>
                  <span>
                    Credentials:{' '}
                    <strong className={integ.hasCredentials ? 'text-[#8CC59B] font-mono' : 'text-[#E2B066] font-mono'}>
                      {integ.hasCredentials ? 'Encrypted Vault' : 'Not Configured'}
                    </strong>
                  </span>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-[#383838] flex items-center justify-between text-xs gap-2">
                <div className="text-[11px] text-[#B5AA99] tabular-nums">
                  <span>Last synced: {formatInTimezone(integ.lastSyncedAt, timezone, 'datetime')}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onTriggerSync(integ.id)}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1.5 text-[#E9E5DC] hover:text-[#C52A18] font-semibold shrink-0"
                >
                  <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>Sync Workflows</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-[#383838] bg-[#202020] p-6 shadow-2xl">
            <h3 className="font-[var(--font-display)] text-base font-bold text-[#E9E5DC] mb-4">
              Connect Automation Runtime
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Integration Label</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Client Production n8n Cluster"
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>

              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Platform Type</label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as PlatformType)}
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                >
                  <option value="n8n">n8n (Self-Hosted or Cloud)</option>
                  <option value="Zapier">Zapier Enterprise</option>
                  <option value="Make">Make.com</option>
                  <option value="custom_python">Custom Python / FastAPI</option>
                  <option value="custom_node">Custom Node.js Service</option>
                </select>
              </div>

              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Instance API URL</label>
                <input
                  type="url"
                  value={instanceUrl}
                  onChange={(e) => setInstanceUrl(e.target.value)}
                  placeholder="https://n8n.yourdomain.com/api/v1"
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>

              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">API Key / Access Token</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="n8n_api_key_..."
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleRunTest}
                  disabled={testing}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-3 py-1.5 text-xs font-semibold text-[#E9E5DC]"
                >
                  <RefreshCw className={`h-3 w-3 ${testing ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>{testing ? 'Testing Endpoint...' : 'Probe Connection'}</span>
                </button>

                {testResult && (
                  <div
                    className={`mt-2 rounded-lg border p-3 text-xs ${
                      testResult.connected
                        ? 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]'
                        : 'border-[#61231C] bg-[#2B1513] text-[#E88A7E]'
                    }`}
                  >
                    <p className="font-semibold">{testResult.message}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#383838]">
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  className="rounded-md border border-[#383838] bg-[#171717] px-3.5 py-2 text-[#B5AA99] hover:text-[#E9E5DC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 font-semibold text-[#E9E5DC]"
                >
                  Save Integration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/components/AuthProvider';
import { DoctorBrandMark } from '@/components/NextMarketingShell';

const PLATFORMS = [
  { id: 'n8n', label: 'n8n', desc: 'REST API workflow & execution polling + recovery retries' },
  { id: 'Make', label: 'Make', desc: 'Scenario webhook error capture & triage' },
  { id: 'Zapier', label: 'Zapier', desc: 'Zap catch-hook failure monitoring' },
  { id: 'custom_python', label: 'Custom Python / FastAPI', desc: 'Direct webhook listener ingestion' },
] as const;

const TOTAL_STEPS = 8;

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, orgName, user, refreshSession } = useAuth();
  const [step, setStep] = useState(1);
  const [loadingState, setLoadingState] = useState(true);
  const [workspaceName, setWorkspaceName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [industry, setIndustry] = useState('SaaS & Cloud Services');
  const [platform, setPlatform] = useState<string>('n8n');
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [integrationName, setIntegrationName] = useState('Production n8n Cluster');
  const [instanceUrl, setInstanceUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [testNotice, setTestNotice] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean>(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    (async () => {
      try {
        const state = await api.onboarding.get();
        if (!active) return;
        const d = state?.data || {};
        setStep(Math.min(Math.max(state?.current_step || 1, 1), TOTAL_STEPS));
        setWorkspaceName(d.organizationName || orgName || '');
        setContactEmail(d.contactEmail || user?.email || '');
        setTimezone(d.timezone || user?.timezone || 'UTC');
        setClientId(d.clientId || null);
        setClientName(d.clientName || '');
        setCompanyName(d.companyName || '');
        setClientEmail(d.clientEmail || user?.email || '');
        setIndustry(d.industry || 'SaaS & Cloud Services');
        setPlatform(d.platform || 'n8n');
        setIntegrationId(d.integrationId || null);
        setIntegrationName(d.integrationName || 'Production n8n Cluster');
        setInstanceUrl(d.instanceUrl || '');
        setTestOk(Boolean(d.connectionVerified));
        setTestNotice(d.connectionMessage || null);
      } catch {
        setWorkspaceName(orgName || '');
        setContactEmail(user?.email || '');
        setClientEmail(user?.email || '');
      } finally {
        if (active) setLoadingState(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isAuthenticated, orgName, user]);

  const persistProgress = async (nextStep: number, extraData: Record<string, any> = {}) => {
    const payloadData = {
      organizationName: workspaceName.trim(),
      contactEmail: contactEmail.trim(),
      timezone,
      clientId,
      clientName: clientName.trim(),
      companyName: companyName.trim(),
      clientEmail: clientEmail.trim(),
      industry,
      platform,
      integrationId,
      integrationName: integrationName.trim(),
      instanceUrl: instanceUrl.trim(),
      ...extraData,
    };
    await api.onboarding.update({ current_step: nextStep, data: payloadData });
    setStep(nextStep);
  };

  const handleSaveOrg = async () => {
    setErrorMsg(null);
    if (workspaceName.trim().length < 2) {
      setErrorMsg('Enter an organization name (at least 2 characters).');
      return;
    }
    setSaving(true);
    try {
      await api.orgs.update({
        name: workspaceName.trim(),
        contact_email: contactEmail.trim() || undefined,
        timezone,
      });
      await persistProgress(3);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to save organization profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClient = async () => {
    setErrorMsg(null);
    if (clientName.trim().length < 2 || !clientEmail.trim()) {
      setErrorMsg('Enter a client/project name and contact email.');
      return;
    }
    setSaving(true);
    try {
      let resolvedClientId = clientId;
      if (resolvedClientId) {
        await api.clients.update(resolvedClientId, {
          name: clientName.trim(),
          company_name: (companyName || clientName).trim(),
          industry,
          contact_email: clientEmail.trim(),
        });
      } else {
        const created = await api.clients.create({
          name: clientName.trim(),
          company_name: (companyName || clientName).trim(),
          industry,
          contact_email: clientEmail.trim(),
        });
        resolvedClientId = created.id;
        setClientId(created.id);
      }
      await persistProgress(4, { clientId: resolvedClientId });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save client project.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveIntegration = async () => {
    setErrorMsg(null);
    if (integrationName.trim().length < 2) {
      setErrorMsg('Enter an integration name.');
      return;
    }
    setSaving(true);
    try {
      let resolvedIntegId = integrationId;
      if (!resolvedIntegId) {
        const created = await api.integrations.create({
          name: integrationName.trim(),
          platform,
          instance_url: instanceUrl.trim() || undefined,
          api_key: apiKey.trim() || undefined,
        });
        resolvedIntegId = created.id;
        setIntegrationId(created.id);
      }
      await persistProgress(6, { integrationId: resolvedIntegId });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to register integration.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnector = async () => {
    setSaving(true);
    setTestNotice(null);
    setErrorMsg(null);
    try {
      const res = integrationId
        ? await api.integrations.testConnection(integrationId)
        : await api.integrations.testNew({
            platform,
            instance_url: instanceUrl.trim() || undefined,
            api_key: apiKey.trim() || undefined,
          });
      setTestOk(res.status === 'ok' || res.status === 'connected');
      setTestNotice(res.message || 'Connection check finished.');
    } catch (err: any) {
      setTestOk(false);
      setTestNotice(err?.message || 'Connection check failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncWorkflows = async () => {
    setSaving(true);
    setSyncNotice(null);
    try {
      if (integrationId) {
        const res = await api.integrations.sync(integrationId);
        setSyncNotice(`Synced ${res.workflows_synced ?? 0} workflows and ${res.executions_ingested ?? 0} executions.`);
      } else {
        setSyncNotice('Webhook listener target ready for event ingestion.');
      }
    } catch (err: any) {
      setSyncNotice(err?.message || 'Sync skipped or failed; you can retry from Dashboard.');
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    setSaving(true);
    try {
      await api.onboarding.complete();
      await refreshSession();
      router.push('/dashboard');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to complete onboarding.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingState) {
    return (
      <div className="min-h-screen bg-[#211D10] text-[#F0E9D9] flex items-center justify-center px-6">
        <p className="text-xs font-mono text-[#B8AE9B]">Loading saved onboarding workspace state...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#211D10] text-[#F0E9D9] flex flex-col justify-center items-center px-6 py-12">
      <div className="w-full max-w-2xl rounded-2xl border border-[#363125] bg-[#171A1B] p-8 space-y-6">
        <div className="flex items-center justify-between gap-4 border-b border-[#363125] pb-4">
          <DoctorBrandMark />
          <span className="font-mono text-xs text-[#B8AE9B] tabular-nums">
            Step {step} of {TOTAL_STEPS}
          </span>
        </div>

        <div className="h-1.5 w-full rounded bg-[#211D10] overflow-hidden">
          <div
            className="h-full bg-[#A51D0B] transition-all"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {errorMsg && (
          <div className="rounded-md border border-[#61231C] bg-[#2B1513] p-3 text-xs text-[#E88A7E]">
            {errorMsg}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold text-[#F0E9D9]">Welcome to Zevkar</h1>
            <p className="text-sm text-[#B8AE9B] leading-relaxed">
              Configure your tenant-isolated workspace, create your first client project, connect your automation platform, and verify recovery guardrails.
            </p>
            <button
              type="button"
              onClick={() => persistProgress(2)}
              className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]"
            >
              <span>Begin Setup</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[#F0E9D9]">Organization Profile</h2>
            <div>
              <label htmlFor="onboard-ws" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Organization Name</label>
              <input
                id="onboard-ws"
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="onboard-email" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Alert Contact Email</label>
                <input
                  id="onboard-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                />
              </div>
              <div>
                <label htmlFor="onboard-tz" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Display Timezone</label>
                <input
                  id="onboard-tz"
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <button type="button" onClick={() => persistProgress(1)} className="inline-flex items-center gap-1 text-xs text-[#B8AE9B]">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button type="button" onClick={handleSaveOrg} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]">
                <span>Save &amp; Continue</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[#F0E9D9]">Add First Client or Project</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Client / Project Name</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g., Core Operations"
                  className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Company / Legal Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Owner Email</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Industry</label>
                <input
                  type="text"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <button type="button" onClick={() => persistProgress(2)} className="inline-flex items-center gap-1 text-xs text-[#B8AE9B]">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button type="button" onClick={handleSaveClient} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]">
                <span>Save Client &amp; Continue</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[#F0E9D9]">Select Automation Platform</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    platform === p.id ? 'border-[#A51D0B] bg-[#202326] text-[#F0E9D9]' : 'border-[#363125] bg-[#211D10] text-[#B8AE9B]'
                  }`}
                >
                  <div className="text-sm font-semibold">{p.label}</div>
                  <p className="text-xs mt-1 text-[#B8AE9B]">{p.desc}</p>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2">
              <button type="button" onClick={() => persistProgress(3)} className="inline-flex items-center gap-1 text-xs text-[#B8AE9B]">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button type="button" onClick={() => persistProgress(5)} className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]">
                <span>Continue</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[#F0E9D9]">Connect {platform}</h2>
            <div>
              <label className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Connector Label</label>
              <input
                type="text"
                value={integrationName}
                onChange={(e) => setIntegrationName(e.target.value)}
                className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
              />
            </div>
            <div>
              <label htmlFor="onboard-url" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">Instance or Webhook Target URL</label>
              <input
                id="onboard-url"
                type="url"
                value={instanceUrl}
                onChange={(e) => setInstanceUrl(e.target.value)}
                placeholder="https://n8n.yourcompany.com/api/v1"
                className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
              />
            </div>
            <div>
              <label htmlFor="onboard-key" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">API Key (Encrypted at rest)</label>
              <input
                id="onboard-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Optional during initial setup"
                className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <button type="button" onClick={() => persistProgress(4)} className="inline-flex items-center gap-1 text-xs text-[#B8AE9B]">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button type="button" onClick={handleSaveIntegration} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]">
                <span>Save Integration &amp; Continue</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[#F0E9D9]">Test Connector Reachability</h2>
            <p className="text-xs text-[#B8AE9B]">
              Verify live connectivity before importing workflows.
            </p>
            {testNotice && (
              <div className={`rounded-md border p-3 text-xs ${testOk ? 'border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B]' : 'border-[#544021] bg-[#211D10] text-[#E2B066]'}`}>
                {testNotice}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button type="button" onClick={() => persistProgress(5)} className="inline-flex items-center gap-1 text-xs text-[#B8AE9B]">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleTestConnector} disabled={saving} className="rounded-md border border-[#363125] bg-[#202326] px-4 py-2 text-xs font-semibold text-[#F0E9D9]">
                  Probe Connection
                </button>
                <button type="button" onClick={() => persistProgress(7)} className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]">
                  <span>Continue</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[#F0E9D9]">Sync Workflows &amp; Safety Guardrails</h2>
            <div className="rounded-lg border border-[#363125] bg-[#211D10] p-4 space-y-2 text-xs text-[#B8AE9B]">
              <p className="text-[#F0E9D9] font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#8CC59B]" />
                Default Workspace Safeguards
              </p>
              <p>· Financial, billing, auth, and CRITICAL incidents stay quarantined behind Owner/Admin approval.</p>
              <p>· Recovery requests generate deterministic SHA-256 idempotency hashes before execution.</p>
            </div>
            {syncNotice && <p className="text-xs text-[#8CC59B]">{syncNotice}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button type="button" onClick={() => persistProgress(6)} className="inline-flex items-center gap-1 text-xs text-[#B8AE9B]">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleSyncWorkflows} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md border border-[#363125] bg-[#202326] px-4 py-2 text-xs font-semibold text-[#F0E9D9]">
                  <RefreshCw className={`h-3.5 w-3.5 ${saving ? 'animate-spin' : ''}`} />
                  <span>Sync First Workflows</span>
                </button>
                <button type="button" onClick={() => persistProgress(8)} className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]">
                  <span>Review &amp; Finish</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 8 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#8CC59B] font-semibold text-sm">
              <CheckCircle2 className="h-5 w-5" />
              <span>Workspace Ready</span>
            </div>
            <h2 className="text-xl font-bold text-[#F0E9D9]">Enter your Reliability Console</h2>
            <p className="text-sm text-[#B8AE9B]">
              Workspace <strong className="text-[#F0E9D9]">{workspaceName || 'Configured'}</strong> ({platform}) is ready for telemetry monitoring, AI diagnosis, and guarded recovery.
            </p>
            <div className="flex items-center justify-between pt-2">
              <Link href="/dashboard" className="text-xs text-[#B8AE9B] hover:text-[#F0E9D9]">
                Return to Dashboard
              </Link>
              <button type="button" onClick={handleCompleteOnboarding} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-6 py-2.5 text-sm font-semibold text-[#F0E9D9]">
                <span>{saving ? 'Finalizing...' : 'Complete & Open Dashboard'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

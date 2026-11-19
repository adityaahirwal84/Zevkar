import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Cable,
  CheckCircle2,
  FlaskConical,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
  Users,
  Webhook,
} from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { useAuth } from '../../context/AuthContext';
import { authFetch } from '../../lib/api';
import {
  ONBOARDING_PLATFORM_OPTIONS,
  ONBOARDING_STEPS,
  clampOnboardingStep,
  getOnboardingPlatformConfig,
  validateOnboardingStep,
} from '../../lib/onboarding';
import { OnboardingStepData, PlatformType } from '../../types';
import { ZevkarLogo } from '../marketing/ZevkarLogo';

interface OnboardingPageProps {
  onNavigate: (route: AppRoute) => void;
  onRefreshData: () => Promise<void>;
}

export const OnboardingPage: React.FC<OnboardingPageProps> = ({
  onNavigate,
  onRefreshData,
}) => {
  const { agency, user, setAgencyContext, updateAgencyOnboarding } = useAuth();
  const [step, setStep] = useState<number>(() => clampOnboardingStep(agency.onboardingStep || 1));
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);

  const [orgName, setOrgName] = useState<string>(agency.name || '');
  const [contactEmail, setContactEmail] = useState<string>(agency.contactEmail || user?.email || '');
  const [timezone, setTimezone] = useState<string>(agency.timezone || 'UTC');

  const [clientId, setClientId] = useState<string | undefined>(undefined);
  const [clientName, setClientName] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [clientEmail, setClientEmail] = useState<string>(user?.email || '');
  const [industry, setIndustry] = useState<string>('SaaS & Automation');

  const [platform, setPlatform] = useState<PlatformType>('n8n');
  const [integrationId, setIntegrationId] = useState<string | undefined>(undefined);
  const [integrationName, setIntegrationName] = useState<string>('Production n8n Cluster');
  const [instanceUrl, setInstanceUrl] = useState<string>('https://n8n.example.com/api/v1');
  const [apiKey, setApiKey] = useState<string>('');

  const [connectionTested, setConnectionTested] = useState<boolean>(false);
  const [connectionVerified, setConnectionVerified] = useState<boolean>(false);
  const [connectionMessage, setConnectionMessage] = useState<string>('');

  const [syncCompleted, setSyncCompleted] = useState<boolean>(false);
  const [syncedWorkflowCount, setSyncedWorkflowCount] = useState<number>(0);
  const [syncedExecutionCount, setSyncedExecutionCount] = useState<number>(0);
  const [syncMessage, setSyncMessage] = useState<string>('');

  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadState = async () => {
      try {
        const res = await authFetch('/api/v1/onboarding');
        if (!res.ok) return;
        const ob = await res.json();
        if (!active || !ob) return;
        const resolvedStep = clampOnboardingStep(ob.currentStep || 1);
        setStep(resolvedStep);
        const d: OnboardingStepData = ob.data || {};
        if (d.organizationName) setOrgName(d.organizationName);
        if (d.contactEmail) setContactEmail(d.contactEmail);
        if (d.timezone) setTimezone(d.timezone);
        if (d.clientId) setClientId(d.clientId);
        if (d.clientName) setClientName(d.clientName);
        if (d.companyName) setCompanyName(d.companyName);
        if (d.clientEmail) setClientEmail(d.clientEmail);
        if (d.industry) setIndustry(d.industry);
        if (d.platform) setPlatform(d.platform);
        if (d.integrationId) setIntegrationId(d.integrationId);
        if (d.integrationName) setIntegrationName(d.integrationName);
        if (d.instanceUrl) setInstanceUrl(d.instanceUrl);
        if (typeof d.connectionTested === 'boolean') setConnectionTested(d.connectionTested);
        if (typeof d.connectionVerified === 'boolean') setConnectionVerified(d.connectionVerified);
        if (d.connectionMessage) setConnectionMessage(d.connectionMessage);
        if (typeof d.syncCompleted === 'boolean') setSyncCompleted(d.syncCompleted);
        if (typeof d.syncedWorkflowCount === 'number') setSyncedWorkflowCount(d.syncedWorkflowCount);
        if (typeof d.syncedExecutionCount === 'number') setSyncedExecutionCount(d.syncedExecutionCount);
      } catch {
        // Keep defaults on transient load failure
      } finally {
        if (active) setLoadingInitial(false);
      }
    };
    loadState();
    return () => {
      active = false;
    };
  }, []);

  const persistProgress = async (nextStep: number, partialData: Partial<OnboardingStepData> = {}) => {
    const clamped = clampOnboardingStep(nextStep);
    const payloadData: OnboardingStepData = {
      organizationName: orgName,
      contactEmail,
      timezone,
      clientId,
      clientName,
      companyName: companyName || clientName,
      clientEmail,
      industry,
      platform,
      integrationId,
      integrationName,
      instanceUrl,
      connectionTested,
      connectionVerified,
      connectionMessage,
      syncCompleted,
      syncedWorkflowCount,
      syncedExecutionCount,
      ...partialData,
    };

    const res = await authFetch('/api/v1/onboarding', {
      method: 'PUT',
      body: JSON.stringify({
        currentStep: clamped,
        data: payloadData,
      }),
    });
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      if (json.agency) setAgencyContext(json.agency);
      updateAgencyOnboarding(clamped, Boolean(json.onboarding?.completed));
    }
    setStep(clamped);
  };

  const handleStep1Next = async () => {
    setError(null);
    setSaving(true);
    try {
      await persistProgress(2);
    } catch {
      setError('Unable to save onboarding step.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOrgStep = async () => {
    setError(null);
    const validation = validateOnboardingStep(2, { organizationName: orgName, contactEmail, timezone });
    if (!validation.valid) {
      setError(validation.error || 'Invalid organization details.');
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch('/api/v1/agency', {
        method: 'PUT',
        body: JSON.stringify({ name: orgName.trim(), contactEmail: contactEmail.trim(), timezone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to save organization details.');
        return;
      }
      if (data.agency) setAgencyContext(data.agency);
      await persistProgress(3, { organizationName: orgName.trim(), contactEmail: contactEmail.trim(), timezone });
    } catch {
      setError('Unable to update organization settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClientStep = async () => {
    setError(null);
    const resolvedCompany = companyName.trim() || clientName.trim();
    const validation = validateOnboardingStep(3, {
      clientName,
      companyName: resolvedCompany,
      clientEmail,
    });
    if (!validation.valid) {
      setError(validation.error || 'Please enter valid client details.');
      return;
    }
    setSaving(true);
    try {
      const endpoint = clientId ? `/api/v1/clients/${clientId}` : '/api/v1/clients';
      const method = clientId ? 'PUT' : 'POST';
      const res = await authFetch(endpoint, {
        method,
        body: JSON.stringify({
          name: clientName.trim(),
          companyName: resolvedCompany,
          industry: industry.trim() || 'Technology',
          contactEmail: clientEmail.trim(),
        }),
      });
      const saved = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(saved.error || 'Failed to save client workspace.');
        return;
      }
      const resolvedClientId = saved.id || clientId;
      setClientId(resolvedClientId);
      setCompanyName(resolvedCompany);
      await persistProgress(4, {
        clientId: resolvedClientId,
        clientName: clientName.trim(),
        companyName: resolvedCompany,
        clientEmail: clientEmail.trim(),
        industry: industry.trim() || 'Technology',
      });
    } catch {
      setError('Unable to save client record.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectPlatformStep = async () => {
    setError(null);
    setSaving(true);
    try {
      const cfg = getOnboardingPlatformConfig(platform);
      const nextLabel = integrationName.trim() || cfg.defaultLabel;
      const nextUrl = instanceUrl.trim() || cfg.defaultUrlPlaceholder;
      setIntegrationName(nextLabel);
      setInstanceUrl(nextUrl);
      await persistProgress(5, {
        platform,
        integrationName: nextLabel,
        instanceUrl: nextUrl,
      });
    } catch {
      setError('Unable to save selected platform.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveIntegrationStep = async () => {
    setError(null);
    const validation = validateOnboardingStep(5, {
      platform,
      integrationName,
      instanceUrl,
    });
    if (!validation.valid) {
      setError(validation.error || 'Invalid integration configuration.');
      return;
    }
    setSaving(true);
    try {
      let nextIntegrationId = integrationId;
      if (!nextIntegrationId) {
        const res = await authFetch('/api/v1/integrations', {
          method: 'POST',
          body: JSON.stringify({
            name: integrationName.trim(),
            platform,
            clientId,
            instanceUrl: instanceUrl.trim() || undefined,
            apiKey: apiKey.trim() || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || 'Failed to register integration.');
          return;
        }
        nextIntegrationId = data.id;
        setIntegrationId(nextIntegrationId);
      }
      setConnectionTested(false);
      setConnectionVerified(false);
      setConnectionMessage('');
      await persistProgress(6, {
        integrationId: nextIntegrationId,
        integrationName: integrationName.trim(),
        instanceUrl: instanceUrl.trim(),
        connectionTested: false,
        connectionVerified: false,
      });
    } catch {
      setError('Unable to register integration.');
    } finally {
      setSaving(false);
    }
  };

  const handleRunConnectionTest = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await authFetch('/api/v1/integrations/test-connection', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          instanceUrl: instanceUrl.trim(),
          apiKey: apiKey.trim() || undefined,
          integrationId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const ok = Boolean(res.ok && data.connected !== false);
      const msg = data.message || (ok ? 'Connection check succeeded.' : 'Connection check failed.');
      setConnectionTested(true);
      setConnectionVerified(ok);
      setConnectionMessage(msg);

      await authFetch('/api/v1/onboarding', {
        method: 'PUT',
        body: JSON.stringify({
          currentStep: 6,
          data: {
            connectionTested: true,
            connectionVerified: ok,
            connectionMessage: msg,
          },
        }),
      });
    } catch {
      setConnectionTested(true);
      setConnectionVerified(false);
      setConnectionMessage('Network error while testing integration connectivity.');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncWorkflows = async (mode: 'sync' | 'webhook') => {
    setError(null);
    setSaving(true);
    try {
      if (mode === 'sync' && integrationId) {
        const res = await authFetch(`/api/v1/integrations/${integrationId}/sync`, {
          method: 'POST',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || 'Workflow synchronization failed.');
          return;
        }
        const wfCount = Number(data.workflowCount || 0);
        const execCount = Number(data.executionsIngested || 0);
        setSyncCompleted(true);
        setSyncedWorkflowCount(wfCount);
        setSyncedExecutionCount(execCount);
        setSyncMessage(`Synchronized integration cleanly (${wfCount} workflows tracked, ${execCount} new executions ingested).`);
        await persistProgress(7, {
          syncCompleted: true,
          syncedWorkflowCount: wfCount,
          syncedExecutionCount: execCount,
        });
      } else {
        const wfName = `${clientName || orgName || 'Workspace'} Verification Flow`;
        const res = await authFetch('/api/v1/webhooks/listener', {
          method: 'POST',
          body: JSON.stringify({
            agencyId: agency.id || undefined,
            workflowId: `wf_onb_${Date.now()}`,
            workflowName: wfName,
            clientName: clientName || orgName || 'Workspace Default',
            platform,
            status: 'SUCCESS',
            executionId: `exec_onb_${Date.now()}`,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setError(errData.error || 'Webhook verification request failed.');
          return;
        }
        setSyncCompleted(true);
        setSyncedWorkflowCount((prev) => Math.max(prev, 1));
        setSyncedExecutionCount((prev) => Math.max(prev, 1));
        setSyncMessage(`Verified webhook ingestion pipeline with test event for "${wfName}".`);
        await persistProgress(7, {
          syncCompleted: true,
          syncedWorkflowCount: Math.max(syncedWorkflowCount, 1),
          syncedExecutionCount: Math.max(syncedExecutionCount, 1),
        });
      }
      await onRefreshData();
    } catch {
      setError('Unable to run verification step.');
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await authFetch('/api/v1/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({
          data: {
            organizationName: orgName,
            contactEmail,
            timezone,
            clientId,
            clientName,
            platform,
            integrationId,
            syncCompleted,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.agency) {
        setAgencyContext(json.agency);
      }
      updateAgencyOnboarding(8, true);
      await onRefreshData();
      onNavigate('/dashboard');
    } catch {
      setError('Unable to finalize onboarding.');
    } finally {
      setSaving(false);
    }
  };

  const stepDef = ONBOARDING_STEPS[step - 1] || ONBOARDING_STEPS[0];
  const platformCfg = getOnboardingPlatformConfig(platform);

  return (
    <div className="min-h-screen flex flex-col bg-[#211D10] text-[#F0E9D9]">
      <header className="border-b border-[#363125] bg-[#211D10]">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-6">
          <ZevkarLogo size="sm" />
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline text-xs font-mono text-[#B8AE9B]">
              Workspace: <strong className="text-[#F0E9D9]">{orgName || agency.name}</strong>
            </span>
            <button
              type="button"
              onClick={() => onNavigate('/dashboard')}
              className="text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9]"
            >
              Exit to Console -&gt;
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-[860px] px-6 py-10 space-y-7">
        {/* 8-Step Progress Bar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[#B8AE9B]">
            <span className="font-mono text-[#C52A18] font-semibold">
              STEP {step} OF {ONBOARDING_STEPS.length}
            </span>
            <span className="font-medium text-[#F0E9D9]">{stepDef.title}</span>
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {ONBOARDING_STEPS.map((item) => (
              <button
                key={item.key}
                type="button"
                disabled={item.step > step && !agency.onboardingCompleted}
                onClick={() => {
                  if (item.step <= step || agency.onboardingCompleted) {
                    setError(null);
                    setStep(item.step);
                  }
                }}
                title={`${item.step}. ${item.shortLabel}`}
                className="group text-left space-y-1 disabled:cursor-default"
              >
                <div
                  className={`h-1.5 rounded-full transition-colors ${
                    item.step < step
                      ? 'bg-[#8CC59B]'
                      : item.step === step
                      ? 'bg-[#A51D0B]'
                      : 'bg-[#363125]'
                  }`}
                />
                <span className="hidden sm:block truncate text-[10px] font-mono text-[#B8AE9B] group-hover:text-[#F0E9D9]">
                  {item.step}. {item.shortLabel}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#363125] bg-[#171A1B] p-7 sm:p-9 space-y-6">
          {loadingInitial ? (
            <div className="py-12 text-center text-sm text-[#B8AE9B]">
              Restoring onboarding progress...
            </div>
          ) : (
            <>
              {error && (
                <div role="alert" className="rounded-lg border border-[#61231C] bg-[#2B1513] p-3 text-xs text-[#E88A7E]">
                  {error}
                </div>
              )}

              {/* STEP 1: Welcome */}
              {step === 1 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h1 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold text-[#F0E9D9]">
                      Welcome to Zevkar Reliability Control
                    </h1>
                    <p className="text-sm text-[#B8AE9B] leading-relaxed">
                      Your tenant workspace <strong className="text-[#F0E9D9]">{orgName || agency.name}</strong> has been provisioned cleanly with zero demo telemetry. Follow this 8-step activation flow to isolate your first client portfolio, connect a workflow runtime, test connectivity, and ingest your first execution check.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="rounded-xl border border-[#363125] bg-[#211D10] p-4 space-y-1.5">
                      <Building2 className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                      <div className="font-semibold text-[#F0E9D9]">Tenant Isolation</div>
                      <p className="text-[#B8AE9B]">Strict workspace scoping for clients, credentials, incidents, and audit history.</p>
                    </div>
                    <div className="rounded-xl border border-[#363125] bg-[#211D10] p-4 space-y-1.5">
                      <Cable className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                      <div className="font-semibold text-[#F0E9D9]">Verified Connectors</div>
                      <p className="text-[#B8AE9B]">Real HTTP reachability verification for n8n REST APIs and inbound webhook streams.</p>
                    </div>
                    <div className="rounded-xl border border-[#363125] bg-[#211D10] p-4 space-y-1.5">
                      <ShieldCheck className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                      <div className="font-semibold text-[#F0E9D9]">Guarded Recovery</div>
                      <p className="text-[#B8AE9B]">Risk-scored retries with mandatory human approval gates for sensitive workflows.</p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleStep1Next}
                      className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]"
                    >
                      <span>{saving ? 'Starting...' : 'Start Workspace Setup'}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Organization Profile */}
              {step === 2 && (
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <h1 className="font-[var(--font-display)] text-2xl font-bold text-[#F0E9D9]">
                      2. Configure organization profile
                    </h1>
                    <p className="text-sm text-[#B8AE9B]">
                      Set your agency or engineering team name, primary operations contact, and display timezone.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="onb-org-name" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
                        Organization Name
                      </label>
                      <input
                        id="onb-org-name"
                        type="text"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="e.g. Northstar Automation Ops"
                        className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="onb-email" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
                          Operations Contact Email
                        </label>
                        <input
                          id="onb-email"
                          type="email"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                        />
                      </div>
                      <div>
                        <label htmlFor="onb-tz" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
                          Display Timezone
                        </label>
                        <select
                          id="onb-tz"
                          value={timezone}
                          onChange={(e) => setTimezone(e.target.value)}
                          className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                        >
                          <option value="UTC">UTC</option>
                          <option value="America/New_York">America/New_York</option>
                          <option value="America/Chicago">America/Chicago</option>
                          <option value="America/Los_Angeles">America/Los_Angeles</option>
                          <option value="Europe/London">Europe/London</option>
                          <option value="Europe/Berlin">Europe/Berlin</option>
                          <option value="Asia/Kolkata">Asia/Kolkata</option>
                          <option value="Asia/Singapore">Asia/Singapore</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSaveOrgStep}
                      className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]"
                    >
                      <span>{saving ? 'Saving...' : 'Save & Continue'}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: First Client or Project */}
              {step === 3 && (
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <h1 className="font-[var(--font-display)] text-2xl font-bold text-[#F0E9D9]">
                      3. Add your first client or internal project
                    </h1>
                    <p className="text-sm text-[#B8AE9B]">
                      Every monitored workflow and incident rolls up to a client portfolio or internal project boundary.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="onb-client-name" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
                        Client / Project Name
                      </label>
                      <input
                        id="onb-client-name"
                        type="text"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="e.g. Acme Commerce Ops"
                        className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                      />
                    </div>
                    <div>
                      <label htmlFor="onb-client-company" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
                        Legal Company / Team Name
                      </label>
                      <input
                        id="onb-client-company"
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="e.g. Acme Retail Group LLC"
                        className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                      />
                    </div>
                    <div>
                      <label htmlFor="onb-client-email" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
                        Stakeholder Email
                      </label>
                      <input
                        id="onb-client-email"
                        type="email"
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                        className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                      />
                    </div>
                    <div>
                      <label htmlFor="onb-client-industry" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
                        Industry / Domain
                      </label>
                      <input
                        id="onb-client-industry"
                        type="text"
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSaveClientStep}
                      className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]"
                    >
                      <Users className="h-4 w-4" aria-hidden="true" />
                      <span>{saving ? 'Saving...' : 'Create Client & Continue'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: Select Automation Platform */}
              {step === 4 && (
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <h1 className="font-[var(--font-display)] text-2xl font-bold text-[#F0E9D9]">
                      4. Select your automation platform
                    </h1>
                    <p className="text-sm text-[#B8AE9B]">
                      Choose the runtime to connect for <strong className="text-[#F0E9D9]">{clientName || orgName}</strong>.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ONBOARDING_PLATFORM_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setPlatform(opt.id);
                          setIntegrationName(opt.defaultLabel);
                          setInstanceUrl(opt.defaultUrlPlaceholder);
                        }}
                        className={`rounded-xl border p-4 text-left transition-colors ${
                          platform === opt.id
                            ? 'border-[#A51D0B] bg-[#202326]'
                            : 'border-[#363125] bg-[#211D10] hover:border-[#B8AE9B]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-[#F0E9D9]">{opt.label}</span>
                          <span className="rounded border border-[#363125] bg-[#171A1B] px-2 py-0.5 font-mono text-[10px] text-[#B8AE9B]">
                            {opt.badge}
                          </span>
                        </div>
                        <div className="text-xs text-[#B8AE9B] mt-1.5 leading-relaxed">{opt.description}</div>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSelectPlatformStep}
                      className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]"
                    >
                      <span>{saving ? 'Saving...' : 'Continue to Connection'}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 5: Configure Integration */}
              {step === 5 && (
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <h1 className="font-[var(--font-display)] text-2xl font-bold text-[#F0E9D9]">
                      5. Connect {platformCfg.label} integration
                    </h1>
                    <p className="text-sm text-[#B8AE9B]">
                      Credentials are stored encrypted server-side and never returned back in API responses. Use any <code className="font-mono text-[#F0E9D9]">.example</code> URL for sandbox verification.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="onb-int-name" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
                        Integration Name
                      </label>
                      <input
                        id="onb-int-name"
                        type="text"
                        value={integrationName}
                        onChange={(e) => setIntegrationName(e.target.value)}
                        className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                      />
                    </div>

                    <div>
                      <label htmlFor="onb-int-url" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
                        {platformCfg.id === 'custom_python' ? 'Source Service Identifier URL' : 'Instance / Webhook URL'}
                      </label>
                      <input
                        id="onb-int-url"
                        type="url"
                        value={instanceUrl}
                        onChange={(e) => setInstanceUrl(e.target.value)}
                        placeholder={platformCfg.defaultUrlPlaceholder}
                        className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 font-mono text-xs text-[#F0E9D9]"
                      />
                    </div>

                    {platformCfg.id !== 'custom_python' && (
                      <div>
                        <label htmlFor="onb-int-key" className="block text-xs font-semibold text-[#F0E9D9] mb-1.5">
                          API Key {platformCfg.id === 'n8n' ? '(Required for live external n8n URLs)' : '(Optional)'}
                        </label>
                        <input
                          id="onb-int-key"
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="Paste connector API secret"
                          className="w-full rounded-md border border-[#363125] bg-[#211D10] px-3.5 py-2.5 text-sm text-[#F0E9D9]"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(4)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSaveIntegrationStep}
                      className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]"
                    >
                      <span>{saving ? 'Saving...' : 'Save Integration & Continue'}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 6: Test Connection */}
              {step === 6 && (
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <h1 className="font-[var(--font-display)] text-2xl font-bold text-[#F0E9D9]">
                      6. Test integration connectivity
                    </h1>
                    <p className="text-sm text-[#B8AE9B]">
                      Run a live probe against <span className="font-mono text-[#F0E9D9]">{instanceUrl || integrationName}</span> before syncing workflows.
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#363125] bg-[#211D10] p-5 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#B8AE9B]">Integration</span>
                      <span className="font-semibold text-[#F0E9D9]">{integrationName} ({platform})</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#B8AE9B]">Endpoint</span>
                      <span className="font-mono text-[#F0E9D9] truncate max-w-[360px]">{instanceUrl || 'Webhook Gateway'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#B8AE9B]">Probe State</span>
                      {!connectionTested ? (
                        <span className="font-mono text-[#B8AE9B]">NOT_TESTED</span>
                      ) : connectionVerified ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[#8CC59B]">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> VERIFIED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-mono text-[#E88A7E]">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> FAILED
                        </span>
                      )}
                    </div>
                    {connectionMessage && (
                      <p className={`pt-2 border-t border-[#363125] leading-relaxed ${connectionVerified ? 'text-[#8CC59B]' : 'text-[#E88A7E]'}`}>
                        {connectionMessage}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(5)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Edit Connection</span>
                    </button>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleRunConnectionTest}
                        className="inline-flex items-center gap-2 rounded-md border border-[#363125] bg-[#211D10] hover:border-[#B8AE9B] px-4 py-2.5 text-xs font-semibold text-[#F0E9D9]"
                      >
                        <FlaskConical className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
                        <span>{saving ? 'Testing...' : connectionTested ? 'Retry Connection Test' : 'Run Connection Test'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => persistProgress(7)}
                        className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]"
                      >
                        <span>Continue to Sync</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 7: Sync Workflows & Verify Import */}
              {step === 7 && (
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <h1 className="font-[var(--font-display)] text-2xl font-bold text-[#F0E9D9]">
                      7. Sync workflows or verify webhook ingestion
                    </h1>
                    <p className="text-sm text-[#B8AE9B]">
                      Pull workflows from your connected instance or verify inbound webhook event ingestion before launching the console.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSyncWorkflows('sync')}
                      className="rounded-xl border border-[#363125] bg-[#211D10] hover:border-[#A51D0B] p-4 text-left space-y-2 transition-colors"
                    >
                      <div className="inline-flex items-center gap-2 text-sm font-bold text-[#F0E9D9]">
                        <RefreshCw className={`h-4 w-4 text-[#C52A18] ${saving ? 'animate-spin' : ''}`} aria-hidden="true" />
                        <span>Run Platform Sync Check</span>
                      </div>
                      <p className="text-xs text-[#B8AE9B]">
                        Synchronize workflow definitions and execution watermarks from {integrationName}.
                      </p>
                    </button>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSyncWorkflows('webhook')}
                      className="rounded-xl border border-[#363125] bg-[#211D10] hover:border-[#A51D0B] p-4 text-left space-y-2 transition-colors"
                    >
                      <div className="inline-flex items-center gap-2 text-sm font-bold text-[#F0E9D9]">
                        <Webhook className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                        <span>Send Verification Webhook Event</span>
                      </div>
                      <p className="text-xs text-[#B8AE9B]">
                        Verify end-to-end ingestion at <code className="font-mono text-[#F0E9D9]">/api/v1/webhooks/listener</code>.
                      </p>
                    </button>
                  </div>

                  {syncMessage && (
                    <div className="rounded-xl border border-[#2F5E3F] bg-[#14261B] p-4 text-xs text-[#8CC59B] space-y-1">
                      <div className="font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        <span>Verification Recorded</span>
                      </div>
                      <p>{syncMessage}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(6)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => persistProgress(8)}
                      className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-5 py-2.5 text-sm font-semibold text-[#F0E9D9]"
                    >
                      <span>Review &amp; Finish</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 8: Complete & Launch */}
              {step === 8 && (
                <div className="space-y-6 py-2">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-8 w-8 text-[#8CC59B] shrink-0" aria-hidden="true" />
                    <div>
                      <h1 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold text-[#F0E9D9]">
                        8. Ready to Launch Console
                      </h1>
                      <p className="text-sm text-[#B8AE9B]">
                        Review your initial setup for <strong className="text-[#F0E9D9]">{orgName || agency.name}</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#363125] bg-[#211D10] p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="text-[#B8AE9B]">Organization</div>
                      <div className="font-semibold text-[#F0E9D9] mt-0.5">{orgName || agency.name} ({timezone})</div>
                    </div>
                    <div>
                      <div className="text-[#B8AE9B]">First Client / Project</div>
                      <div className="font-semibold text-[#F0E9D9] mt-0.5">{clientName || 'Configure inside console'}</div>
                    </div>
                    <div>
                      <div className="text-[#B8AE9B]">Primary Platform</div>
                      <div className="font-semibold text-[#F0E9D9] mt-0.5">{integrationName} ({platform})</div>
                    </div>
                    <div>
                      <div className="text-[#B8AE9B]">Verification State</div>
                      <div className="font-mono text-[#8CC59B] mt-0.5">
                        {syncCompleted ? `VERIFIED (${syncedWorkflowCount} workflows)` : connectionVerified ? 'CONNECTION_VERIFIED' : 'WORKSPACE_READY'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(7)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleCompleteOnboarding}
                      className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-6 py-3 text-sm font-semibold text-[#F0E9D9]"
                    >
                      <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                      <span>{saving ? 'Completing...' : 'Complete Onboarding & Open Console'}</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

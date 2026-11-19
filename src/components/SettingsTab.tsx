import React, { useState, useEffect } from 'react';
import { Bell, Download, Copy, Check, ExternalLink, Clock, ShieldCheck } from 'lucide-react';
import { Agency, NotificationPreferenceItem, Severity } from '../types';
import { COMMON_TIMEZONES, formatInTimezone } from '../lib/datetime';

interface SettingsTabProps {
  agency: Agency;
  timezone: string;
  notificationPreferences?: NotificationPreferenceItem[];
  onUpdateAgencyName: (name: string) => Promise<void>;
  onUpdateAgencyProfile?: (updates: { name: string; contactEmail: string }) => Promise<void>;
  onUpdateTimezone: (timezone: string) => Promise<void>;
  onUpdateNotificationPreferences?: (preferences: NotificationPreferenceItem[]) => Promise<void>;
}

const DEFAULT_PREFERENCES: NotificationPreferenceItem[] = [
  { channel: 'IN_APP', minSeverity: 'LOW', isEnabled: true },
  { channel: 'EMAIL', minSeverity: 'HIGH', isEnabled: true },
  { channel: 'WEBHOOK', minSeverity: 'CRITICAL', isEnabled: false },
];

export const SettingsTab: React.FC<SettingsTabProps> = ({
  agency,
  timezone,
  notificationPreferences = DEFAULT_PREFERENCES,
  onUpdateAgencyName,
  onUpdateAgencyProfile,
  onUpdateTimezone,
  onUpdateNotificationPreferences,
}) => {
  const [agencyName, setAgencyName] = useState(agency.name);
  const [contactEmail, setContactEmail] = useState(agency.contactEmail || '');
  const [selectedTimezone, setSelectedTimezone] = useState(timezone);
  const [localPrefs, setLocalPrefs] = useState<NotificationPreferenceItem[]>(
    notificationPreferences.length > 0 ? notificationPreferences : DEFAULT_PREFERENCES
  );
  const [isSaved, setIsSaved] = useState(false);
  const [isPrefsSaved, setIsPrefsSaved] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const webhookListenerUrl = `${window.location.origin}/api/v1/webhooks/listener`;

  useEffect(() => {
    setAgencyName(agency.name);
    setContactEmail(agency.contactEmail || '');
  }, [agency.name, agency.contactEmail]);

  useEffect(() => {
    setSelectedTimezone(timezone);
  }, [timezone]);

  useEffect(() => {
    if (notificationPreferences.length > 0) {
      setLocalPrefs(notificationPreferences);
    }
  }, [notificationPreferences]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateAgencyProfile) {
      await onUpdateAgencyProfile({
        name: agencyName.trim() || agency.name,
        contactEmail: contactEmail.trim() || agency.contactEmail,
      });
    } else {
      await onUpdateAgencyName(agencyName.trim() || agency.name);
    }
    if (selectedTimezone !== timezone) {
      await onUpdateTimezone(selectedTimezone);
    }
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleToggleChannel = (channel: 'IN_APP' | 'EMAIL' | 'WEBHOOK') => {
    setLocalPrefs((prev) =>
      prev.map((pref) =>
        pref.channel === channel ? { ...pref, isEnabled: !pref.isEnabled } : pref
      )
    );
  };

  const handleSeverityChange = (channel: 'IN_APP' | 'EMAIL' | 'WEBHOOK', minSeverity: Severity) => {
    setLocalPrefs((prev) =>
      prev.map((pref) =>
        pref.channel === channel ? { ...pref, minSeverity } : pref
      )
    );
  };

  const handleSavePreferences = async () => {
    if (!onUpdateNotificationPreferences) return;
    await onUpdateNotificationPreferences(localPrefs);
    setIsPrefsSaved(true);
    setTimeout(() => setIsPrefsSaved(false), 3000);
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookListenerUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const handleExportData = () => {
    const data = {
      agency,
      timezone: selectedTimezone,
      notificationPreferences: localPrefs,
      timestamp: new Date().toISOString(),
      exporter: 'Zevkar AI v1.0',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zevkar-ai-${agency.slug}-export.json`;
    a.click();
  };

  const timezoneChoices = COMMON_TIMEZONES.some((t) => t.value === selectedTimezone)
    ? COMMON_TIMEZONES
    : [{ value: selectedTimezone, label: `${selectedTimezone} (Browser Detected)` }, ...COMMON_TIMEZONES];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
          Workspace Settings &amp; Security Vault
        </h2>
        <p className="text-xs text-[#B5AA99]">
          Organization profile, alert routing, UTC-to-local timezone preference, and webhook configuration
        </p>
      </div>

      {/* Organization Profile & Timezone Form */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-6">
        <h3 className="text-sm font-bold text-[#E9E5DC] mb-4">Organization Profile &amp; Timezone</h3>
        <form onSubmit={handleSave} className="space-y-4 max-w-xl text-xs">
          <div>
            <label className="block text-[#E9E5DC] font-semibold mb-1">Workspace / Agency Name</label>
            <input
              type="text"
              required
              minLength={2}
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
            />
          </div>

          <div>
            <label className="block text-[#E9E5DC] font-semibold mb-1">Operations Contact Email</label>
            <input
              type="email"
              required
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="ops@company.com"
              className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
            />
          </div>

          <div>
            <label htmlFor="workspace-timezone" className="block text-[#E9E5DC] font-semibold mb-1">
              Display Timezone (All telemetry stored in UTC)
            </label>
            <select
              id="workspace-timezone"
              value={selectedTimezone}
              onChange={(e) => setSelectedTimezone(e.target.value)}
              className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
            >
              {timezoneChoices.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#B5AA99] font-mono tabular-nums">
              <Clock className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
              <span>Preview: {formatInTimezone(new Date().toISOString(), selectedTimezone, 'datetime')}</span>
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 font-semibold text-[#E9E5DC] transition-colors"
            >
              Update Settings
            </button>
            {isSaved && <span className="text-[#8CC59B] text-xs font-semibold">Changes saved!</span>}
          </div>
        </form>
      </div>

      {/* Alert & Notification Preferences */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
          <h3 className="text-sm font-bold text-[#E9E5DC]">Alert &amp; Notification Preferences</h3>
        </div>
        <p className="text-xs text-[#B5AA99]">
          Configure minimum severity thresholds and delivery channels for incident alerts and recovery approvals.
        </p>

        <div className="space-y-3 max-w-xl text-xs">
          {localPrefs.map((pref) => (
            <div
              key={pref.channel}
              className="rounded-lg border border-[#383838] bg-[#171717] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pref.isEnabled}
                  onChange={() => handleToggleChannel(pref.channel)}
                  className="rounded border-[#383838] bg-[#202020] accent-[#A51B0B]"
                />
                <span className="font-mono font-semibold text-[#E9E5DC]">{pref.channel}</span>
              </label>

              <div className="flex items-center gap-2">
                <span className="text-[#B5AA99]">Min Severity:</span>
                <select
                  value={pref.minSeverity}
                  onChange={(e) => handleSeverityChange(pref.channel, e.target.value as Severity)}
                  className="rounded-md border border-[#383838] bg-[#202020] px-2.5 py-1 text-xs text-[#E9E5DC]"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSavePreferences}
              className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 font-semibold text-[#E9E5DC] transition-colors"
            >
              Save Notification Preferences
            </button>
            {isPrefsSaved && (
              <span className="text-[#8CC59B] text-xs font-semibold">Preferences updated!</span>
            )}
          </div>
        </div>
      </div>

      {/* Webhook Ingestion & Credential Security */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#8CC59B]" aria-hidden="true" />
          <h3 className="text-sm font-bold text-[#E9E5DC]">Webhook Gateway &amp; Credential Protection</h3>
        </div>

        <p className="text-xs text-[#B5AA99] max-w-2xl leading-relaxed">
          All integration API keys are stored encrypted server-side and are never returned by API read endpoints. Use the tenant-authenticated webhook listener below to stream execution failures.
        </p>

        <div className="space-y-3 text-xs max-w-2xl">
          <div>
            <label className="block text-[#B5AA99] mb-1">Workspace Webhook Listener URL</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookListenerUrl}
                className="flex-1 font-mono rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
              />
              <button
                type="button"
                onClick={handleCopyWebhook}
                className="rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-3 py-2 text-[#E9E5DC] inline-flex items-center gap-1.5"
              >
                {copiedWebhook ? <Check className="h-3.5 w-3.5 text-[#8CC59B]" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedWebhook ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-[#383838] bg-[#171717] p-3 text-[11px] text-[#B5AA99]">
            Workspace ID header: <code className="font-mono text-[#E9E5DC]">x-agency-id: {agency.id || 'authenticated-session'}</code>
          </div>
        </div>
      </div>

      {/* Observability */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-6">
        <h3 className="text-sm font-bold text-[#E9E5DC] mb-2">Prometheus &amp; Grafana Observability</h3>
        <p className="text-xs text-[#B5AA99] mb-3">
          Scrape live agency incident counts and fleet health scores directly from the backend metrics endpoint.
        </p>

        <a
          href="/metrics"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-4 py-2 text-xs text-[#E9E5DC] font-mono transition-colors"
        >
          <span>GET /metrics (Prometheus Format)</span>
          <ExternalLink className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
        </a>
      </div>

      {/* Data Export */}
      <div className="rounded-xl border border-[#383838] bg-[#202020] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-[#E9E5DC]">Full Workspace Data Export</h3>
          <p className="text-xs text-[#B5AA99] mt-0.5">
            Download workspace configuration and metadata as JSON.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportData}
          className="inline-flex items-center gap-2 rounded-md border border-[#383838] bg-[#171717] hover:border-[#B5AA99] px-4 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
        >
          <Download className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
          <span>Export JSON Archive</span>
        </button>
      </div>
    </div>
  );
};

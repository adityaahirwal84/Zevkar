import React, { useState } from 'react';
import { CheckCircle2, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { Agency, PlatformType } from '../types';

interface OnboardingModalProps {
  onClose: () => void;
  onComplete: (data: any) => Promise<void>;
  currentAgency: Agency;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  onClose,
  onComplete,
  currentAgency,
}) => {
  const [step, setStep] = useState(1);
  const [agencyName, setAgencyName] = useState(currentAgency.name);
  const [teamEmail, setTeamEmail] = useState('');
  const [clientName, setClientName] = useState('Acme Corp');
  const [clientEmail, setClientEmail] = useState('ops@acmecorp.com');
  const [platform, setPlatform] = useState<PlatformType>('n8n');
  const [n8nUrl, setN8nUrl] = useState('https://n8n.acme.internal/api/v1');

  const totalSteps = 6;

  const handleNext = async () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      await onComplete({
        agencyName,
        teamEmail,
        clientName,
        clientEmail,
        platform,
        n8nUrl,
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-xl border border-[#383838] bg-[#202020] p-6 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-[#383838]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 px-2 items-center justify-center rounded border border-[#383838] bg-[#171717] text-[#C52A18] font-mono font-bold text-xs tabular-nums">
              {step}/{totalSteps}
            </span>
            <span className="font-[var(--font-display)] text-sm font-bold text-[#E9E5DC]">
              Agency Onboarding Wizard
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-[#B5AA99] hover:text-[#E9E5DC] p-1"
            aria-label="Close wizard"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 h-1.5 w-full rounded bg-[#171717] overflow-hidden">
          <div
            className="h-full bg-[#A51B0B] transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>

        <div className="py-6 min-h-[220px] flex flex-col justify-center text-xs">
          {step === 1 && (
            <div className="space-y-3">
              <h3 className="text-base font-bold text-[#E9E5DC]">Step 1: Welcome to Zevkar AI</h3>
              <p className="text-[#B5AA99] leading-relaxed">
                Configure multi-tenant monitoring for your automation fleet, assign client portfolios, and connect your first n8n, Zapier, or Make endpoint.
              </p>
              <div className="rounded-lg border border-[#383838] bg-[#171717] p-3.5 text-[#E9E5DC] space-y-1">
                <div>• Multi-tenant client portfolio isolation</div>
                <div>• Real-time webhook failure capture</div>
                <div>• Gemini AI root-cause diagnosis &amp; approval gates</div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h3 className="text-base font-bold text-[#E9E5DC]">Step 2: Agency Identity</h3>
              <p className="text-[#B5AA99]">What is the display name of your automation workspace?</p>
              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Agency Name</label>
                <input
                  type="text"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h3 className="text-base font-bold text-[#E9E5DC]">Step 3: Invite Team Engineers</h3>
              <p className="text-[#B5AA99]">Invite colleagues to triage incidents and authorize recoveries.</p>
              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Engineer Email Address</label>
                <input
                  type="email"
                  value={teamEmail}
                  onChange={(e) => setTeamEmail(e.target.value)}
                  placeholder="colleague@agency.io"
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <h3 className="text-base font-bold text-[#E9E5DC]">Step 4: Add Your First Client Account</h3>
              <p className="text-[#B5AA99]">Every client has isolated workflows, incidents, and health metrics.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#E9E5DC] font-semibold mb-1">Client Name</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                  />
                </div>
                <div>
                  <label className="block text-[#E9E5DC] font-semibold mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <h3 className="text-base font-bold text-[#E9E5DC]">Step 5: Connect Automation Platform</h3>
              <p className="text-[#B5AA99]">Select which platform powers this client&apos;s workflows.</p>
              <div className="grid grid-cols-3 gap-2">
                {(['n8n', 'Zapier', 'Make'] as PlatformType[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    className={`p-3 rounded-md border text-center font-bold transition-colors ${
                      platform === p
                        ? 'border-[#A51B0B] bg-[#211D10] text-[#E9E5DC]'
                        : 'border-[#383838] bg-[#171717] text-[#B5AA99]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Endpoint or Webhook Target</label>
                <input
                  type="text"
                  value={n8nUrl}
                  onChange={(e) => setN8nUrl(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3 text-center py-2">
              <div className="h-12 w-12 rounded-lg border border-[#2E4A36] bg-[#1C2A20] text-[#8CC59B] flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold text-[#E9E5DC]">Setup Ready</h3>
              <p className="text-[#B5AA99] max-w-sm mx-auto">
                Your agency environment is ready with active health monitoring, AI diagnosis, and approval gates.
              </p>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-[#383838] flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-1 text-[#B5AA99] hover:text-[#E9E5DC] text-xs font-semibold"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
          >
            <span>{step === totalSteps ? 'Launch Agency Dashboard' : 'Next Step'}</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

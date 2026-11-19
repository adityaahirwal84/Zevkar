import React, { useState } from 'react';
import { Terminal, Copy, Check, Key, Webhook, ShieldAlert } from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { MarketingShell } from './MarketingShell';
import { StatusBadge } from '../marketing/StatusBadge';
import { CTASection } from '../marketing/CTASection';

interface DevelopersPageProps {
  onNavigate: (route: AppRoute) => void;
}

const PYTHON_SNIPPET = `import hmac, hashlib, json, httpx

WEBHOOK_URL = "https://your-instance.example.com/api/v1/webhooks/listener"
WEBHOOK_SECRET = "whsec_your_hmac_signing_secret"

payload = {
    "workflowId": "wf_billing_sync",
    "workflowName": "Stripe Settlement -> NetSuite Invoice",
    "clientName": "FinEdge Global",
    "platform": "custom_python",
    "executionId": "exec_py_20260412_01",
    "error": "HTTP 401 Unauthorized: Restricted API token revoked."
}

raw_body = json.dumps(payload).encode("utf-8")
sig = hmac.new(WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()

response = httpx.post(
    WEBHOOK_URL,
    content=raw_body,
    headers={
        "Content-Type": "application/json",
        "X-Webhook-Signature": f"sha256={sig}",
    },
    timeout=10.0,
)
print(response.status_code, response.json())`;

const FASTAPI_SNIPPET = `from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import httpx

app = FastAPI()
ZEVKAR_WEBHOOK = "https://your-instance.example.com/api/v1/webhooks/listener"

@app.exception_handler(Exception)
async def report_unhandled_automation_error(request: Request, exc: Exception):
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(
            ZEVKAR_WEBHOOK,
            json={
                "workflowId": "fastapi_order_pipeline",
                "workflowName": f"FastAPI Route {request.url.path}",
                "platform": "custom_python",
                "executionId": request.headers.get("X-Request-ID", "req_unknown"),
                "error": f"{type(exc).__name__}: {str(exc)}",
            },
        )
    return JSONResponse(status_code=500, content={"detail": "Internal automation error"})`;

const ERROR_JSON_EXAMPLE = `{
  "error": "APPROVAL_REQUIRED",
  "message": "This operation requires agency human approval before execution.",
  "riskReason": "High financial impact workflow requires manual review prior to retry."
}`;

const ENDPOINTS = [
  { method: 'POST', path: '/api/v1/webhooks/listener', status: 'Available', tone: 'success' as const, purpose: 'Ingest automation failure events and create deduplicated incidents' },
  { method: 'GET', path: '/api/v1/incidents', status: 'Available', tone: 'success' as const, purpose: 'List captured workflow incidents and current triage status' },
  { method: 'POST', path: '/api/v1/diagnosis/analyze', status: 'Available', tone: 'success' as const, purpose: 'Trigger Gemini AI or deterministic root-cause diagnosis on an incident' },
  { method: 'POST', path: '/api/v1/recovery/execute', status: 'Available', tone: 'success' as const, purpose: 'Execute idempotent workflow recovery (enforces approval gate)' },
  { method: 'GET', path: '/api/v1/approvals', status: 'Available', tone: 'success' as const, purpose: 'Inspect quarantined recovery approvals awaiting authorization' },
  { method: 'GET', path: '/api/v1/audit-logs', status: 'Available', tone: 'success' as const, purpose: 'Retrieve chronological audit entries across workspace mutations' },
  { method: 'GET', path: '/metrics', status: 'Available', tone: 'success' as const, purpose: 'Prometheus exposition endpoint for Grafana scraping' },
  { method: 'GET', path: '/healthz', status: 'Available', tone: 'success' as const, purpose: 'Runtime mode, persistence, and Gemini configuration status' },
  { method: 'POST', path: '/api/v1/webhooks/replay-batch', status: 'Coming Soon', tone: 'neutral' as const, purpose: 'Bulk replay queued dead-letter payloads across client workspaces' },
];

export const DevelopersPage: React.FC<DevelopersPageProps> = ({ onNavigate }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <MarketingShell currentRoute="/developers" onNavigate={onNavigate}>
      <section className="border-b border-[#2E2D26] bg-[#1B180D] py-16 md:py-24">
        <div className="mx-auto max-w-[1320px] px-6">
          <div className="max-w-3xl space-y-5">
            <div className="text-xs font-medium uppercase tracking-wider text-[#C52A18]">
              Developers &amp; API Reference
            </div>
            <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#E8E3D8] leading-tight">
              Instrument Python scripts, FastAPI services, and webhook pipelines in minutes.
            </h1>
            <p className="text-base sm:text-lg text-[#A69B88] leading-relaxed">
              Every endpoint documented below maps directly to active routes implemented in Zevkar AI&apos;s backend. Planned capabilities are explicitly marked.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#171717] py-16 md:py-20">
        <div className="mx-auto max-w-[1320px] px-6 space-y-12">
          {/* Quick Concept Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl border border-[#383838] bg-[#202020] p-6 space-y-2.5">
              <Webhook className="h-5 w-5 text-[#C52A18]" aria-hidden="true" />
              <h2 className="text-base font-bold text-[#E9E5DC]">Webhook Ingestion</h2>
              <p className="text-sm text-[#B5AA99] leading-relaxed">
                Send execution failures via JSON <code className="font-mono text-[#E9E5DC]">POST /api/v1/webhooks/listener</code>. Errors are classified automatically and routed to the incident queue.
              </p>
            </div>
            <div className="rounded-xl border border-[#383838] bg-[#202020] p-6 space-y-2.5">
              <Key className="h-5 w-5 text-[#C52A18]" aria-hidden="true" />
              <h2 className="text-base font-bold text-[#E9E5DC]">Authentication &amp; Signing</h2>
              <p className="text-sm text-[#B5AA99] leading-relaxed">
                Use workspace Bearer tokens for console APIs and verify webhook deliveries with <code className="font-mono text-[#E9E5DC]">X-Webhook-Signature</code> HMAC-SHA256 digests.
              </p>
            </div>
            <div className="rounded-xl border border-[#383838] bg-[#202020] p-6 space-y-2.5">
              <ShieldAlert className="h-5 w-5 text-[#C52A18]" aria-hidden="true" />
              <h2 className="text-base font-bold text-[#E9E5DC]">Approval Enforcement</h2>
              <p className="text-sm text-[#B5AA99] leading-relaxed">
                Calling <code className="font-mono text-[#E9E5DC]">/api/v1/recovery/execute</code> on a protected financial workflow returns HTTP <code className="font-mono text-[#E9E5DC]">403 APPROVAL_REQUIRED</code> until approved.
              </p>
            </div>
          </div>

          {/* Code Examples */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="rounded-xl border border-[#383838] bg-[#202020] overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#383838] bg-[#171717] px-5 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#E9E5DC]">
                  <Terminal className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                  <span>Python Worker Exception Hook (HTTPX)</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy('py', PYTHON_SNIPPET)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#B5AA99] hover:text-[#E9E5DC]"
                >
                  {copiedId === 'py' ? <Check className="h-3.5 w-3.5 text-[#8CC59B]" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedId === 'py' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="p-5 overflow-x-auto font-mono text-xs leading-relaxed text-[#E9E5DC]">
                <code>{PYTHON_SNIPPET}</code>
              </pre>
            </div>

            <div className="rounded-xl border border-[#383838] bg-[#202020] overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#383838] bg-[#171717] px-5 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#E9E5DC]">
                  <Terminal className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                  <span>FastAPI Global Exception Handler</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy('fastapi', FASTAPI_SNIPPET)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#B5AA99] hover:text-[#E9E5DC]"
                >
                  {copiedId === 'fastapi' ? <Check className="h-3.5 w-3.5 text-[#8CC59B]" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedId === 'fastapi' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="p-5 overflow-x-auto font-mono text-xs leading-relaxed text-[#E9E5DC]">
                <code>{FASTAPI_SNIPPET}</code>
              </pre>
            </div>
          </div>

          {/* Endpoint Reference Table */}
          <div className="rounded-xl border border-[#383838] bg-[#202020] overflow-hidden">
            <div className="border-b border-[#383838] px-6 py-4">
              <h2 className="font-[var(--font-display)] text-lg font-bold text-[#E9E5DC]">
                REST API Endpoints
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-[#383838] bg-[#171717] text-xs text-[#B5AA99]">
                  <tr>
                    <th className="px-6 py-3.5 font-semibold">Method</th>
                    <th className="px-6 py-3.5 font-semibold">Endpoint Path</th>
                    <th className="px-6 py-3.5 font-semibold">Status</th>
                    <th className="px-6 py-3.5 font-semibold">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#383838]">
                  {ENDPOINTS.map((ep) => (
                    <tr key={ep.path} className="hover:bg-[#171717]/60">
                      <td className="px-6 py-3.5 font-mono text-xs font-semibold text-[#C52A18]">{ep.method}</td>
                      <td className="px-6 py-3.5 font-mono text-xs text-[#E9E5DC]">{ep.path}</td>
                      <td className="px-6 py-3.5">
                        <StatusBadge label={ep.status} tone={ep.tone} />
                      </td>
                      <td className="px-6 py-3.5 text-xs sm:text-sm text-[#B5AA99]">{ep.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Error Response Contract */}
          <div className="rounded-xl border border-[#383838] bg-[#202020] p-6 space-y-3">
            <h3 className="text-sm font-bold text-[#E9E5DC]">Example Safety Gate Error Response (HTTP 403)</h3>
            <pre className="rounded-lg border border-[#383838] bg-[#171717] p-4 font-mono text-xs text-[#E88A7E] overflow-x-auto">
              <code>{ERROR_JSON_EXAMPLE}</code>
            </pre>
          </div>
        </div>
      </section>

      <CTASection onNavigate={onNavigate} />
    </MarketingShell>
  );
};

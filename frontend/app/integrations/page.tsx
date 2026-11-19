'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { NextMarketingShell } from '@/components/NextMarketingShell';
import { INTEGRATION_DIRECTORY, IntegrationAvailability } from '@/lib/site-content';

const FILTERS: Array<'All' | IntegrationAvailability> = ['All', 'Available', 'In Development', 'Planned'];

export default function IntegrationsPage() {
  const [filter, setFilter] = useState<'All' | IntegrationAvailability>('All');
  const [expandedId, setExpandedId] = useState<string | null>('n8n');

  const visible = INTEGRATION_DIRECTORY.filter((entry) =>
    filter === 'All' ? true : entry.availability === filter
  );

  return (
    <NextMarketingShell activePath="/integrations">
      <section className="mx-auto max-w-[1320px] px-6 py-16 md:py-24 space-y-10">
        <div className="max-w-3xl space-y-4">
          <div className="text-xs font-medium tracking-wide text-[#C52A18]">Integrations Directory</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#F0E9D9]">
            Connect n8n, webhooks, Python, and FastAPI services.
          </h1>
          <p className="text-base text-[#B8AE9B] leading-relaxed">
            Every platform status below reflects verified codebase support: Available connectors are active today, In Development items are partially wired via catch-hooks, and Planned items mark future roadmap work.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-lg bg-[#171A1B] border border-[#363125] w-fit">
          {FILTERS.map((f) => {
            const count =
              f === 'All'
                ? INTEGRATION_DIRECTORY.length
                : INTEGRATION_DIRECTORY.filter((i) => i.availability === f).length;
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#A51D0B] text-[#F0E9D9]'
                    : 'text-[#B8AE9B] hover:text-[#F0E9D9]'
                }`}
              >
                {f} ({count})
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map((c) => {
            const isOpen = expandedId === c.id;
            const statusTone =
              c.availability === 'Available'
                ? 'text-[#8CC59B]'
                : c.availability === 'In Development'
                ? 'text-[#E2B066]'
                : 'text-[#B8AE9B]';
            return (
              <div key={c.id} className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 flex flex-col justify-between space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#B8AE9B]">
                    <span>{c.category}</span>
                    <span className={`font-mono ${statusTone}`}>{c.availability}</span>
                  </div>
                  <h2 className="text-xl font-bold text-[#F0E9D9]">{c.name}</h2>
                  <p className="text-sm text-[#B8AE9B] leading-relaxed">{c.description}</p>
                  <ul className="space-y-1.5 text-xs text-[#F0E9D9]/90 pt-1">
                    {c.verifiedCapabilities.map((cap) => (
                      <li key={cap}>· {cap}</li>
                    ))}
                  </ul>
                </div>

                <div className="border-t border-[#363125] pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : c.id)}
                      aria-expanded={isOpen}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F0E9D9] hover:text-[#C52A18]"
                    >
                      <span>{isOpen ? 'Hide Setup Steps' : 'View Setup Steps'}</span>
                      {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    <Link
                      href={`/docs?section=${c.docsSectionId}`}
                      className="inline-flex items-center gap-1 text-xs text-[#B8AE9B] hover:text-[#F0E9D9]"
                    >
                      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Docs</span>
                    </Link>
                  </div>

                  {isOpen && (
                    <ol className="space-y-1.5 rounded-lg border border-[#363125] bg-[#202326] p-3 text-xs text-[#B8AE9B] list-decimal list-inside">
                      {c.setupSteps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </NextMarketingShell>
  );
}

'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, BookOpen } from 'lucide-react';
import { NextMarketingShell } from '@/components/NextMarketingShell';
import { DOCUMENTATION_SECTIONS } from '@/lib/site-content';

export default function DocsPage() {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState(DOCUMENTATION_SECTIONS[0].id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DOCUMENTATION_SECTIONS;
    return DOCUMENTATION_SECTIONS.filter(
      (sec) =>
        sec.title.toLowerCase().includes(q) ||
        sec.category.toLowerCase().includes(q) ||
        sec.summary.toLowerCase().includes(q) ||
        sec.bodyParagraphs.some((p) => p.toLowerCase().includes(q))
    );
  }, [query]);

  const activeSection =
    filtered.find((s) => s.id === activeId) || filtered[0] || DOCUMENTATION_SECTIONS[0];

  return (
    <NextMarketingShell activePath="/docs">
      <section className="mx-auto max-w-[1320px] px-6 py-14 md:py-20 space-y-10">
        <div className="max-w-3xl space-y-3">
          <div className="text-xs font-medium tracking-wide text-[#C52A18]">Technical Documentation</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#F0E9D9]">
            Guides, API Contracts &amp; Safety Architecture.
          </h1>
          <p className="text-base text-[#B8AE9B]">
            Search installation workflows, n8n API connectors, Python exception hooks, and recovery approval enforcement.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <aside className="lg:col-span-4 rounded-xl border border-[#363125] bg-[#171A1B] p-5 space-y-4">
            <div className="relative">
              <Search className="h-4 w-4 text-[#B8AE9B] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <label htmlFor="next-docs-search" className="sr-only">Search documentation</label>
              <input
                id="next-docs-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search docs..."
                className="w-full rounded-md border border-[#363125] bg-[#211D10] pl-9 pr-3 py-2 text-sm text-[#F0E9D9]"
              />
            </div>

            <nav className="space-y-1" aria-label="Documentation sections">
              {filtered.map((sec) => {
                const isSelected = activeSection.id === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setActiveId(sec.id)}
                    className={`w-full text-left rounded-md px-3 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-[#A51D0B] text-[#F0E9D9] font-semibold'
                        : 'text-[#B8AE9B] hover:bg-[#202326] hover:text-[#F0E9D9]'
                    }`}
                  >
                    <span className="truncate">{sec.title}</span>
                    <span className="text-[11px] font-mono opacity-80 shrink-0">{sec.category}</span>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-xs text-[#B8AE9B]">No documentation section matched &ldquo;{query}&rdquo;.</p>
              )}
            </nav>
          </aside>

          <article className="lg:col-span-8 rounded-xl border border-[#363125] bg-[#171A1B] p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-2 text-xs text-[#B8AE9B]">
              <BookOpen className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
              <span>{activeSection.category}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#F0E9D9]">{activeSection.title}</h2>
            <p className="text-base text-[#F0E9D9]/90 leading-relaxed">{activeSection.summary}</p>

            <div className="space-y-4 border-t border-[#363125] pt-5 text-sm text-[#B8AE9B] leading-relaxed">
              {activeSection.bodyParagraphs.map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
            </div>

            {activeSection.codeSnippet && (
              <div className="rounded-lg border border-[#363125] bg-[#211D10] overflow-hidden">
                {activeSection.codeTitle && (
                  <div className="border-b border-[#363125] px-4 py-2 text-xs font-mono text-[#B8AE9B]">
                    {activeSection.codeTitle}
                  </div>
                )}
                <pre className="p-4 overflow-x-auto font-mono text-xs text-[#F0E9D9]">
                  <code>{activeSection.codeSnippet}</code>
                </pre>
              </div>
            )}

            {activeSection.notes && activeSection.notes.length > 0 && (
              <div className="rounded-lg border border-[#363125] bg-[#202326] p-4 space-y-2">
                <div className="text-xs font-semibold text-[#F0E9D9]">Operational Notes</div>
                <ul className="space-y-1.5 text-xs text-[#B8AE9B]">
                  {activeSection.notes.map((n) => (
                    <li key={n}>· {n}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-[#363125] pt-4 flex flex-wrap items-center justify-between gap-4 text-xs">
              <span className="text-[#B8AE9B]">Need deployment guidance?</span>
              <Link href="/contact" className="font-semibold text-[#F0E9D9] hover:text-[#C52A18]">
                Contact the Team →
              </Link>
            </div>
          </article>
        </div>
      </section>
    </NextMarketingShell>
  );
}

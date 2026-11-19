import React, { useMemo, useState } from 'react';
import { BookOpen, Search, Terminal, ArrowRight } from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { DOCUMENTATION_SECTIONS } from '../../lib/docs-content';
import { MarketingShell } from './MarketingShell';
import { CTASection } from '../marketing/CTASection';

interface DocsPageProps {
  onNavigate: (route: AppRoute) => void;
  currentRoute?: AppRoute;
}

export const DocsPage: React.FC<DocsPageProps> = ({
  onNavigate,
  currentRoute = '/docs',
}) => {
  const [selectedId, setSelectedId] = useState<string>(DOCUMENTATION_SECTIONS[0].id);
  const [query, setQuery] = useState('');

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DOCUMENTATION_SECTIONS;
    return DOCUMENTATION_SECTIONS.filter(
      (sec) =>
        sec.title.toLowerCase().includes(q) ||
        sec.summary.toLowerCase().includes(q) ||
        sec.category.toLowerCase().includes(q) ||
        sec.bodyParagraphs.some((p) => p.toLowerCase().includes(q))
    );
  }, [query]);

  const activeSection =
    filteredSections.find((s) => s.id === selectedId) ||
    filteredSections[0] ||
    DOCUMENTATION_SECTIONS[0];

  return (
    <MarketingShell currentRoute={currentRoute} onNavigate={onNavigate}>
      <section className="border-b border-[#363125] bg-[#211D10] py-14 md:py-18">
        <div className="mx-auto max-w-[1320px] px-6 space-y-5">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            <span>Documentation &amp; Technical Reference</span>
          </div>
          <h1 className="font-[var(--font-display)] text-3xl sm:text-5xl font-extrabold tracking-tight text-[#F0E9D9] max-w-3xl">
            Setup guides, webhook contracts, and recovery safety architecture.
          </h1>
          <p className="text-sm sm:text-base text-[#B8AE9B] max-w-2xl leading-relaxed">
            Every section below documents real implemented behavior across the Zevkar AI API, n8n sync workers, Gemini diagnosis service, and approval-gated recovery engine.
          </p>
        </div>
      </section>

      <section className="bg-[#171A1B] py-14">
        <div className="mx-auto max-w-[1320px] px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-4 rounded-xl border border-[#363125] bg-[#211D10] p-5 space-y-4 lg:sticky lg:top-24">
            <div className="relative">
              <Search className="h-4 w-4 text-[#B8AE9B] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter documentation topics..."
                aria-label="Filter documentation topics"
                className="w-full rounded-md border border-[#363125] bg-[#171A1B] pl-9 pr-3 py-2 text-xs text-[#F0E9D9] placeholder:text-[#B8AE9B]/60 focus:border-[#A51D0B] focus:outline-none"
              />
            </div>

            <nav className="space-y-1" aria-label="Documentation sections">
              {filteredSections.map((sec) => {
                const isSelected = sec.id === activeSection.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setSelectedId(sec.id)}
                    className={`w-full text-left rounded-lg px-3.5 py-2.5 transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-[#A51D0B] text-[#F0E9D9]'
                        : 'text-[#B8AE9B] hover:bg-[#171A1B] hover:text-[#F0E9D9]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{sec.title}</div>
                      <div
                        className={`text-[10px] truncate ${
                          isSelected ? 'text-[#F0E9D9]/80' : 'text-[#B8AE9B]/75'
                        }`}
                      >
                        {sec.category}
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </button>
                );
              })}
              {filteredSections.length === 0 && (
                <p className="text-xs text-[#B8AE9B] px-2 py-4">
                  No documentation sections match &quot;{query}&quot;.
                </p>
              )}
            </nav>
          </aside>

          {/* Main Content Reader */}
          <article className="lg:col-span-8 rounded-xl border border-[#363125] bg-[#211D10] p-6 sm:p-8 space-y-6">
            <div className="space-y-2 border-b border-[#363125] pb-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
                {activeSection.category}
              </div>
              <h2 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold text-[#F0E9D9]">
                {activeSection.title}
              </h2>
              <p className="text-sm sm:text-base text-[#B8AE9B] leading-relaxed">
                {activeSection.summary}
              </p>
            </div>

            <div className="space-y-4">
              {activeSection.bodyParagraphs.map((para, idx) => (
                <p key={idx} className="text-sm sm:text-[15px] text-[#F0E9D9]/90 leading-[1.75]">
                  {para}
                </p>
              ))}
            </div>

            {activeSection.codeSnippet && (
              <div className="rounded-lg border border-[#363125] bg-[#171A1B] overflow-hidden">
                <div className="flex items-center gap-2 border-b border-[#363125] bg-[#202326] px-4 py-2.5 text-xs font-mono text-[#B8AE9B]">
                  <Terminal className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
                  <span>{activeSection.codeTitle || 'Example'}</span>
                </div>
                <pre className="p-4 text-xs font-mono text-[#F0E9D9] overflow-x-auto leading-relaxed">
                  <code>{activeSection.codeSnippet}</code>
                </pre>
              </div>
            )}

            {activeSection.notes && activeSection.notes.length > 0 && (
              <div className="rounded-lg border border-[#363125] bg-[#202326] p-4 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#E2B066]">
                  Operational Notes
                </div>
                <ul className="space-y-1.5 text-xs text-[#B8AE9B] list-disc list-inside">
                  {activeSection.notes.map((note) => (
                    <li key={note} className="leading-relaxed">
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-4 border-t border-[#363125] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onNavigate('/integrations')}
                className="text-xs font-semibold text-[#F0E9D9] hover:text-[#C52A18] transition-colors"
              >
                View Integrations Directory -&gt;
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/contact')}
                className="text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9] transition-colors"
              >
                Need implementation guidance? Contact us
              </button>
            </div>
          </article>
        </div>
      </section>

      <CTASection onNavigate={onNavigate} />
    </MarketingShell>
  );
};

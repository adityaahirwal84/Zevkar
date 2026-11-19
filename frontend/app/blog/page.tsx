'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { NextMarketingShell } from '@/components/NextMarketingShell';
import { BLOG_ARTICLES } from '@/lib/site-content';

const CATEGORIES = ['All', 'Architecture', 'n8n Operations', 'Safety & Recovery', 'Python & FastAPI'] as const;

export default function BlogPage() {
  const [category, setCategory] = useState<string>('All');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BLOG_ARTICLES.filter((a) => {
      const catOk = category === 'All' || a.category === category;
      const queryOk =
        !q ||
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q);
      return catOk && queryOk;
    });
  }, [category, query]);

  return (
    <NextMarketingShell activePath="/blog">
      <section className="mx-auto max-w-[1320px] px-6 py-14 md:py-20 space-y-10">
        <div className="max-w-3xl space-y-3">
          <div className="text-xs font-medium tracking-wide text-[#C52A18]">Engineering Journal</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#F0E9D9]">
            Automation Reliability Notes &amp; Playbooks.
          </h1>
          <p className="text-base text-[#B8AE9B]">
            Deep dives into idempotent recovery keys, n8n polling watermarks, deterministic safety guardrails, and FastAPI webhook telemetry.
          </p>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-lg bg-[#171A1B] border border-[#363125] w-fit">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  category === c ? 'bg-[#A51D0B] text-[#F0E9D9]' : 'text-[#B8AE9B] hover:text-[#F0E9D9]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="h-4 w-4 text-[#B8AE9B] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <label htmlFor="next-blog-search" className="sr-only">Search articles</label>
            <input
              id="next-blog-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter articles..."
              className="w-full rounded-md border border-[#363125] bg-[#171A1B] pl-9 pr-3 py-2 text-sm text-[#F0E9D9]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((article) => (
            <article key={article.slug} className="rounded-xl border border-[#363125] bg-[#171A1B] p-6 sm:p-7 flex flex-col justify-between space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-[#B8AE9B]">
                  <span className="font-semibold text-[#F0E9D9]">{article.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{article.publishedLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{article.readTime}</span>
                </div>
                <h2 className="text-xl font-bold text-[#F0E9D9]">{article.title}</h2>
                <p className="text-sm text-[#B8AE9B] leading-relaxed">{article.summary}</p>
              </div>
              <div>
                <Link
                  href={`/blog/${article.slug}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F0E9D9] hover:text-[#C52A18]"
                >
                  <span>Read Article</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </NextMarketingShell>
  );
}

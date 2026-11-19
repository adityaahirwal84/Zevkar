import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, FileText, Search } from 'lucide-react';
import { AppRoute, extractBlogSlug } from '../../lib/router';
import {
  BLOG_ARTICLES,
  BLOG_CATEGORIES,
  BlogArticle,
  filterBlogArticles,
} from '../../lib/blog-content';
import { MarketingShell } from './MarketingShell';
import { CTASection } from '../marketing/CTASection';

interface BlogPageProps {
  onNavigate: (route: AppRoute) => void;
  currentRoute?: AppRoute;
}

export const BlogPage: React.FC<BlogPageProps> = ({
  onNavigate,
  currentRoute = '/blog',
}) => {
  const initialSlug =
    typeof window !== 'undefined' ? extractBlogSlug(window.location.pathname) : null;
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const activeArticle: BlogArticle | undefined = useMemo(
    () => BLOG_ARTICLES.find((a) => a.slug === selectedSlug),
    [selectedSlug]
  );

  const visibleArticles = useMemo(
    () => filterBlogArticles(selectedCategory, searchQuery),
    [selectedCategory, searchQuery]
  );

  const openArticle = (slug: string) => {
    setSelectedSlug(slug);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `/blog/${slug}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const closeArticle = () => {
    setSelectedSlug(null);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/blog');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <MarketingShell currentRoute={currentRoute} onNavigate={onNavigate}>
      {activeArticle ? (
        <section className="bg-[#211D10] py-16 md:py-20">
          <article className="mx-auto max-w-[820px] px-6 space-y-8">
            <button
              type="button"
              onClick={closeArticle}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>All Engineering Articles</span>
            </button>

            <header className="space-y-4 border-b border-[#363125] pb-8">
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#C52A18] font-semibold">
                <span>{activeArticle.category}</span>
                <span aria-hidden="true">·</span>
                <span className="text-[#B8AE9B]">{activeArticle.publishedLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[#B8AE9B]">{activeArticle.readTime}</span>
              </div>
              <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight text-[#F0E9D9] leading-tight">
                {activeArticle.title}
              </h1>
              <p className="text-base text-[#B8AE9B] leading-relaxed">
                {activeArticle.summary}
              </p>
            </header>

            <div className="space-y-8">
              {activeArticle.sections.map((section) => (
                <div key={section.heading} className="space-y-3">
                  <h2 className="font-[var(--font-display)] text-xl font-bold text-[#F0E9D9]">
                    {section.heading}
                  </h2>
                  {section.paragraphs.map((p, idx) => (
                    <p key={idx} className="text-[15px] leading-[1.75] text-[#B8AE9B]">
                      {p}
                    </p>
                  ))}
                  {section.code && (
                    <pre className="rounded-lg border border-[#363125] bg-[#171A1B] p-4 font-mono text-xs text-[#F0E9D9] overflow-x-auto">
                      <code>{section.code}</code>
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : (
        <>
          <section className="border-b border-[#363125] bg-[#211D10] py-16 md:py-20">
            <div className="mx-auto max-w-[1320px] px-6 space-y-5">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#C52A18]">
                <FileText className="h-4 w-4" aria-hidden="true" />
                <span>Engineering Blog &amp; Guides</span>
              </div>
              <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#F0E9D9] max-w-3xl">
                Architecture notes on automation monitoring and safe recovery.
              </h1>
              <p className="text-base text-[#B8AE9B] max-w-2xl leading-relaxed">
                Deep dives on idempotent retries, n8n polling watermarks, deterministic fallback classifiers, and Python webhook telemetry.
              </p>
            </div>
          </section>

          <section className="bg-[#171A1B] py-16">
            <div className="mx-auto max-w-[1320px] px-6 space-y-10">
              {/* Filter + Search Controls */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div
                  className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-[#363125] bg-[#211D10] p-1"
                  role="group"
                  aria-label="Filter articles by category"
                >
                  {BLOG_CATEGORIES.map((category) => {
                    const active = selectedCategory === category;
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setSelectedCategory(category)}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-[#A51D0B] text-[#F0E9D9]'
                            : 'text-[#B8AE9B] hover:text-[#F0E9D9]'
                        }`}
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>

                <div className="relative w-full md:w-72">
                  <Search className="h-4 w-4 text-[#B8AE9B] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search guides..."
                    aria-label="Search blog guides"
                    className="w-full rounded-md border border-[#363125] bg-[#211D10] pl-9 pr-3 py-2 text-xs text-[#F0E9D9] placeholder:text-[#B8AE9B]/60 focus:border-[#A51D0B] focus:outline-none"
                  />
                </div>
              </div>

              {/* Article Cards */}
              {visibleArticles.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {visibleArticles.map((article) => (
                    <article
                      key={article.slug}
                      className="rounded-xl border border-[#363125] bg-[#211D10] p-6 flex flex-col justify-between space-y-5 hover:border-[#B8AE9B]/50 transition-colors"
                    >
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#B8AE9B]">
                          <span className="font-semibold text-[#C52A18]">{article.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>{article.publishedLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{article.readTime}</span>
                        </div>

                        <h2 className="font-[var(--font-display)] text-xl font-bold text-[#F0E9D9] leading-snug">
                          {article.title}
                        </h2>

                        <p className="text-sm text-[#B8AE9B] leading-relaxed">
                          {article.summary}
                        </p>
                      </div>

                      <div className="pt-4 border-t border-[#363125]">
                        <button
                          type="button"
                          onClick={() => openArticle(article.slug)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F0E9D9] hover:text-[#C52A18] transition-colors"
                        >
                          <span>Read Article</span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-[#363125] bg-[#211D10] p-10 text-center text-sm text-[#B8AE9B]">
                  No articles found matching your current filter.
                </div>
              )}
            </div>
          </section>
        </>
      )}

      <CTASection onNavigate={onNavigate} />
    </MarketingShell>
  );
};

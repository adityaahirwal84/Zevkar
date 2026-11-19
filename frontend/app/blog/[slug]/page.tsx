import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { NextMarketingShell } from '@/components/NextMarketingShell';
import { BLOG_ARTICLES } from '@/lib/site-content';

export function generateStaticParams() {
  return BLOG_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = BLOG_ARTICLES.find((a) => a.slug === slug);
  if (!article) {
    return { title: 'Article Not Found — Zevkar AI' };
  }
  return {
    title: `${article.title} — Zevkar AI`,
    description: article.summary,
  };
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = BLOG_ARTICLES.find((a) => a.slug === slug);
  if (!article) notFound();

  return (
    <NextMarketingShell activePath="/blog">
      <article className="mx-auto max-w-[860px] px-6 py-16 md:py-24 space-y-10">
        <div className="space-y-4">
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B8AE9B] hover:text-[#F0E9D9]">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Blog</span>
          </Link>
          <div className="flex items-center gap-2 text-xs text-[#B8AE9B]">
            <span className="font-semibold text-[#C52A18]">{article.category}</span>
            <span aria-hidden="true">·</span>
            <span>{article.publishedLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{article.readTime}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#F0E9D9] leading-tight">
            {article.title}
          </h1>
          <p className="text-base text-[#B8AE9B] leading-relaxed">{article.summary}</p>
        </div>

        <div className="space-y-8 border-t border-[#363125] pt-8">
          {article.sections.map((sec) => (
            <section key={sec.heading} className="space-y-4">
              <h2 className="text-2xl font-bold text-[#F0E9D9]">{sec.heading}</h2>
              {sec.paragraphs.map((p, idx) => (
                <p key={idx} className="text-base text-[#B8AE9B] leading-relaxed">
                  {p}
                </p>
              ))}
              {sec.code && (
                <pre className="rounded-lg border border-[#363125] bg-[#171A1B] p-4 font-mono text-xs text-[#F0E9D9] overflow-x-auto">
                  <code>{sec.code}</code>
                </pre>
              )}
            </section>
          ))}
        </div>
      </article>
    </NextMarketingShell>
  );
}

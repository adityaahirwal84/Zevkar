import type { MetadataRoute } from 'next';
import { BLOG_ARTICLES } from '@/lib/site-content';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const staticRoutes = [
    '',
    '/product',
    '/features',
    '/integrations',
    '/how-it-works',
    '/use-cases',
    '/pricing',
    '/about',
    '/contact',
    '/docs',
    '/blog',
    '/privacy',
    '/terms',
    '/cookies',
  ];

  return [
    ...staticRoutes.map((path) => ({
      url: `${baseUrl}${path}`,
      lastModified: new Date(),
    })),
    ...BLOG_ARTICLES.map((article) => ({
      url: `${baseUrl}/blog/${article.slug}`,
      lastModified: new Date(),
    })),
  ];
}

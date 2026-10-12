import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

/*
  `/admin` and `/api` are disallowed as a hygiene measure, not as access
  control — both are already gated server-side in middleware, the panel layout
  and every action. robots.txt keeps them out of an index; it keeps nobody out
  of the route.
*/
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/', '/search', '/checkout', '/cart', '/order', '/account'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}

import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://oni.vn';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/super/',
        '/dashboard/',
        '/t/',
        '/admin-login',
        '/api/',
        '/auth/'
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

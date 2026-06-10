import { MetadataRoute } from 'next';
import { INDUSTRIES_LIST, ALL_SECTORS } from './components/layout/industriesData';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://oni.vn';
  const currentDate = new Date();

  // 1. Static Core Pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];

  // 2. Large Solutions Categories (/solutions/[slug])
  const industryPages: MetadataRoute.Sitemap = INDUSTRIES_LIST.map((ind) => ({
    url: `${baseUrl}/solutions/${ind.slug}`,
    lastModified: currentDate,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  // 3. Detailed Sector Pages (/solutions/[slug]/[sub])
  const sectorPages: MetadataRoute.Sitemap = ALL_SECTORS.flatMap((group) =>
    group.items.map((item) => ({
      url: `${baseUrl}${item.href}`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.7,
    }))
  );

  return [...staticPages, ...industryPages, ...sectorPages];
}

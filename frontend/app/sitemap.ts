import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.printexengineers.co.ke";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

async function fetchAllActiveProductSlugs(): Promise<string[]> {
  const slugs: string[] = [];
  let page = 1;
  const limit = 100;

  // The catalogue is small enough (see /mnt/skills — a few hundred parts at
  // most) that paging through it fully at build/revalidate time is cheap
  // and simpler than a dedicated "slugs only" backend endpoint.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(`${API_URL}/products?page=${page}&limit=${limit}`, {
        next: { revalidate: 3600 },
      });
      if (!res.ok) break;
      const data = await res.json();
      const items: any[] = data.items || [];
      for (const p of items) {
        if (p.status === "active" && p.slug) slugs.push(p.slug);
      }
      if (items.length < limit) break; // last page
      page += 1;
      if (page > 50) break; // hard safety cap — 5,000 products is far beyond this catalogue's real size
    } catch {
      break; // A failed fetch just means fewer product URLs this run, never a broken sitemap
    }
  }
  return slugs;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    // /login, /cart, /checkout, and every /admin page are deliberately
    // excluded — each already sets its own `robots: { index: false }` (see
    // their layout.tsx files), so listing them here would contradict that
    // signal. /register is included since new-account signups are a
    // legitimate, indexable page.
    { url: `${SITE_URL}/register`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const slugs = await fetchAllActiveProductSlugs();
  const productRoutes: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `${SITE_URL}/products/${slug}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...productRoutes];
}

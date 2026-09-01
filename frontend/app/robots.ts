import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.printexengineers.co.ke";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Mirrors the noindex metadata already set on these route groups
      // (see their layout.tsx files) — listed here too so crawlers that
      // don't fetch every page still know not to bother crawling these at
      // all: the internal staff tool, per-session cart/checkout, and
      // signed-in account pages have nothing worth indexing.
      disallow: ["/admin/", "/cart", "/checkout", "/account/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

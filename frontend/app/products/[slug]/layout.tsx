import type { Metadata } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.printexengineers.co.ke";

async function fetchProduct(slug: string) {
  try {
    const res = await fetch(`${API_URL}/products/${slug}`, {
      // Product data changes (price, stock) but not often enough to refetch
      // on every single crawl/share-preview request — an hour is a
      // reasonable balance between freshness and not hammering the API
      // every time a search engine or chat app unfurls a link.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProduct(slug);

  if (!product) {
    // Falls back to a sensible generic title rather than crashing metadata
    // generation — the page component itself already renders its own
    // "not found" state for a bad slug.
    return {
      title: "Part Not Found",
      robots: { index: false, follow: true },
    };
  }

  const title = product.name as string;
  const description: string =
    product.short_description ||
    (product.description ? String(product.description).slice(0, 155) : `${title} — genuine printing press spare part from Printex Engineers, in stock in Nairobi.`);
  const image = product.thumbnail_url || product.images?.[0]?.url;

  return {
    title,
    description,
    alternates: { canonical: `/products/${slug}` },
    openGraph: {
      title,
      description,
      url: `/products/${slug}`,
      images: image ? [{ url: image, alt: title }] : undefined,
    },
  };
}

export default async function ProductDetailLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await fetchProduct(slug);

  // Product structured data — helps search engines show price/availability
  // directly in results. Only rendered when we actually have real product
  // data; a bad slug just renders the page's own "not found" state with no
  // fabricated schema.
  const schema = product
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: product.short_description || product.description || undefined,
        sku: product.sku,
        image: product.thumbnail_url || product.images?.[0]?.url || undefined,
        offers: {
          "@type": "Offer",
          priceCurrency: "KES",
          price: (product.price_kes / 100).toFixed(2),
          // Product doesn't carry a single stock quantity — actual stock
          // is per-branch, on a separate InventoryItem record, not
          // returned by this endpoint. `status` only tells us whether the
          // part is generally sellable at all (vs. discontinued/inactive),
          // so that's the honest, correct signal to use here — claiming a
          // specific in-stock/out-of-stock state we can't actually verify
          // would be fabricated data in a public schema.org listing.
          availability:
            product.status === "active"
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
        },
      }
    : null;

  // BreadcrumbList — the visible breadcrumb trail on the page (Home >
  // Products > Category > part name) already exists in app/products/[slug]/
  // page.tsx; this is the machine-readable version of that SAME trail, not
  // a separate feature, so search engines can render it directly in
  // results the way the page already renders it visually.
  const breadcrumbItems = product
    ? [
        { name: "Home", url: SITE_URL },
        { name: "Products", url: `${SITE_URL}/products` },
        ...(product.category
          ? [{ name: product.category.name, url: `${SITE_URL}/products?category_id=${product.category.id}` }]
          : []),
        { name: product.name, url: `${SITE_URL}/products/${slug}` },
      ]
    : [];
  const breadcrumbSchema = product
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbItems.map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: item.name,
          item: item.url,
        })),
      }
    : null;

  return (
    <>
      {schema && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      )}
      {breadcrumbSchema && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
      )}
      {children}
    </>
  );
}

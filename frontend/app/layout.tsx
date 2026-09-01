import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import "./globals-v2.css";
import { Providers } from "@/components/Providers";
import ConditionalShell from "@/components/ConditionalShell";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import AnalyticsScripts from "@/components/AnalyticsScripts";
import ChatWidget from "@/components/chat/ChatWidget";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600"],
});

// Falls back to a placeholder during local dev / preview builds. Set
// NEXT_PUBLIC_SITE_URL to your real domain in production — see
// .env.example. Every relative URL in this file's metadata (canonical
// tags, Open Graph image, etc.) resolves against this.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.printexengineers.co.ke";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Printex Engineers — Printing Press Spare Parts",
    // Every page under app/ sets its own title via `export const metadata`
    // (directly, or through a route-level layout.tsx for client-component
    // pages) — this template just appends the brand name consistently
    // wherever a page provides only a short title.
    template: "%s | Printex Engineers",
  },
  description: "Genuine printing press spare parts — valves, cylinders, bearings, grippers and more — in stock in Nairobi.",
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.ico" },
  openGraph: {
    type: "website",
    siteName: "Printex Engineers",
    title: "Printex Engineers — Printing Press Spare Parts",
    description: "Genuine printing press spare parts — valves, cylinders, bearings, grippers and more — in stock in Nairobi.",
    url: "/",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Printex Engineers — Printing Press Spare Parts" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Printex Engineers — Printing Press Spare Parts",
    description: "Genuine printing press spare parts — valves, cylinders, bearings, grippers and more — in stock in Nairobi.",
    images: ["/og-image.png"],
  },
};

// LocalBusiness structured data — tells search engines (and AI assistants
// reading llms.txt) what kind of business this is, where it's based, and
// how to contact it, independent of whatever's on the current page. Lives
// in the root layout so it's present on every page without repeating it.
const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "Store",
  name: "Printex Engineers",
  description: "Supplier of genuine printing press spare parts — valves, cylinders, bearings, grippers and more.",
  url: SITE_URL,
  address: {
    "@type": "PostalAddress",
    addressLocality: "Nairobi",
    addressCountry: "KE",
  },
  areaServed: "KE",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
        />
      </head>
      <body className={`${inter.variable} ${fraunces.variable} ${inter.className} min-h-screen flex flex-col`}>
        <Providers>
          <ConditionalShell>{children}</ConditionalShell>
          <CookieConsentBanner />
          <AnalyticsScripts />
          <ChatWidget />
        </Providers>
      </body>
    </html>
  );
}
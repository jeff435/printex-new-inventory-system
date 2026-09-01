import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout | Printex Engineers",
  description: "Complete your order securely with Printex Engineers.",
  // Same reasoning as /cart — a per-session checkout flow has nothing
  // for a search engine to usefully index.
  robots: { index: false, follow: true },
  alternates: { canonical: "/checkout" },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Cart | Printex Engineers",
  description: "Review the parts in your cart before checking out with Printex Engineers.",
  // A cart is unique to each visitor's session and has nothing to rank
  // for — indexing it would only ever show search engines an empty or
  // stale cart, so it's excluded rather than left to compete for the
  // real product pages' rankings.
  robots: { index: false, follow: true },
  alternates: { canonical: "/cart" },
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}

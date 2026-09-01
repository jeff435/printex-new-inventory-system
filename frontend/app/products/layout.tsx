import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shop Printing Press Spare Parts | Printex Engineers",
  description:
    "Browse our full catalogue of printing press spare parts — valves, cylinders, bearings, grippers and more — with live stock and pricing.",
  alternates: { canonical: "/products" },
};

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

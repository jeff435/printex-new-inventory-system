import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create an Account | Printex Engineers",
  description: "Create a Printex Engineers account to order printing press spare parts online.",
  alternates: { canonical: "/register" },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}

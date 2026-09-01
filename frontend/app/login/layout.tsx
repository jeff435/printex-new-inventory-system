import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Printex Engineers",
  description: "Sign in to your Printex Engineers account.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/login" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

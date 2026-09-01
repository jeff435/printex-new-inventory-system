import type { Metadata } from "next";
import AdminShellClient from "./AdminShellClient";

// The whole /admin section is a login-gated internal tool for exactly three
// staff roles (see AdminShellClient's ADMIN_ROLES) — there's nothing here a
// search engine should ever index, and every page under it inherits this
// automatically since Next.js metadata cascades down from a parent layout.
export const metadata: Metadata = {
  title: { default: "Admin | Printex Engineers", template: "%s | Printex Admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShellClient>{children}</AdminShellClient>;
}

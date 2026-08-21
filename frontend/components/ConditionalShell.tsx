"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/stores";

// Printex is an internal inventory system for three staff roles only —
// there are no customer accounts, so every authenticated user belongs to
// one of these and always lands in /admin.
const STAFF_ROLES = ["super_admin", "director", "secretary"];

export default function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, _hasHydrated } = useAuthStore();

  const isBareShell = pathname.startsWith("/admin");
  const isAuthShell = pathname.startsWith("/login");

  useEffect(() => {
    if (!_hasHydrated) return;

    // Signed-in staff always land in /admin — this is a staff tool, not a storefront.
    if (isAuthenticated && user) {
      if (isAuthShell) return;
      const onAdminArea = pathname.startsWith("/admin");
      if (STAFF_ROLES.includes(user.role) && !onAdminArea) {
        router.replace("/admin");
        return;
      }
    }

    // No customer-facing site anymore: anyone not signed in (and not already
    // headed to /login) gets sent straight to staff sign-in.
    if ((!isAuthenticated || !user) && !isAuthShell) {
      router.replace("/login");
    }
  }, [pathname, user, isAuthenticated, _hasHydrated, isAuthShell, router]);

  if (isBareShell) return <>{children}</>;

  if (isAuthShell) {
    return <div className="min-h-screen bg-[#f4f5f9] text-[#14151a]">{children}</div>;
  }

  // Everything else briefly renders nothing while the redirect above kicks in.
  return <div className="min-h-screen bg-[#f4f5f9]" />;
}

"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores";
import { Truck, LogOut } from "lucide-react";

const DRIVER_ROLES = ["driver"];

export default function DriverLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated, _hasHydrated, clearUser } = useAuthStore();
    const router = useRouter();

    const ADMIN_ROLES = ["super_admin", "branch_manager", "inventory_manager"];

    useEffect(() => {
        if (!_hasHydrated) return;
        if (!isAuthenticated) { router.push("/login"); return; }
        if (!DRIVER_ROLES.includes(user?.role ?? "")) {
            router.push(ADMIN_ROLES.includes(user?.role ?? "") ? "/admin" : "/");
            return;
        }
    }, [_hasHydrated, isAuthenticated, user, router]);

    if (!_hasHydrated || !isAuthenticated || !DRIVER_ROLES.includes(user?.role ?? "")) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-8 h-8 border-4 border-[#e6e8eb]-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const handleSignOut = () => { clearUser(); router.push("/login"); };

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="sticky top-0 z-20 bg-[#14151a] text-white shadow-md">
                <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto">
                    <div className="flex items-center gap-2">
                        <Truck size={20} />
                        <div>
                            <p className="font-bold text-sm leading-tight">Printex Driver</p>
                            <p className="text-xs text-white/70 leading-tight">{user?.full_name}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className="flex items-center gap-1.5 text-xs text-white/80 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <LogOut size={14} />
                        Sign out
                    </button>
                </div>
            </header>
            <main className="max-w-lg mx-auto px-3 py-4">{children}</main>
        </div>
    );
}
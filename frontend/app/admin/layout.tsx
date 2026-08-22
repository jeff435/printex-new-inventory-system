"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores";
import BranchSelector from "@/components/admin/BranchSelector";
import Link from "next/link";
import {
    LayoutDashboard, ClipboardList, Package, Tags,
    Warehouse, Users, GitBranch, LogOut, Menu, ChevronRight,
    UserCog, Contact, FileText, Settings,
} from "lucide-react";

// Printex is a staff-only inventory system for exactly three roles.
const ADMIN_ROLES = ["super_admin", "director", "secretary"];

type NavItem = { href: string; label: string; icon: React.ElementType; roles: string[] };

const NAV: NavItem[] = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard, roles: ["super_admin", "director", "secretary"] },
    { href: "/admin/orders", label: "Orders", icon: ClipboardList, roles: ["super_admin", "director"] },
    { href: "/admin/products", label: "Products", icon: Package, roles: ["super_admin", "director", "secretary"] },
    { href: "/admin/categories", label: "Categories", icon: Tags, roles: ["super_admin", "director", "secretary"] },
    { href: "/admin/inventory", label: "Inventory", icon: Warehouse, roles: ["super_admin", "director", "secretary"] },
    { href: "/admin/proforma-invoices", label: "Proforma Invoices", icon: FileText, roles: ["super_admin", "director", "secretary"] },
    { href: "/admin/users", label: "Users", icon: Users, roles: ["super_admin"] },
    { href: "/admin/branches", label: "Branches", icon: GitBranch, roles: ["super_admin"] },
    { href: "/admin/directors", label: "Directors", icon: UserCog, roles: ["super_admin"] },
    { href: "/admin/secretaries", label: "Secretaries", icon: Contact, roles: ["super_admin", "director"] },
    { href: "/admin/settings", label: "Settings", icon: Settings, roles: ["super_admin", "director", "secretary"] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated, _hasHydrated, clearUser } = useAuthStore();
    const router = useRouter();
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (!_hasHydrated) return;
        if (!isAuthenticated) { router.push("/login"); return; }
        if (!ADMIN_ROLES.includes(user?.role ?? "")) {
            router.push("/login");
            return;
        }
    }, [_hasHydrated, isAuthenticated, user, router]);

    if (!_hasHydrated || !isAuthenticated || !ADMIN_ROLES.includes(user?.role ?? "")) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const visibleNav = NAV.filter((n) => n.roles.includes(user?.role ?? ""));

    const handleSignOut = () => { clearUser(); router.push("/login"); };

    const SidebarContent = () => (
        <div className="flex flex-col h-full">
            <div className="p-5 border-b border-[#e6e8eb]">
                <Link href="/admin" className="text-2xl font-bold text-[#14151a]">Printex</Link>
                <p className="text-xs text-[#2f8f4e] mt-0.5 capitalize">{user?.role?.replace(/_/g, " ")}</p>
            </div>
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {visibleNav.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
                    return (
                        <Link
                            key={href}
                            href={href}
                            onClick={() => setSidebarOpen(false)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? "bg-[#f0f1f3] text-[#14151a] shadow-sm" : "text-[#6b7078] hover:bg-[#f0f1f3] hover:text-[#14151a]"
                                }`}
                        >
                            <Icon size={16} />
                            {label}
                            {active && <ChevronRight size={14} className="ml-auto opacity-60" />}
                        </Link>
                    );
                })}
            </nav>
            <div className="p-4 border-t border-[#e6e8eb]">
                <div className="flex items-center gap-3 mb-3 px-1">
                    <div className="w-8 h-8 rounded-full bg-[#f0f1f3] flex items-center justify-center text-[#14151a] font-bold text-sm">
                        {user?.full_name?.[0] ?? "A"}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-[#14151a] truncate">{user?.full_name}</p>
                        <p className="text-xs text-[#2f8f4e] truncate">{user?.email || user?.phone}</p>
                    </div>
                </div>
                <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[#6b7078] hover:bg-[#f0f1f3] hover:text-[#14151a] rounded-xl transition-colors"
                >
                    <LogOut size={15} />
                    Sign out
                </button>
            </div>
        </div>
    );

    return (
        <div className="flex h-screen overflow-hidden bg-[#f5f6f8]" style={{ paddingTop: 0 }}>
            {/* Desktop sidebar */}
            <aside className="hidden md:flex w-60 flex-shrink-0 flex-col bg-white shadow-xl">
                <SidebarContent />
            </aside>

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div className="md:hidden fixed inset-0 z-50 flex">
                    <div className="w-60 flex-shrink-0 flex flex-col bg-white shadow-xl">
                        <SidebarContent />
                    </div>
                    <div className="flex-1 bg-black/20" onClick={() => setSidebarOpen(false)} />
                </div>
            )}

            {/* Main */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="flex-shrink-0 h-14 bg-white backdrop-blur-md border-b border-[#e6e8eb] flex items-center px-4 gap-3 shadow-sm">
                    <button className="md:hidden p-2 rounded-lg hover:bg-gray-100" onClick={() => setSidebarOpen(true)}>
                        <Menu size={18} />
                    </button>
                    <h1 className="text-sm font-semibold text-gray-700 capitalize">
                        {visibleNav.find((n) => pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href)))?.label ?? "Admin"}
                    </h1>
                    <div className="ml-auto flex items-center gap-4">
                        <BranchSelector />
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-6">{children}</main>
            </div>
        </div>
    );
}
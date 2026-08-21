"use client";
import Link from "next/link";
import { Heart, ShoppingCart, ChevronDown, Menu, X, Settings, Package, Star, Wallet, LogOut } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useOnClickOutside } from "usehooks-ts";
import { useCartStore, useAuthStore } from "@/stores";
import { useFavorites } from "@/hooks/useFavorites";
import { useRouter, usePathname } from "next/navigation";
import ProductSearchAutocomplete from "@/components/ProductSearchAutocomplete";
import BranchSelectorV2 from "@/components/v2/BranchSelectorV2";

const NAV_LINKS = [
    { label: "Home", href: "/" },
    { label: "Inventory", href: "/products" },
    { label: "Deals", href: "/products?is_online_exclusive=true" },
    { label: "About Us", href: "/about" },
];

export function NavbarV2() {
    const router = useRouter();
    const pathname = usePathname();
    const totalItems = useCartStore((s) => s.totalItems());
    const { user, isAuthenticated, clearUser } = useAuthStore();
    const { favoriteIds } = useFavorites();

    const [mounted, setMounted] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const accountRef = useRef<HTMLDivElement>(null);

    useEffect(() => setMounted(true), []);
    useOnClickOutside(accountRef as React.RefObject<HTMLElement>, () => setAccountOpen(false));

    const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

    const handleSignOut = () => {
        clearUser();
        setAccountOpen(false);
        router.push("/");
    };

    const accountLinks = [
        { href: "/account/profile", label: "My Profile", icon: Settings },
        { href: "/account/orders", label: "My Orders", icon: Package },
        { href: "/account/favorites", label: "My Favorites", icon: Heart },
        { href: "/account/loyalty", label: "Loyalty Points", icon: Star },
        { href: "/account/wallet", label: "My Wallet", icon: Wallet },
    ];

    return (
        <nav className="v2-nav sticky top-0 left-0 right-0 z-50">
            <div className="px-shell-nav h-16 lg:h-20 flex items-center gap-3 lg:gap-7">
                {/* Logo */}
                <Link href="/" className="flex-shrink-0 font-extrabold text-[1.75rem] tracking-tight text-[var(--v2-text)]">
                    PRINTEX
                </Link>

                {/* Primary links — desktop */}
                <div className="hidden lg:flex items-center gap-7">
                    {NAV_LINKS.map((link) => (
                        <Link
                            key={link.label}
                            href={link.href}
                            className={`relative text-[0.9375rem] font-medium pb-1 transition-colors ${isActive(link.href)
                                ? "text-[var(--v2-text)] border-b-2 border-[var(--v2-text)]"
                                : "text-[var(--v2-text-muted)] hover:text-[var(--v2-text)]"
                                }`}
                        >
                            {link.label}
                        </Link>
                    ))}
                </div>

                {/* Search */}
                <div className="flex-1 max-w-md hidden md:block">
                    <ProductSearchAutocomplete variant="navbar" placeholder="Search for products, brands and categories..." />
                </div>

                <div className="flex items-center gap-3 ml-auto">
                    {/* Deliver to */}
                    <BranchSelectorV2 />

                    {/* Favorites */}
                    <Link
                        href="/account/favorites"
                        className="hidden sm:flex relative w-9 h-9 rounded-full items-center justify-center text-[var(--v2-text-muted)] hover:bg-[var(--v2-surface-muted)] transition-colors"
                    >
                        <Heart size={18} />
                        {mounted && isAuthenticated && favoriteIds.length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-[var(--v2-text)] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                {favoriteIds.length}
                            </span>
                        )}
                    </Link>

                    {/* Cart */}
                    <Link
                        href="/cart"
                        className="relative w-9 h-9 rounded-full flex items-center justify-center text-[var(--v2-text-muted)] hover:bg-[var(--v2-surface-muted)] transition-colors"
                    >
                        <ShoppingCart size={18} />
                        {mounted && totalItems > 0 && (
                            <span className="absolute -top-1 -right-1 bg-[var(--v2-text)] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                {totalItems}
                            </span>
                        )}
                    </Link>

                    {/* Account */}
                    {mounted && isAuthenticated ? (
                        <div className="relative" ref={accountRef}>
                            <button
                                onClick={() => setAccountOpen(!accountOpen)}
                                className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full hover:bg-[var(--v2-surface-muted)] transition-colors"
                            >
                                <div className="w-7 h-7 rounded-full bg-[var(--v2-text)] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                                    {user?.full_name?.charAt(0) || "U"}
                                </div>
                                <span className="hidden md:inline text-sm font-medium text-[var(--v2-text)] max-w-[80px] truncate">
                                    {user?.full_name?.split(" ")[0]}
                                </span>
                                <ChevronDown size={14} className={`text-[var(--v2-text-muted)] transition-transform ${accountOpen ? "rotate-180" : ""}`} />
                            </button>

                            {accountOpen && (
                                <div className="absolute right-0 top-full mt-2 w-52 v2-card py-1 z-50">
                                    <div className="px-4 py-3 border-b border-[var(--v2-border)]">
                                        <p className="text-sm font-semibold text-[var(--v2-text)] truncate">{user?.full_name}</p>
                                        <p className="text-xs text-[var(--v2-text-faint)] truncate">{user?.phone}</p>
                                    </div>
                                    {accountLinks.map(({ href, label, icon: Icon }) => (
                                        <Link
                                            key={href}
                                            href={href}
                                            onClick={() => setAccountOpen(false)}
                                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--v2-text)] hover:bg-[var(--v2-surface-muted)] transition-colors"
                                        >
                                            <Icon size={15} className="text-[var(--v2-text-faint)]" />
                                            {label}
                                        </Link>
                                    ))}
                                    <div className="border-t border-[var(--v2-border)] mt-1" />
                                    <button
                                        onClick={handleSignOut}
                                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-[var(--v2-deal)] hover:bg-[var(--v2-deal-bg)] transition-colors rounded-b-[var(--v2-radius-md)]"
                                    >
                                        <LogOut size={15} />
                                        Sign out
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : mounted ? (
                        <Link href="/login" className="v2-btn-primary text-sm px-4 py-2">
                            Sign in
                        </Link>
                    ) : null}

                    {/* Mobile menu toggle */}
                    <button
                        className="lg:hidden w-9 h-9 rounded-full flex items-center justify-center text-[var(--v2-text)] hover:bg-[var(--v2-surface-muted)]"
                        onClick={() => setMobileOpen(!mobileOpen)}
                    >
                        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
            </div>

            {/* Mobile menu */}
            {mobileOpen && (
                <div className="lg:hidden px-4 pb-4 border-t border-[var(--v2-border)] bg-[var(--v2-surface)]">
                    <div className="mt-3 mb-3">
                        <ProductSearchAutocomplete variant="page" placeholder="Search products..." onNavigate={() => setMobileOpen(false)} />
                    </div>
                    <div className="space-y-1 border-t border-[var(--v2-border)] pt-3">
                        {NAV_LINKS.map((link) => (
                            <Link
                                key={link.label}
                                href={link.href}
                                onClick={() => setMobileOpen(false)}
                                className={`block px-2 py-2.5 text-sm rounded-lg transition-colors ${isActive(link.href)
                                    ? "bg-[var(--v2-surface-muted)] text-[var(--v2-text)] font-semibold"
                                    : "text-[var(--v2-text-muted)] hover:bg-[var(--v2-surface-muted)]"
                                    }`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </nav>
    );
}
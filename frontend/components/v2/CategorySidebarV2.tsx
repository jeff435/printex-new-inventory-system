"use client";
import { useQuery } from "@tanstack/react-query";
import { productsApi } from "@/lib/api";
import Link from "next/link";
import {
    Gauge,
    CircleDot,
    Grip,
    Disc,
    Settings2,
    Waves,
    ChevronRight,
    Grid2x2,
    Wrench,
} from "lucide-react";

type Category = { id: string; name: string; image_url?: string | null };

// Categories don't carry an icon field from the API — map the real Printex
// register categories (columns A–F in printex_parts.json) to a sensible
// Lucide icon. Falls back to a generic wrench icon for anything unrecognized
// so no category is ever left without an icon.
function iconFor(name: string) {
    const n = name.toLowerCase();
    if (n.includes("valve") || n.includes("cylinder") || n.includes("piston")) return Gauge;
    if (n.includes("bellow") || n.includes("diaphragm") || n.includes("spindle")) return Waves;
    if (n.includes("sucker") || n.includes("cup") || n.includes("gear")) return CircleDot;
    if (n.includes("cam") || n.includes("bearing")) return Disc;
    if (n.includes("gripper") || n.includes("pin") || n.includes("hook")) return Grip;
    if (n.includes("spring") || n.includes("screw") || n.includes("ink")) return Settings2;
    return Wrench;
}

export function CategorySidebarV2() {
    const { data, isLoading } = useQuery({
        queryKey: ["categories"],
        queryFn: () => productsApi.categories().then((r) => r.data),
    });

    const categories: Category[] = data ?? [];

    return (
        <aside className="v2-card p-5 h-fit">
            <h2 className="text-lg font-bold text-[var(--v2-text)] mb-4 px-1">Browse Inventory by Category</h2>

            <nav className="space-y-1.5">
                {isLoading &&
                    Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-11 rounded-lg bg-[var(--v2-surface-muted)] animate-pulse" />
                    ))}

                {!isLoading &&
                    categories.map((cat, i) => {
                        const Icon = iconFor(cat.name);
                        return (
                            <Link
                                key={cat.id}
                                href={`/products?category_id=${cat.id}`}
                                className={`v2-sidebar-item group ${i === 0 ? "v2-sidebar-item-active" : ""}`}
                            >
                                <span className="flex items-center gap-3">
                                    <Icon size={19} className="text-[var(--v2-text-muted)]" />
                                    <span>{cat.name}</span>
                                </span>
                                <ChevronRight
                                    size={16}
                                    className="text-[var(--v2-text-faint)] opacity-0 group-hover:opacity-100 transition-opacity"
                                />
                            </Link>
                        );
                    })}

                <Link
                    href="/products"
                    className="v2-sidebar-item border-t border-[var(--v2-border)] mt-2 pt-4"
                >
                    <span className="flex items-center gap-3">
                        <Grid2x2 size={19} className="text-[var(--v2-text-muted)]" />
                        <span>View all categories</span>
                    </span>
                    <ChevronRight size={16} className="text-[var(--v2-text-faint)]" />
                </Link>
            </nav>
        </aside>
    );
}
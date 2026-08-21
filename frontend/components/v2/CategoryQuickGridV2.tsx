"use client";
import { useQuery } from "@tanstack/react-query";
import { productsApi } from "@/lib/api";
import Link from "next/link";
import { Grid2x2 } from "lucide-react";

type Category = { id: string; name: string; image_url?: string | null };

export function CategoryQuickGridV2() {
    const { data, isLoading } = useQuery({
        queryKey: ["categories"],
        queryFn: () => productsApi.categories().then((r) => r.data),
    });

    const categories: Category[] = data ?? [];
    // Screenshot shows 6 categories + a "View all" tile — cap at 6 so the
    // layout matches regardless of how many categories the backend returns.
    const visible = categories.slice(0, 6);

    if (isLoading) {
        return (
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-5">
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="h-28 rounded-xl bg-[var(--v2-surface-muted)] animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-5">
            {visible.map((cat) => (
                <Link key={cat.id} href={`/products?category_id=${cat.id}`} className="v2-glass-tile flex flex-col items-center gap-2 p-4 text-center">
                    <div className="category-tile-image w-full h-[78px] rounded-xl overflow-hidden flex items-center justify-center">
                        {cat.image_url ? (
                            <img src={cat.image_url} alt={cat.name} className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-3xl opacity-40">🔧</span>
                        )}
                    </div>
                    <span className="text-sm font-semibold text-[var(--v2-text)] leading-tight">{cat.name}</span>
                </Link>
            ))}

            <Link href="/products" className="v2-glass-tile flex flex-col items-center justify-center gap-2 p-4 text-center">
                <div className="category-tile-image w-full h-[78px] rounded-xl flex items-center justify-center">
                    <Grid2x2 size={28} className="text-[var(--v2-text-muted)]" />
                </div>
                <span className="text-sm font-semibold text-[var(--v2-text)]">View all</span>
            </Link>
        </div>
    );
}
"use client";
import { useQuery } from "@tanstack/react-query";
import { favoritesApi } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { useFavorites } from "@/hooks/useFavorites";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DealCardV2 } from "@/components/v2/DealCardV2";
import { Heart } from "lucide-react";
import Link from "next/link";

interface FavoriteProduct {
    id: string;
    sku: string;
    name: string;
    slug: string;
    price_kes: number;
    compare_price_kes?: number;
    thumbnail_url?: string;
    unit?: string;
    unit_value?: number;
    status: string;
}

export default function FavoritesPage() {
    const { isAuthenticated, _hasHydrated } = useAuthStore();
    const router = useRouter();
    // Shared favorite-ids cache — also drives the hearts on every DealCardV2
    // rendered here, so unfavoriting a card removes it from this grid instantly.
    const { favoriteIds } = useFavorites();

    useEffect(() => {
        if (_hasHydrated && !isAuthenticated) router.push("/login?next=/account/favorites");
    }, [_hasHydrated, isAuthenticated, router]);

    const { data, isLoading } = useQuery({
        queryKey: ["favorites"],
        queryFn: () => favoritesApi.list().then((r) => r.data as FavoriteProduct[]),
        enabled: _hasHydrated && isAuthenticated,
    });

    const products = (data ?? []).filter((p) => favoriteIds.includes(p.id));

    if (!_hasHydrated || isLoading) {
        return (
            <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-8">
                <div className="h-8 w-48 bg-[#e9eaed] animate-pulse rounded mb-7" />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="animate-pulse bg-[#e9eaed] rounded-2xl aspect-[3/4]" />
                    ))}
                </div>
            </div>
        );
    }

    if (products.length === 0) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-24 text-center">
                <Heart size={64} className="text-gray-300 mx-auto mb-6" />
                <h1 className="text-2xl font-bold text-[#14151a] mb-2">No favorites yet</h1>
                <p className="text-[#6b7078] mb-8">
                    Tap the heart on any product to save it here for later.
                </p>
                <Link href="/products" className="inline-block glass-btn px-8 py-3 rounded-xl text-sm">
                    Browse Products
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-8">
            <h1 className="text-3xl font-bold text-[#14151a] mb-1">My Favorites</h1>
            <p className="text-sm text-[#6b7078] mb-7">
                {products.length} saved {products.length === 1 ? "product" : "products"}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                {products.map((p) => (
                    <DealCardV2 key={p.id} product={p} />
                ))}
            </div>
        </div>
    );
}
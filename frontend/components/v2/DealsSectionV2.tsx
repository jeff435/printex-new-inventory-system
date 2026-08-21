"use client";
import { useQuery } from "@tanstack/react-query";
import { productsApi } from "@/lib/api";
import { DealCardV2 } from "@/components/v2/DealCardV2";
import { Flame } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Product {
    id: string;
    name: string;
    slug: string;
    price_kes: number;
    compare_price_kes?: number;
    thumbnail_url?: string;
    unit?: string;
    unit_value?: number;
    status: string;
}

// Countdown target is purely presentational — resets to a fixed offset from
// page load since the backend has no flash-sale end-time field. Swap for a
// real value if/when one exists.
function useCountdown() {
    const [remaining, setRemaining] = useState(2 * 3600 + 14 * 60 + 36);

    useEffect(() => {
        const t = setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000);
        return () => clearInterval(t);
    }, []);

    const hrs = String(Math.floor(remaining / 3600)).padStart(2, "0");
    const mins = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
    const secs = String(remaining % 60).padStart(2, "0");
    return { hrs, mins, secs };
}

export function DealsSectionV2() {
    const { data, isLoading } = useQuery({
        queryKey: ["products", "featured"],
        queryFn: () => productsApi.list({ limit: 12 }).then((r) => r.data),
    });

    const products: Product[] = data?.items ?? [];
    const { hrs, mins, secs } = useCountdown();

    return (
        <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-[var(--v2-text)]">Today&apos;s Deals</h2>
                    <span className="v2-badge-deal !bg-[var(--v2-deal-bg)] !text-[var(--v2-deal)] flex items-center gap-1">
                        <Flame size={12} />
                        Flash Sale
                    </span>
                    <span className="text-xs text-[var(--v2-text-faint)]">Ends in</span>
                    <div className="flex items-center gap-1">
                        {[
                            { v: hrs, label: "HRS" },
                            { v: mins, label: "MINS" },
                            { v: secs, label: "SECS" },
                        ].map(({ v, label }, i, arr) => (
                            <div key={i} className="flex items-center gap-1">
                                <div className="flex flex-col items-center">
                                    <span className="bg-[var(--v2-text)] text-white text-xs font-bold rounded px-1.5 py-0.5 min-w-[26px] text-center">
                                        {v}
                                    </span>
                                    <span className="text-[8px] text-[var(--v2-text-faint)] tracking-wide mt-0.5">{label}</span>
                                </div>
                                {i < arr.length - 1 && <span className="text-[var(--v2-text-faint)] font-bold pb-3">:</span>}
                            </div>
                        ))}
                    </div>
                </div>
                <Link href="/products?is_online_exclusive=true" className="text-sm font-medium text-[var(--v2-text)] hover:text-[var(--v2-accent)] transition-colors flex items-center gap-1">
                    View all deals →
                </Link>
            </div>

            {isLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="animate-pulse bg-[var(--v2-surface-muted)] rounded-xl aspect-[3/4]" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                    {products.map((p) => (
                        <DealCardV2 key={p.id} product={p} />
                    ))}
                </div>
            )}
        </section>
    );
}
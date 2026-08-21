"use client";
import { Star } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ratingsApi } from "@/lib/api";
import { useAuthStore } from "@/stores";

interface Summary {
    product_id: string;
    rating_avg: number | null;
    rating_count: number;
    my_stars: number | null;
}

/**
 * Interactive star input for a single product.
 *
 * Only signed-in users can rate; signed-out visitors get sent to /login with a
 * `next` param so they land back here. Clicking the same star again clears the
 * rating, which is the behaviour people expect from a star widget and saves
 * needing a separate "remove" affordance.
 *
 * Follows the same optimistic-update shape as useFavorites so the UI responds
 * immediately and rolls back on failure.
 */
export function RateProduct({ productId }: { productId: string }) {
    const { isAuthenticated, _hasHydrated } = useAuthStore();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [hovered, setHovered] = useState<number | null>(null);

    const { data } = useQuery({
        queryKey: ["rating", productId],
        queryFn: () => ratingsApi.summary(productId).then((r) => r.data as Summary),
        enabled: _hasHydrated,
    });

    const mine = data?.my_stars ?? null;

    const mutation = useMutation({
        mutationFn: async (stars: number | null) =>
            stars === null
                ? ratingsApi.remove(productId).then((r) => r.data as Summary)
                : ratingsApi.rate(productId, stars).then((r) => r.data as Summary),
        onMutate: async (stars) => {
            await queryClient.cancelQueries({ queryKey: ["rating", productId] });
            const previous = queryClient.getQueryData<Summary>(["rating", productId]);
            if (previous) {
                queryClient.setQueryData<Summary>(["rating", productId], {
                    ...previous,
                    my_stars: stars,
                });
            }
            return { previous };
        },
        onError: (_e, _v, ctx) => {
            if (ctx?.previous) queryClient.setQueryData(["rating", productId], ctx.previous);
            toast.error("Couldn't save your rating");
        },
        onSuccess: (summary, stars) => {
            queryClient.setQueryData(["rating", productId], summary);
            // Listings show the aggregate, so refresh them too.
            queryClient.invalidateQueries({ queryKey: ["products"] });
            toast.success(stars === null ? "Rating removed" : "Thanks for rating");
        },
    });

    const handleClick = (stars: number) => {
        if (!_hasHydrated) return;
        if (!isAuthenticated) {
            router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
            return;
        }
        // Clicking your current rating again clears it.
        mutation.mutate(mine === stars ? null : stars);
    };

    const active = hovered ?? mine ?? 0;

    return (
        <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-0.5" onMouseLeave={() => setHovered(null)}>
                {[1, 2, 3, 4, 5].map((n) => (
                    <button
                        key={n}
                        type="button"
                        onClick={() => handleClick(n)}
                        onMouseEnter={() => setHovered(n)}
                        disabled={mutation.isPending}
                        aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
                        className="p-0.5 transition-transform hover:scale-110 disabled:opacity-50"
                    >
                        <Star
                            size={26}
                            strokeWidth={1.5}
                            className={n <= active ? "text-[var(--v2-star)]" : "text-[#c9ced6]"}
                            fill={n <= active ? "currentColor" : "none"}
                        />
                    </button>
                ))}
            </div>

            <span className="text-sm text-[var(--v2-text-muted)]">
                {mine ? "Your rating — click again to remove" : "Rate this product"}
            </span>
        </div>
    );
}

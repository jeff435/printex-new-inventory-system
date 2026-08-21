"use client";
import { Star } from "lucide-react";

/**
 * Read-only star display.
 *
 * Renders five stars with the average expressed as a partial fill on the last
 * lit star, so 4.6 reads as four full stars plus a 60%-filled fifth. The fill
 * is done by clipping a gold layer over a grey one — cheaper and sharper than
 * per-star half-star glyphs, and it handles any fraction, not just halves.
 *
 * `showCount` controls whether the numeric average and rating count appear
 * alongside. Off by default: the storefront brief asked for stars alone.
 */
export function StarRating({
    value,
    count,
    size = 15,
    showCount = false,
    className = "",
}: {
    value?: number | null;
    count?: number | null;
    size?: number;
    showCount?: boolean;
    className?: string;
}) {
    // No ratings yet — render nothing rather than five empty stars, which would
    // read as a genuine one-star-average product.
    if (value == null || !count) return null;

    const pct = Math.max(0, Math.min(100, (value / 5) * 100));

    return (
        <div className={`flex items-center gap-1.5 ${className}`} aria-label={`Rated ${value.toFixed(1)} out of 5 from ${count} ratings`}>
            <span className="relative inline-flex" style={{ lineHeight: 0 }}>
                {/* Grey base layer */}
                <span className="flex" aria-hidden>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={size} className="text-[#d6dae0]" fill="currentColor" strokeWidth={0} />
                    ))}
                </span>
                {/* Gold layer, clipped to the average */}
                <span
                    className="flex absolute inset-0 overflow-hidden"
                    style={{ width: `${pct}%` }}
                    aria-hidden
                >
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                            key={i}
                            size={size}
                            className="text-[var(--v2-star)] flex-shrink-0"
                            fill="currentColor"
                            strokeWidth={0}
                        />
                    ))}
                </span>
            </span>

            {showCount && (
                <>
                    <span className="text-sm font-semibold text-[var(--v2-text)]">{value.toFixed(1)}</span>
                    <span className="text-sm text-[var(--v2-text-faint)]">({count})</span>
                </>
            )}
        </div>
    );
}

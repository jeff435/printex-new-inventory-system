"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function PromoCardV2() {
    return (
        <div className="v2-promo-card">
            <h3 className="text-2xl font-extrabold text-[var(--v2-text)] mb-1.5">Get 20% Off</h3>
            <p className="text-sm text-[var(--v2-text-muted)] mb-6">On your first order</p>

            <p className="text-xs text-[var(--v2-text-faint)] mb-2">Use code:</p>
            <span className="v2-badge-accent text-xs px-3 py-1.5">PRINTEX20</span>

            <Link href="/products" className="v2-btn-primary w-full mt-9 text-sm py-4">
                Browse parts
                <ArrowRight size={18} />
            </Link>
        </div>
    );
}
"use client";
import { useCartStore } from "@/stores";
import { useFavorites } from "@/hooks/useFavorites";
import { ShoppingCart, Plus, Minus, Heart } from "lucide-react";
import { StarRating } from "@/components/v2/StarRating";
import Link from "next/link";
import toast from "react-hot-toast";

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
    // Aggregates maintained by the backend (app/ratings). Null until a product
    // has been rated, so the star row is hidden rather than showing zero stars.
    rating_avg?: number | null;
    rating_count?: number | null;
}

export function DealCardV2({ product }: { product: Product }) {
    const { items, addItem, updateQuantity } = useCartStore();
    const { isFavorited, toggleFavorite } = useFavorites();
    const cartItem = items.find((i) => i.product_id === product.id);
    const qty = cartItem?.quantity ?? 0;
    const favorited = isFavorited(product.id);

    const priceKes = product.price_kes / 100;
    const compareKes = product.compare_price_kes ? product.compare_price_kes / 100 : null;
    const discount = compareKes ? Math.round(((compareKes - priceKes) / compareKes) * 100) : null;

    const handleAdd = () => {
        addItem({
            product_id: product.id,
            name: product.name,
            slug: product.slug,
            price_kes: product.price_kes,
            thumbnail_url: product.thumbnail_url ?? null,
            unit: product.unit ?? null,
        });
        toast.success(`${product.name} added`);
    };

    return (
        <div className="v2-product-card flex flex-col overflow-hidden group">
            <Link href={`/products/${product.slug}`} className="relative block">
                <div className="product-image-area aspect-[1.05] overflow-hidden p-4">
                    {product.thumbnail_url ? (
                        <img
                            src={product.thumbnail_url}
                            alt={product.name}
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">🔧</div>
                    )}
                </div>
                {discount ? <span className="v2-badge-deal absolute top-3 left-3">-{discount}%</span> : null}
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        toggleFavorite(product.id);
                    }}
                    className={`absolute top-3 right-3 w-7 h-7 flex items-center justify-center transition-colors ${favorited ? "text-[var(--v2-deal)]" : "text-[var(--v2-text-faint)] hover:text-[var(--v2-deal)]"
                        }`}
                    aria-label={favorited ? "Remove from favorites" : "Save to favorites"}
                >
                    <Heart size={17} fill={favorited ? "currentColor" : "none"} />
                </button>
            </Link>

            <div className="p-3.5 flex flex-col flex-1">
                <Link href={`/products/${product.slug}`}>
                    <p className="text-[1rem] font-semibold text-[var(--v2-text)] line-clamp-2 mb-1.5 leading-snug hover:text-[var(--v2-accent)] transition-colors">
                        {product.name}
                    </p>
                </Link>

                <StarRating value={product.rating_avg} count={product.rating_count} className="mb-2" />

                {product.unit && (
                    <p className="text-xs text-[var(--v2-text-faint)] mb-3">
                        {product.unit_value ? `${product.unit_value} ` : ""}{product.unit}
                    </p>
                )}

                <div className="mt-auto flex items-end justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                        <p className="text-lg font-bold text-[var(--v2-text)] leading-tight">KES {priceKes.toLocaleString()}</p>
                        {compareKes && <p className="v2-price-strike text-xs leading-tight">KES {compareKes.toLocaleString()}</p>}
                    </div>

                    {qty === 0 ? (
                        <button onClick={handleAdd} className="v2-btn-add shrink-0">
                            <ShoppingCart size={13} />
                            Add
                        </button>
                    ) : (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => updateQuantity(product.id, qty - 1)}
                                className="w-8 h-8 rounded-full border border-[var(--v2-border)] hover:bg-[var(--v2-surface-muted)] flex items-center justify-center transition-colors text-[var(--v2-text)]"
                            >
                                <Minus size={13} />
                            </button>
                            <span className="text-sm font-bold w-5 text-center text-[var(--v2-text)]">{qty}</span>
                            <button
                                onClick={() =>
                                    addItem({
                                        product_id: product.id,
                                        name: product.name,
                                        slug: product.slug,
                                        price_kes: product.price_kes,
                                        thumbnail_url: product.thumbnail_url ?? null,
                                        unit: product.unit ?? null,
                                    })
                                }
                                className="w-8 h-8 rounded-full bg-[var(--v2-text)] text-white flex items-center justify-center hover:bg-[var(--v2-cta-bg-hover)] transition-colors"
                            >
                                <Plus size={13} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
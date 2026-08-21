"use client";
import { useQuery } from "@tanstack/react-query";
import { productsApi } from "@/lib/api";
import { useCartStore } from "@/stores";
import { StarRating } from "@/components/v2/StarRating";
import { RateProduct } from "@/components/v2/RateProduct";
import { ShoppingCart, Plus, Minus, ChevronRight, Tag, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import toast from "react-hot-toast";

interface ProductDetail {
    id: string;
    sku: string;
    name: string;
    slug: string;
    description: string | null;
    short_description: string | null;
    price_kes: number;
    compare_price_kes: number | null;
    weight_grams: number | null;
    unit: string | null;
    unit_value: number | null;
    images: { url: string; alt?: string }[];
    thumbnail_url: string | null;
    tags: string[];
    is_age_restricted: boolean;
    is_online_exclusive: boolean;
    is_private_label: boolean;
    status: string;
    rating_avg: number | null;
    rating_count: number;
    category: { id: string; name: string; slug: string } | null;
    brand: { id: string; name: string; slug: string; logo_url: string | null } | null;
}

function ProductDetailContent() {
    const params = useParams();
    const slug = params.slug as string;

    const { items, addItem, updateQuantity } = useCartStore();
    const cartItem = items.find((i) => i.product_id !== undefined && i.slug === slug);

    const { data: product, isLoading, isError } = useQuery<ProductDetail>({
        queryKey: ["product", slug],
        queryFn: () => productsApi.get(slug).then((r) => r.data),
        enabled: !!slug,
    });

    // Derive cart item by product id once we have the product
    const cartEntry = product ? items.find((i) => i.product_id === product.id) : null;
    const qty = cartEntry?.quantity ?? 0;

    if (isLoading) {
        return (
            <div className="max-w-5xl mx-auto px-4 py-10">
                {/* Breadcrumb skeleton */}
                <div className="h-4 w-48 bg-gray-200 animate-pulse rounded mb-8" />
                <div className="grid md:grid-cols-2 gap-10">
                    <div className="aspect-square bg-gray-200 animate-pulse rounded-2xl" />
                    <div className="space-y-4">
                        <div className="h-6 w-3/4 bg-gray-200 animate-pulse rounded" />
                        <div className="h-4 w-1/4 bg-gray-200 animate-pulse rounded" />
                        <div className="h-10 w-1/3 bg-gray-200 animate-pulse rounded" />
                        <div className="h-4 w-full bg-gray-200 animate-pulse rounded" />
                        <div className="h-4 w-5/6 bg-gray-200 animate-pulse rounded" />
                        <div className="h-12 w-full bg-gray-200 animate-pulse rounded-xl mt-6" />
                    </div>
                </div>
            </div>
        );
    }

    if (isError || !product) {
        return (
            <div className="max-w-5xl mx-auto px-4 py-20 text-center">
                <AlertCircle size={48} className="text-[#c3c6cb] mx-auto mb-4" />
                <h1 className="text-xl font-bold text-[#14151a] mb-2">Product not found</h1>
                <p className="text-[#6b7078] mb-6">This product may no longer be available.</p>
                <Link
                    href="/products"
                    className="inline-block bg-[#14151a] text-white font-semibold px-6 py-3 rounded-xl hover:bg-[#2a2c33] transition-colors text-sm"
                >
                    Browse Products
                </Link>
            </div>
        );
    }

    const priceKes = product.price_kes / 100;
    const compareKes = product.compare_price_kes ? product.compare_price_kes / 100 : null;
    const discount = compareKes
        ? Math.round(((compareKes - priceKes) / compareKes) * 100)
        : null;

    // Build image list — prefer images array, fall back to thumbnail
    const imageList: string[] =
        product.images?.length > 0
            ? product.images.map((img) => (typeof img === "string" ? img : img.url))
            : product.thumbnail_url
                ? [product.thumbnail_url]
                : [];

    const handleAdd = () => {
        addItem({
            product_id: product.id,
            name: product.name,
            slug: product.slug,
            price_kes: product.price_kes,
            thumbnail_url: product.thumbnail_url ?? null,
            unit: product.unit ?? null,
        });
        toast.success(`${product.name} added to cart`);
    };

    return (
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-8">

            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-xs text-[#6b7078] mb-8">
                <Link href="/" className="hover:text-[#2f8f4e]">Home</Link>
                <ChevronRight size={12} />
                <Link href="/products" className="hover:text-[#2f8f4e]">Products</Link>
                {product.category && (
                    <>
                        <ChevronRight size={12} />
                        <Link
                            href={`/products?category_id=${product.category.id}`}
                            className="hover:text-[#2f8f4e]"
                        >
                            {product.category.name}
                        </Link>
                    </>
                )}
                <ChevronRight size={12} />
                <span className="text-[#14151a] font-medium truncate max-w-[200px]">{product.name}</span>
            </nav>

            <div className="grid md:grid-cols-2 gap-10">

                {/* Image */}
                <div className="space-y-3">
                    <div className="aspect-square glass-panel overflow-hidden flex items-center justify-center relative">
                        {imageList.length > 0 ? (
                            <img
                                src={imageList[0]}
                                alt={product.name}
                                className="w-full h-full object-contain p-6"
                            />
                        ) : (
                            <div className="text-8xl text-gray-200">🔧</div>
                        )}
                        {discount && (
                            <span className="absolute top-4 left-4 bg-[#e1483d] text-white text-xs font-bold px-2.5 py-1 rounded-full">
                                -{discount}%
                            </span>
                        )}
                        {product.is_online_exclusive && (
                            <span className="absolute top-4 right-4 bg-[#14151a] text-white text-xs font-bold px-2.5 py-1 rounded-full">
                                Online Only
                            </span>
                        )}
                    </div>

                    {/* Thumbnail strip — only shown if multiple images */}
                    {imageList.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {imageList.map((url, i) => (
                                <div
                                    key={i}
                                    className="w-16 h-16 flex-shrink-0 glass-card overflow-hidden"
                                >
                                    <img src={url} alt={`${product.name} ${i + 1}`} className="w-full h-full object-contain p-1" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex flex-col">

                    {/* Brand */}
                    {product.brand && (
                        <p className="text-xs font-semibold text-[#2f8f4e] uppercase tracking-wide mb-1">
                            {product.brand.name}
                        </p>
                    )}

                    {/* Name */}
                    <h1 className="text-2xl font-bold text-[#14151a] leading-snug mb-1">
                        {product.name}
                    </h1>

                    {/* Aggregate rating */}
                    <StarRating
                        value={product.rating_avg}
                        count={product.rating_count}
                        size={17}
                        className="mb-2"
                    />

                    {/* Unit */}
                    {product.unit && (
                        <p className="text-sm text-[#9ca0a8] mb-4">
                            {product.unit_value} {product.unit}
                        </p>
                    )}

                    {/* Price */}
                    <div className="flex items-baseline gap-3 mb-6">
                        <span className="text-3xl font-bold text-[#14151a]">
                            KES {priceKes.toLocaleString()}
                        </span>
                        {compareKes && (
                            <span className="text-base text-[#9ca0a8] line-through">
                                KES {compareKes.toLocaleString()}
                            </span>
                        )}
                        {discount && (
                            <span className="text-sm font-semibold text-[#e1483d]">
                                Save {discount}%
                            </span>
                        )}
                    </div>

                    {/* Short description */}
                    {product.short_description && (
                        <p className="text-sm text-[#6b7078] leading-relaxed mb-6">
                            {product.short_description}
                        </p>
                    )}

                    {/* Age restriction warning */}
                    {product.is_age_restricted && (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-xs text-amber-700">
                            <AlertCircle size={14} />
                            Age-restricted product. You must be 18+ to purchase.
                        </div>
                    )}

                    {/* Add to cart */}
                    <div className="mt-auto">
                        {qty === 0 ? (
                            <button
                                onClick={handleAdd}
                                className="w-full flex items-center justify-center gap-2 bg-[#14151a] hover:bg-[#2a2c33] text-white font-semibold py-3.5 rounded-xl transition-colors text-sm"
                            >
                                <ShoppingCart size={18} />
                                Add to Cart
                            </button>
                        ) : (
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-3 glass-card px-4 py-2">
                                    <button
                                        onClick={() => updateQuantity(product.id, qty - 1)}
                                        className="w-8 h-8 rounded-full bg-[#f0f1f3] hover:bg-gray-200 flex items-center justify-center transition-colors"
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <span className="text-lg font-bold w-8 text-center">{qty}</span>
                                    <button
                                        onClick={handleAdd}
                                        className="w-8 h-8 rounded-full bg-[#14151a] hover:bg-[#2a2c33] text-white flex items-center justify-center transition-colors"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                                <Link
                                    href="/cart"
                                    className="flex-1 text-center bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm"
                                >
                                    View Cart
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Rate this product — signed-in users only; the control
                        redirects to /login for everyone else. */}
                    <div className="mt-6 pt-6 border-t border-[#e6e8eb]">
                        <RateProduct productId={product.id} />
                    </div>

                    {/* Meta */}
                    <div className="mt-6 pt-6 border-t border-[#e6e8eb] space-y-2 text-xs text-[#6b7078]">
                        <div className="flex gap-2">
                            <span className="font-medium text-[#4b5058] w-20">SKU</span>
                            <span>{product.sku}</span>
                        </div>
                        {product.category && (
                            <div className="flex gap-2">
                                <span className="font-medium text-[#4b5058] w-20">Category</span>
                                <Link
                                    href={`/products?category_id=${product.category.id}`}
                                    className="hover:text-[#2f8f4e]"
                                >
                                    {product.category.name}
                                </Link>
                            </div>
                        )}
                        {product.weight_grams && (
                            <div className="flex gap-2">
                                <span className="font-medium text-[#4b5058] w-20">Weight</span>
                                <span>{product.weight_grams}g</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Full description */}
            {product.description && (
                <div className="mt-12 glass-panel p-6">
                    <h2 className="font-bold text-[#14151a] mb-3">About this product</h2>
                    <p className="text-sm text-[#6b7078] leading-relaxed whitespace-pre-line">
                        {product.description}
                    </p>
                </div>
            )}

            {/* Tags */}
            {product.tags?.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                    {product.tags.map((tag: string, i: number) => (
                        <span
                            key={i}
                            className="flex items-center gap-1 text-xs bg-[#f0f1f3] text-[#6b7078] px-3 py-1 rounded-full"
                        >
                            <Tag size={10} />
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function ProductDetailPage() {
    return (
        <Suspense>
            <ProductDetailContent />
        </Suspense>
    );
}
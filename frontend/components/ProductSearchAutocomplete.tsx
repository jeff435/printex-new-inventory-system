"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useOnClickOutside } from "usehooks-ts";
import { api } from "@/lib/api";
import { Search, Loader2 } from "lucide-react";

type Suggestion = {
    id: string;
    name: string;
    slug: string;
    price_kes: number;
    compare_price_kes: number | null;
    thumbnail_url: string | null;
    unit: string | null;
};

type Props = {
    variant?: "navbar" | "page";
    placeholder?: string;
    autoFocus?: boolean;
    onNavigate?: () => void;
};

const INPUT_STYLES = {
    navbar:
        "w-full pl-9 pr-12 py-2 text-sm rounded-lg border border-white/15 bg-[#f0f1f3] text-[#14151a] placeholder:text-[#9ca0a8] focus:outline-none focus:ring-2 focus:ring-[#2f8f4e]/20 focus:bg-white transition-all",
    page:
        "input-light w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8FA878] placeholder:text-gray-400",
};

const ICON_STYLES = {
    navbar: "text-[#9ca0a8]",
    page: "text-gray-400",
};

export default function ProductSearchAutocomplete({
    variant = "navbar",
    placeholder = "Search products, brands...",
    autoFocus = false,
    onNavigate,
}: Props) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    const [open, setOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(-1);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useOnClickOutside(wrapperRef as React.RefObject<HTMLElement>, () => setOpen(false));

    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 250);
        return () => clearTimeout(t);
    }, [query]);

    const { data, isFetching } = useQuery({
        queryKey: ["product-search-suggest", debounced],
        queryFn: () =>
            api.get("/products", { params: { search: debounced, limit: 6 } }).then((r) => r.data),
        enabled: debounced.length >= 2,
    });

    const suggestions: Suggestion[] = data?.items ?? [];
    const showDropdown = open && debounced.length >= 2;

    const goToProduct = (slug: string) => {
        setOpen(false);
        setQuery("");
        onNavigate?.();
        router.push(`/products/${slug}`);
    };

    const goToFullResults = (term: string) => {
        if (!term.trim()) return;
        setOpen(false);
        onNavigate?.();
        router.push(`/products?search=${encodeURIComponent(term)}`);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (highlighted >= 0 && suggestions[highlighted]) {
            goToProduct(suggestions[highlighted].slug);
        } else {
            goToFullResults(query);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showDropdown || suggestions.length === 0) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlighted((h) => (h + 1) % suggestions.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    };

    const formatPrice = (kes: number) => `KES ${(kes / 100).toLocaleString()}`;

    return (
        <div ref={wrapperRef} className="relative w-full">
            <form onSubmit={handleSubmit}>
                <div className="relative">
                    <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${ICON_STYLES[variant]}`} />
                    <input
                        value={query}
                        autoFocus={autoFocus}
                        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlighted(-1); }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        className={INPUT_STYLES[variant]}
                    />
                    {isFetching && debounced.length >= 2 && (
                        <Loader2 size={14} className={`absolute right-3 top-1/2 -translate-y-1/2 animate-spin ${ICON_STYLES[variant]}`} />
                    )}
                    {!isFetching && variant === "navbar" && (
                        <kbd className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 items-center text-[11px] font-semibold text-[#9ca0a8] bg-white border border-[#e6e8eb] rounded-md px-1.5 py-0.5 pointer-events-none">
                            ⌘K
                        </kbd>
                    )}
                </div>
            </form>

            {showDropdown && (
                <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-[60] max-h-[28rem] overflow-y-auto">
                    {suggestions.length === 0 && !isFetching ? (
                        <p className="text-sm text-gray-400 text-center py-6">
                            No products found for &ldquo;{debounced}&rdquo;
                        </p>
                    ) : (
                        <>
                            <ul>
                                {suggestions.map((p, i) => (
                                    <li key={p.id}>
                                        <button
                                            type="button"
                                            onClick={() => goToProduct(p.slug)}
                                            onMouseEnter={() => setHighlighted(i)}
                                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${highlighted === i ? "bg-[#F3EEDD]" : "hover:bg-gray-50"}`}
                                        >
                                            <div className="w-11 h-11 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                                                {p.thumbnail_url
                                                    ? <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover" />
                                                    : <span className="text-lg">🔧</span>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 line-clamp-1">{p.name}</p>
                                                {p.unit && <p className="text-xs text-gray-400">{p.unit}</p>}
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className="text-sm font-bold text-gray-900">{formatPrice(p.price_kes)}</p>
                                                {p.compare_price_kes && p.compare_price_kes > p.price_kes && (
                                                    <p className="text-xs text-gray-400 line-through">{formatPrice(p.compare_price_kes)}</p>
                                                )}
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <button
                                type="button"
                                onClick={() => goToFullResults(debounced)}
                                className="w-full text-center text-xs font-semibold text-[#2f8f4e] hover:bg-[#eaf6ee] py-3 border-t border-gray-100"
                            >
                                See all results for &ldquo;{debounced}&rdquo;
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
"use client";
import { useQuery } from "@tanstack/react-query";
import { productsApi } from "@/lib/api";
import { DealCardV2 } from "@/components/v2/DealCardV2";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense, useEffect, useRef } from "react";
import { SlidersHorizontal, Search, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useOnClickOutside } from "usehooks-ts";

type Suggestion = {
  id: string;
  name: string;
  slug: string;
  price_kes: number;
  compare_price_kes: number | null;
  thumbnail_url: string | null;
  unit: string | null;
};

function ProductsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [page, setPage] = useState(1);

  const urlSearch = searchParams.get("search") || "";
  const [query, setQuery] = useState(urlSearch);
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(wrapperRef as React.RefObject<HTMLElement>, () => setOpen(false));

  useEffect(() => {
    setQuery(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: suggestions, isFetching: suggestFetching } = useQuery({
    queryKey: ["product-search-suggest-page", debounced],
    queryFn: () =>
      api.get("/products", { params: { search: debounced, limit: 6 } }).then((r) => r.data),
    enabled: debounced.length >= 2 && open,
  });

  const suggestionItems: Suggestion[] = suggestions?.items ?? [];
  const showDropdown = open && debounced.length >= 2;

  const params = {
    search: urlSearch || undefined,
    category_id: searchParams.get("category_id") || undefined,
    is_online_exclusive: searchParams.get("is_online_exclusive") || undefined,
    page,
    limit: 24,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["products", params],
    queryFn: () => productsApi.list(params).then((r) => r.data),
  });

  const heading = urlSearch ? `Results for "${urlSearch}"` : "All Products";

  const goToProduct = (slug: string) => {
    setOpen(false);
    router.push(`/products/${slug}`);
  };

  const doSearch = (term: string) => {
    if (!term.trim()) {
      router.push("/products");
    } else {
      router.push(`/products?search=${encodeURIComponent(term.trim())}`);
    }
    setOpen(false);
    setPage(1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (highlighted >= 0 && suggestionItems[highlighted]) {
      goToProduct(suggestionItems[highlighted].slug);
    } else {
      doSearch(query);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestionItems.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((h) => (h + 1) % suggestionItems.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((h) => (h <= 0 ? suggestionItems.length - 1 : h - 1)); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  const formatPrice = (kes: number) => `KES ${(kes / 100).toLocaleString()}`;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-7">
      <div ref={wrapperRef} className="relative max-w-2xl mb-7">
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlighted(-1); }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search products, brands..."
              className="input-light w-full pl-9 pr-10 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-gray-400 shadow-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(""); doSearch(""); setOpen(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
            {suggestFetching && debounced.length >= 2 && !query && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
            )}
          </div>
        </form>

        {showDropdown && (
          <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-[60] max-h-[28rem] overflow-y-auto">
            {suggestionItems.length === 0 && !suggestFetching ? (
              <p className="text-sm text-gray-400 text-center py-6">
                No products found for &ldquo;{debounced}&rdquo;
              </p>
            ) : (
              <>
                <ul>
                  {suggestionItems.map((p, i) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => goToProduct(p.slug)}
                        onMouseEnter={() => setHighlighted(i)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${highlighted === i ? "bg-[#eaf6ee]" : "hover:bg-gray-50"}`}
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
                  onClick={() => doSearch(debounced)}
                  className="w-full text-center text-xs font-semibold text-[#2f8f4e] hover:bg-[#eaf6ee] py-3 border-t border-gray-100"
                >
                  See all results for &ldquo;{debounced}&rdquo;
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#14151a]">{heading}</h1>
          {data && <p className="text-[#14151a]/60 text-sm mt-0.5">{data.total} products</p>}
        </div>
        <button className="glass-btn-ghost flex items-center gap-2 text-sm px-4 py-2">
          <SlidersHorizontal size={15} />
          Filters
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-[#e9eaed] rounded-2xl aspect-[3/4]" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {data?.items.map((p: any) => <DealCardV2 key={p.id} product={p} />)}
          </div>
          {data && data.pages > 1 && (
            <div className="flex justify-center gap-2 mt-10">
              {Array.from({ length: data.pages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`w-9 h-9 rounded-xl text-sm font-medium transition-all ${page === n ? "glass-btn" : "glass-btn-ghost"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsContent />
    </Suspense>
  );
}
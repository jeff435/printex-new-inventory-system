"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, productsApi } from "@/lib/api";
import { useAdminBranchStore } from "@/stores";
import toast from "react-hot-toast";
import { Search, Plus, Minus } from "lucide-react";

type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

const STOCK_STYLE: Record<StockStatus, string> = {
    IN_STOCK: "bg-green-100 text-green-700",
    LOW_STOCK: "bg-yellow-100 text-yellow-700",
    OUT_OF_STOCK: "bg-red-100 text-red-600",
};

const STOCK_LABEL: Record<StockStatus, string> = {
    IN_STOCK: "In stock",
    LOW_STOCK: "Low stock",
    OUT_OF_STOCK: "Out of stock",
};

const INP = "px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 placeholder:text-gray-400";

export default function AdminInventoryPage() {
    const queryClient = useQueryClient();
    const { selectedBranchId } = useAdminBranchStore();
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");

    const { data: categories } = useQuery({
        queryKey: ["admin-categories-inventory"],
        queryFn: () => productsApi.categories().then((r) => r.data),
    });
    const categoryNameById: Record<string, string> = Object.fromEntries(
        (categories ?? []).map((c: any) => [c.id, c.name])
    );
    const sortedCategories = [...(categories ?? [])].sort((a: any, b: any) =>
        a.name.localeCompare(b.name)
    );

    const { data, isLoading } = useQuery({
        queryKey: ["admin-inventory", search, filter, selectedBranchId],
        queryFn: () =>
            api.get("/inventory", {
                params: {
                    limit: 100,
                    branch_id: selectedBranchId || undefined,
                    search: search || undefined,
                    stock_status: filter === "all" ? undefined : filter,
                },
            }).then((r) => r.data),
        enabled: selectedBranchId !== null,
    });

    // Simple +/- restock: each click moves stock by 1 unit via the same
    // restock endpoint (negative isn't supported server-side, so a minus
    // click uses the inventory PATCH to set quantity_on_hand - 1 directly).
    const bumpMutation = useMutation({
        mutationFn: ({ inventoryId, productId, delta, currentQty }: { inventoryId: string; productId: string; delta: number; currentQty: number }) => {
            if (delta > 0) {
                return api.post(`/inventory/restock/${productId}/${selectedBranchId}`, null, {
                    params: { quantity: delta },
                });
            }
            const next = Math.max(0, currentQty - 1);
            return api.patch(`/inventory/${inventoryId}`, { quantity_on_hand: next });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || "Stock update failed"),
    });

    const allItems = data?.items ?? [];
    const items = categoryFilter === "all"
        ? allItems
        : allItems.filter((item: any) => item.product?.category_id === categoryFilter);

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="admin-toolbar flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search products, SKU, or part number..."
                        className={`w-full pl-9 pr-4 ${INP}`}
                    />
                </div>
                <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className={INP}
                >
                    <option value="all">All stock</option>
                    <option value="IN_STOCK">In stock</option>
                    <option value="LOW_STOCK">Low stock</option>
                    <option value="OUT_OF_STOCK">Out of stock</option>
                </select>
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className={INP}
                >
                    <option value="all">All categories</option>
                    {sortedCategories.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-2xl" />
                    ))}
                </div>
            ) : !selectedBranchId && selectedBranchId !== "" ? (
                <div className="admin-card p-12 text-center text-gray-400 text-sm">
                    Select a branch from the header to view inventory.
                </div>
            ) : items.length === 0 ? (
                <div className="admin-card p-12 text-center text-gray-400 text-sm">
                    No inventory records found.
                </div>
            ) : (
                <div className="admin-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/80">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Part #</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Category</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">On Hand</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reserved</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Available</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Restock</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {items.map((item: any) => {
                                    const available = Math.max(0, item.quantity_on_hand - item.quantity_reserved);
                                    const status = item.stock_status as StockStatus;
                                    const busy = bumpMutation.isPending && bumpMutation.variables?.inventoryId === item.id;
                                    return (
                                        <tr key={item.id} className="hover:bg-blue-50/40 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-900 line-clamp-1">{item.product?.name}</p>
                                                <p className="text-xs text-gray-400 font-mono">{item.product?.sku}</p>
                                            </td>
                                            <td className="px-4 py-3 hidden sm:table-cell">
                                                {item.product?.part_number
                                                    ? <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded-lg">{item.product.part_number}</span>
                                                    : <span className="text-xs text-gray-300">—</span>}
                                            </td>
                                            <td className="px-4 py-3 hidden md:table-cell">
                                                <span className="text-xs text-gray-500">
                                                    {item.product?.category_id ? (categoryNameById[item.product.category_id] ?? "—") : "—"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center font-bold text-gray-900">{item.quantity_on_hand}</td>
                                            <td className="px-4 py-3 text-center text-gray-500">{item.quantity_reserved}</td>
                                            <td className="px-4 py-3 text-center font-bold text-gray-900">{available}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STOCK_STYLE[status] ?? "bg-gray-100 text-gray-500"}`}>
                                                    {STOCK_LABEL[status] ?? status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {selectedBranchId === "" ? (
                                                    <p className="text-right text-xs text-gray-400">Pick a branch to restock</p>
                                                ) : (
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => bumpMutation.mutate({
                                                                inventoryId: item.id,
                                                                productId: item.product_id,
                                                                delta: -1,
                                                                currentQty: item.quantity_on_hand,
                                                            })}
                                                            disabled={busy || item.quantity_on_hand <= 0}
                                                            className="glass-icon-btn w-8 h-8 disabled:opacity-40"
                                                            title="Remove 1 unit"
                                                        >
                                                            <Minus size={13} />
                                                        </button>
                                                        <span className="w-8 text-center text-sm font-semibold text-gray-700 select-none">
                                                            {busy ? "…" : ""}
                                                        </span>
                                                        <button
                                                            onClick={() => bumpMutation.mutate({
                                                                inventoryId: item.id,
                                                                productId: item.product_id,
                                                                delta: 1,
                                                                currentQty: item.quantity_on_hand,
                                                            })}
                                                            disabled={busy}
                                                            className="glass-icon-btn glass-icon-btn-accent w-8 h-8 disabled:opacity-40"
                                                            title="Add 1 unit"
                                                        >
                                                            <Plus size={13} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60">
                        <p className="text-xs text-gray-400">{items.length} items · {data?.total ?? items.length} total</p>
                    </div>
                </div>
            )}
        </div>
    );
}

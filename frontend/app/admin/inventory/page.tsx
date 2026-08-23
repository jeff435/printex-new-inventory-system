"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
    const [adjustQtys, setAdjustQtys] = useState<Record<string, string>>({});

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

    // Manual add (+) or deduct (-) — one button press moves stock by
    // whatever quantity is typed, in that direction, and the backend logs
    // it in the stock_movements ledger so it's clear later who added or
    // removed how much and when.
    const adjustMutation = useMutation({
        mutationFn: ({ productId, delta }: { productId: string; delta: number }) =>
            api.post(`/inventory/adjust/${productId}/${selectedBranchId}`, null, {
                params: { delta },
            }),
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
            toast.success(vars.delta > 0 ? "Stock added" : "Stock deducted");
            setAdjustQtys((p) => ({ ...p, [vars.productId]: "" }));
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || "Stock update failed"),
    });

    const items = data?.items ?? [];

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="admin-toolbar flex items-center gap-3">
                <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by part number, name, or SKU..."
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
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">On Hand</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reserved</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Available</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Add / Deduct</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {items.map((item: any) => {
                                    const available = Math.max(0, item.quantity_on_hand - item.quantity_reserved);
                                    const status = item.stock_status as StockStatus;
                                    return (
                                        <tr key={item.id} className="hover:bg-blue-50/40 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-900 line-clamp-1">{item.product?.name}</p>
                                                <p className="text-xs text-gray-400 font-mono">
                                                    {item.product?.part_number ? `${item.product.part_number} · ` : ""}{item.product?.sku}
                                                </p>
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
                                                    <p className="text-right text-xs text-gray-400">Pick a branch to adjust stock</p>
                                                ) : (
                                                <div className="flex items-center justify-end gap-2">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={adjustQtys[item.product_id] ?? ""}
                                                        onChange={(e) =>
                                                            setAdjustQtys((p) => ({ ...p, [item.product_id]: e.target.value }))
                                                        }
                                                        placeholder="Qty"
                                                        className="w-16 px-2 py-1.5 text-sm text-center bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 placeholder:text-gray-400"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const qty = parseInt(adjustQtys[item.product_id] ?? "0");
                                                            if (!qty || qty < 1) { toast.error("Enter a valid quantity"); return; }
                                                            adjustMutation.mutate({ productId: item.product_id, delta: qty });
                                                        }}
                                                        disabled={adjustMutation.isPending}
                                                        className="glass-icon-btn glass-icon-btn-accent w-8 h-8 disabled:opacity-40"
                                                        title="Add stock"
                                                    >
                                                        <Plus size={13} />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const qty = parseInt(adjustQtys[item.product_id] ?? "0");
                                                            if (!qty || qty < 1) { toast.error("Enter a valid quantity"); return; }
                                                            if (qty > item.quantity_on_hand) {
                                                                toast.error(`Only ${item.quantity_on_hand} on hand`);
                                                                return;
                                                            }
                                                            adjustMutation.mutate({ productId: item.product_id, delta: -qty });
                                                        }}
                                                        disabled={adjustMutation.isPending}
                                                        className="glass-icon-btn w-8 h-8 disabled:opacity-40 text-red-500"
                                                        title="Deduct stock"
                                                    >
                                                        <Minus size={13} />
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
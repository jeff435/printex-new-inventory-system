"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAdminBranchStore } from "@/stores";
import toast from "react-hot-toast";
import { Search, Plus, Minus, Printer, FileSpreadsheet, Loader2, AlertTriangle, PackageX } from "lucide-react";

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

function downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
}

export default function AdminInventoryPage() {
    const queryClient = useQueryClient();
    const { selectedBranchId } = useAdminBranchStore();
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const [adjustQtys, setAdjustQtys] = useState<Record<string, string>>({});
    const [exporting, setExporting] = useState(false);

    const filters = {
        branch_id: selectedBranchId || undefined,
        search: search || undefined,
        stock_status: filter === "all" ? undefined : filter,
    };

    const { data, isLoading } = useQuery({
        queryKey: ["admin-inventory", search, filter, selectedBranchId],
        queryFn: () =>
            api.get("/inventory", {
                params: { limit: 100, ...filters },
            }).then((r) => r.data),
        enabled: selectedBranchId !== null,
        // Two people on two different laptops/phones can be looking at the
        // same branch at once. Without this, whoever adjusted stock sees it
        // update instantly (via invalidateQueries below) but everyone else's
        // screen stays stale until they manually refresh. Polling every 15s
        // plus refetching whenever a device's tab/app regains focus keeps
        // every screen close to live without needing a websocket server.
        refetchInterval: 15_000,
        refetchOnWindowFocus: true,
    });

    // Manual add (+) or deduct (-) — one button press moves stock by
    // whatever quantity is typed, in that direction, and the backend logs
    // it in the stock_movements ledger so it's clear later who added or
    // removed how much and when. Every staff role (including secretary)
    // keeps the same access it already had — this merge doesn't change it.
    const [pendingProductId, setPendingProductId] = useState<string | null>(null);
    const adjustMutation = useMutation({
        mutationFn: ({ productId, delta }: { productId: string; delta: number }) =>
            api.post(`/inventory/adjust/${productId}/${selectedBranchId}`, null, {
                params: { delta },
            }),
        onMutate: (vars) => setPendingProductId(vars.productId),
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
            toast.success(vars.delta > 0 ? "Stock added" : "Stock deducted");
            setAdjustQtys((p) => ({ ...p, [vars.productId]: "" }));
        },
        onError: (err: any) => toast.error((err.response?.data?.detail || err.response?.data?.message) || "Stock update failed"),
        onSettled: () => setPendingProductId(null),
    });

    const items = data?.items ?? [];
    const lowStockCount = items.filter((i: any) => i.stock_status === "LOW_STOCK").length;
    const outOfStockCount = items.filter((i: any) => i.stock_status === "OUT_OF_STOCK").length;

    const handlePrint = () => window.print();

    const handleExportExcel = async () => {
        setExporting(true);
        try {
            const res = await api.get("/inventory/export/excel", { params: filters, responseType: "blob" });
            const filename = `printex-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`;
            downloadBlob(res.data, filename);
            toast.success("Inventory report downloaded");
        } catch (err: any) {
            // responseType: "blob" means an error body also arrives as a Blob —
            // read it as text first so the real failure reason surfaces.
            let message = "Failed to export report";
            const data = err?.response?.data;
            if (data instanceof Blob) {
                try {
                    const text = await data.text();
                    message = JSON.parse(text)?.detail || message;
                } catch {
                    // body wasn't JSON — keep the generic message
                }
            } else if (data?.detail) {
                message = data.detail;
            }
            toast.error(message);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Print-only heading */}
            <div className="hidden print:block mb-2">
                <h1 className="text-xl font-bold text-gray-900">Printex Inventory Report</h1>
                <p className="text-xs text-gray-500">Generated {new Date().toLocaleString()}</p>
            </div>

            {/* Low/out of stock quick summary — useful for analysing stock at a glance */}
            <div className="grid grid-cols-2 gap-3 print:hidden">
                <div className="admin-card p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle size={16} className="text-yellow-600" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-gray-900">{lowStockCount}</p>
                        <p className="text-xs text-gray-500">Low stock (in view)</p>
                    </div>
                </div>
                <div className="admin-card p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                        <PackageX size={16} className="text-red-600" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-gray-900">{outOfStockCount}</p>
                        <p className="text-xs text-gray-500">Out of stock (in view)</p>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="admin-toolbar flex items-center gap-3 flex-wrap print:hidden">
                <div className="relative flex-1 min-w-[200px]">
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
                <button
                    onClick={handlePrint}
                    className="glass-btn-ghost text-sm flex items-center gap-1.5 flex-shrink-0"
                    title="Print this view"
                >
                    <Printer size={15} />
                    Print
                </button>
                <button
                    onClick={handleExportExcel}
                    disabled={exporting}
                    className="glass-btn text-sm flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50"
                    title="Download as Excel"
                >
                    {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
                    {exporting ? "Exporting..." : "Export to Excel"}
                </button>
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
                <div className="admin-card overflow-hidden print:shadow-none print:border-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/80">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">On Hand</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reserved</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Available</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide print:hidden">Add / Deduct</th>
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
                                            <td className="px-4 py-3 print:hidden">
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
                                                        disabled={pendingProductId === item.product_id}
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
                                                        disabled={pendingProductId === item.product_id}
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
                    <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60 print:hidden">
                        <p className="text-xs text-gray-400">{items.length} items · {data?.total ?? items.length} total</p>
                    </div>
                </div>
            )}
        </div>
    );
}

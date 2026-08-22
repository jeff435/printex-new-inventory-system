"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAdminBranchStore } from "@/stores";
import toast from "react-hot-toast";
import { Plus, Search, ToggleLeft, ToggleRight, Pencil, Package } from "lucide-react";
import Link from "next/link";

const STATUS_STYLE: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    inactive: "bg-gray-100 text-gray-500",
    discontinued: "bg-red-100 text-red-600",
};

const INP = "px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 placeholder:text-gray-400";

export default function AdminProductsPage() {
    const queryClient = useQueryClient();
    const { selectedBranchId } = useAdminBranchStore();
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [page, setPage] = useState(1);

    const { data, isLoading } = useQuery({
        queryKey: ["admin-products", search, statusFilter, page],
        queryFn: () =>
            api.get("/products", {
                params: {
                    search: search || undefined,
                    status: statusFilter === "all" ? undefined : statusFilter,
                    page,
                    limit: 20,
                },
            }).then((r) => r.data),
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: string }) =>
            api.patch(`/products/${id}`, { status }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-products"] });
            toast.success("Status updated");
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || "Update failed"),
    });

    const products = data?.items ?? [];
    const totalPages = data?.pages ?? 1;

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="admin-toolbar flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        placeholder="Search products or SKU..."
                        className={`w-full pl-9 pr-4 ${INP}`}
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    className={INP}
                >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="discontinued">Discontinued</option>
                </select>
                <Link
                    href="/admin/products/new"
                    className="glass-btn text-sm flex items-center gap-1.5 flex-shrink-0"
                >
                    <Plus size={15} />
                    Add Product
                </Link>
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-2xl" />
                    ))}
                </div>
            ) : products.length === 0 ? (
                <div className="admin-card p-16 text-center">
                    <Package size={32} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-gray-400">
                        {search || statusFilter !== "all" ? "No products match your filters." : "No products yet."}
                    </p>
                    {!search && statusFilter === "all" && (
                        <Link href="/admin/products/new" className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                            <Plus size={14} /> Add your first product
                        </Link>
                    )}
                </div>
            ) : (
                <div className="admin-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/80">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">SKU</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {products.map((p: any) => (
                                    <tr key={p.id} className="hover:bg-blue-50/40 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center overflow-hidden">
                                                    {p.thumbnail_url
                                                        ? <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover" />
                                                        : <span className="text-base">🔧</span>}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-medium text-gray-900 line-clamp-1">{p.name}</p>
                                                    {p.unit && <p className="text-xs text-gray-400">{p.unit}</p>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 hidden sm:table-cell">
                                            <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">{p.sku}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <p className="font-bold text-gray-900">KES {(p.price_kes / 100).toLocaleString()}</p>
                                            {p.compare_price_kes && p.compare_price_kes > p.price_kes && (
                                                <p className="text-xs text-gray-400 line-through">KES {(p.compare_price_kes / 100).toLocaleString()}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_STYLE[p.status] ?? "bg-gray-100 text-gray-500"}`}>
                                                {p.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-2">
                                                {/* Toggle active / inactive */}
                                                <button
                                                    title={p.status === "active" ? "Deactivate" : "Activate"}
                                                    disabled={toggleMutation.isPending}
                                                    onClick={() =>
                                                        toggleMutation.mutate({
                                                            id: p.id,
                                                            status: p.status === "active" ? "inactive" : "active",
                                                        })
                                                    }
                                                    className="glass-icon-btn w-8 h-8 disabled:opacity-40"
                                                >
                                                    {p.status === "active"
                                                        ? <ToggleRight size={15} className="text-green-600" />
                                                        : <ToggleLeft size={15} className="text-gray-400" />}
                                                </button>

                                                <Link
                                                    href={`/admin/products/new?edit=${p.id}`}
                                                    className="glass-icon-btn w-8 h-8 flex items-center justify-center text-blue-600"
                                                    title="Edit product"
                                                >
                                                    <Pencil size={13} />
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/60">
                            <p className="text-xs text-gray-400">
                                Page {page} of {totalPages} · {data?.total} products
                            </p>
                            <div className="flex gap-1.5">
                                <button
                                    disabled={page === 1}
                                    onClick={() => setPage(page - 1)}
                                    className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    Prev
                                </button>
                                <button
                                    disabled={page === totalPages}
                                    onClick={() => setPage(page + 1)}
                                    className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, analyticsApi } from "@/lib/api";
import { downloadBlob, openPdfBlob, printPdfBlob } from "@/lib/file-export";
import { useAuthStore, useAdminBranchStore } from "@/stores";
import toast from "react-hot-toast";
import {
    ShoppingBag, TrendingUp, AlertTriangle, Clock, CheckCircle, Truck, XCircle,
    Download, Printer, FileSpreadsheet, PackageX, PackageMinus, Wallet, Users,
} from "lucide-react";

type StatCardProps = { label: string; value: string | number; icon: React.ElementType; color: string; sub?: string };

function StatCard({ label, value, icon: Icon, color, sub }: StatCardProps) {
    return (
        <div className="admin-card p-5">
            <div className="flex items-start justify-between mb-3">
                <p className="text-sm text-gray-500 font-medium">{label}</p>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                    <Icon size={16} className="text-white" />
                </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
    );
}

type StatusCfg = { label: string; icon: React.ElementType; color: string };
const STATUS_CONFIG: Record<string, StatusCfg> = {
    pending_payment: { label: "Pending Payment", icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    confirmed: { label: "Confirmed", icon: CheckCircle, color: "text-blue-600 bg-blue-50" },
    picking: { label: "Picking", icon: ShoppingBag, color: "text-purple-600 bg-purple-50" },
    packed: { label: "Packed", icon: ShoppingBag, color: "text-indigo-600 bg-indigo-50" },
    dispatched: { label: "Dispatched", icon: Truck, color: "text-orange-600 bg-orange-50" },
    delivered: { label: "Delivered", icon: CheckCircle, color: "text-green-600 bg-green-50" },
    cancelled: { label: "Cancelled", icon: XCircle, color: "text-red-600 bg-red-50" },
};

function kes(cents: number) {
    return `KSh ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Export button row, reused by the stock-status and customer-purchases cards ──

function ExportRow({
    onDownload, onPrint, onExcel, busy,
}: { onDownload: () => void; onPrint: () => void; onExcel: () => void; busy: boolean }) {
    return (
        <div className="flex items-center gap-1.5">
            <button onClick={onDownload} disabled={busy} title="Open / download PDF"
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-40">
                <Download size={14} />
            </button>
            <button onClick={onPrint} disabled={busy} title="Print"
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-40">
                <Printer size={14} />
            </button>
            <button onClick={onExcel} disabled={busy} title="Export to Excel"
                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-40">
                <FileSpreadsheet size={14} />
            </button>
        </div>
    );
}

// ── Stock status card — visible to secretary, director, and admin ──────────

function StockStatusCard() {
    const [busy, setBusy] = useState(false);
    const { data, isLoading } = useQuery({
        queryKey: ["admin-stock-status"],
        queryFn: () => analyticsApi.stockStatus().then((r) => r.data),
    });

    const handleDownload = async () => {
        setBusy(true);
        try { openPdfBlob(await analyticsApi.stockStatusPdfBlob()); }
        catch { toast.error("Couldn't load the report"); }
        finally { setBusy(false); }
    };
    const handlePrint = async () => {
        setBusy(true);
        try { printPdfBlob(await analyticsApi.stockStatusPdfBlob()); }
        catch { toast.error("Couldn't load the report"); }
        finally { setBusy(false); }
    };
    const handleExcel = async () => {
        setBusy(true);
        try { downloadBlob(await analyticsApi.stockStatusExcelBlob(), `printex-stock-status.xlsx`); }
        catch { toast.error("Couldn't export the report"); }
        finally { setBusy(false); }
    };

    const categories = data?.categories ?? [];
    const totalOut = data?.total_out_of_stock ?? 0;
    const totalLow = data?.total_low_stock ?? 0;

    return (
        <div className="admin-card p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-500" />
                    Stock Status — Out of Stock &amp; Low Stock
                </h2>
                <ExportRow onDownload={handleDownload} onPrint={handlePrint} onExcel={handleExcel} busy={busy} />
            </div>

            {isLoading ? (
                <p className="text-sm text-gray-400">Loading stock status...</p>
            ) : totalOut === 0 && totalLow === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Everything is well stocked. Nothing out of stock or low right now.</p>
            ) : (
                <div className="space-y-4">
                    {categories.map((cat: any) => (
                        (cat.out_of_stock.length > 0 || cat.low_stock.length > 0) && (
                            <div key={cat.category_id ?? "uncategorised"}>
                                <p className="text-xs font-semibold text-gray-500 mb-2">{cat.category_name}</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {cat.out_of_stock.length > 0 && (
                                        <div className="rounded-xl border border-red-100 bg-red-50/60 p-3">
                                            <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5 mb-2">
                                                <PackageX size={12} /> Out of stock ({cat.out_of_stock.length})
                                            </p>
                                            <ul className="space-y-1">
                                                {cat.out_of_stock.map((p: any) => (
                                                    <li key={p.product_id} className="text-xs text-gray-700 flex justify-between gap-2">
                                                        <span className="truncate">{p.name}{p.needs_pricing ? " (unpriced)" : ""}</span>
                                                        {p.price_kes != null && <span className="text-gray-400 flex-shrink-0">{kes(p.price_kes)}</span>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {cat.low_stock.length > 0 && (
                                        <div className="rounded-xl border border-yellow-100 bg-yellow-50/60 p-3">
                                            <p className="text-xs font-semibold text-yellow-700 flex items-center gap-1.5 mb-2">
                                                <PackageMinus size={12} /> Low stock ({cat.low_stock.length})
                                            </p>
                                            <ul className="space-y-1">
                                                {cat.low_stock.map((p: any) => (
                                                    <li key={p.product_id} className="text-xs text-gray-700 flex justify-between gap-2">
                                                        <span className="truncate">{p.name}{p.needs_pricing ? " (unpriced)" : ""} · {p.quantity_on_hand} left</span>
                                                        {p.price_kes != null && <span className="text-gray-400 flex-shrink-0">{kes(p.price_kes)}</span>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Customer purchases card — director / admin only ─────────────────────────

function CustomerPurchasesCard() {
    const [busy, setBusy] = useState(false);
    const { data, isLoading } = useQuery({
        queryKey: ["admin-customer-purchases"],
        queryFn: () => analyticsApi.customerPurchases().then((r) => r.data),
    });

    const handleDownload = async () => {
        setBusy(true);
        try { openPdfBlob(await analyticsApi.customerPurchasesPdfBlob()); }
        catch { toast.error("Couldn't load the report"); }
        finally { setBusy(false); }
    };
    const handlePrint = async () => {
        setBusy(true);
        try { printPdfBlob(await analyticsApi.customerPurchasesPdfBlob()); }
        catch { toast.error("Couldn't load the report"); }
        finally { setBusy(false); }
    };
    const handleExcel = async () => {
        setBusy(true);
        try { downloadBlob(await analyticsApi.customerPurchasesExcelBlob(), "printex-customer-purchases.xlsx"); }
        catch { toast.error("Couldn't export the report"); }
        finally { setBusy(false); }
    };

    const rows = data ?? [];

    return (
        <div className="admin-card p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                    <Users size={16} className="text-blue-600" />
                    Customer Purchases — who's buying what
                </h2>
                <ExportRow onDownload={handleDownload} onPrint={handlePrint} onExcel={handleExcel} busy={busy} />
            </div>
            {isLoading ? (
                <p className="text-sm text-gray-400">Loading...</p>
            ) : rows.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No completed sales yet — this fills in once proforma invoices are marked converted.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-left text-gray-400 border-b border-gray-100">
                                <th className="pb-2 font-medium">Customer</th>
                                <th className="pb-2 font-medium">Part</th>
                                <th className="pb-2 font-medium text-right">Qty</th>
                                <th className="pb-2 font-medium text-right">Value</th>
                                <th className="pb-2 font-medium text-right">Orders</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.slice(0, 15).map((r: any, i: number) => (
                                <tr key={i} className="border-b border-gray-50 text-gray-700">
                                    <td className="py-1.5">{r.customer_name}</td>
                                    <td className="py-1.5">{r.description}</td>
                                    <td className="py-1.5 text-right">{r.total_quantity}</td>
                                    <td className="py-1.5 text-right">{kes(r.total_value_kes)}</td>
                                    <td className="py-1.5 text-right">{r.purchase_count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ── Full analytics summary card — director / admin only ─────────────────────
// The overview stat cards above only surface a couple of headline numbers
// (out-of/low-stock count, pending payments); this card is the "full
// analysis" the director/admin need — goods received, sales, expenses,
// purchases and net movement — with its own PDF/print/Excel export.

function AnalyticsSummaryCard({ summary }: { summary: any }) {
    const [busy, setBusy] = useState(false);

    const handleDownload = async () => {
        setBusy(true);
        try { openPdfBlob(await analyticsApi.summaryPdfBlob()); }
        catch { toast.error("Couldn't load the report"); }
        finally { setBusy(false); }
    };
    const handlePrint = async () => {
        setBusy(true);
        try { printPdfBlob(await analyticsApi.summaryPdfBlob()); }
        catch { toast.error("Couldn't load the report"); }
        finally { setBusy(false); }
    };
    const handleExcel = async () => {
        setBusy(true);
        try { downloadBlob(await analyticsApi.summaryExcelBlob(), "printex-analytics-summary.xlsx"); }
        catch { toast.error("Couldn't export the report"); }
        finally { setBusy(false); }
    };

    if (!summary) return null;

    const rows: [string, string][] = [
        ["Total stock value", kes(summary.total_stock_value)],
        ["Goods received", `${summary.goods_received_qty} units · ${kes(summary.goods_received_value)}`],
        ["Sales", `${summary.sales_qty} units · ${kes(summary.sales_value)}`],
        ["Total expenses", kes(summary.total_expenses)],
        ["Total purchases (from suppliers)", kes(summary.total_purchases_value)],
        ["Net movement (sales − goods received)", kes(summary.net_movement_value)],
    ];

    return (
        <div className="admin-card p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                    <TrendingUp size={16} className="text-green-600" />
                    Full Analytics — Stock, Sales &amp; Expenses
                </h2>
                <ExportRow onDownload={handleDownload} onPrint={handlePrint} onExcel={handleExcel} busy={busy} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rows.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50">
                        <span className="text-xs text-gray-500">{label}</span>
                        <span className="text-sm font-semibold text-gray-900">{value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function AdminOverviewPage() {
    const { user } = useAuthStore();
    const { selectedBranchId } = useAdminBranchStore();
    const isSecretary = user?.role === "secretary";
    const canSeeAll = user?.role === "super_admin" || user?.role === "director";

    const { data: ordersData, isLoading: ordersLoading } = useQuery({
        queryKey: ["admin-orders-overview", selectedBranchId],
        queryFn: () => api.get("/orders/admin/queue", { params: { branch_id: selectedBranchId || undefined } }).then((r) => r.data),
        enabled: selectedBranchId !== null && !isSecretary,
    });
    const { data: productsData } = useQuery({
        queryKey: ["admin-products-overview"],
        queryFn: () => api.get("/products?limit=100").then((r) => r.data),
        enabled: !isSecretary,
    });
    const { data: analyticsSummary } = useQuery({
        queryKey: ["admin-analytics-summary"],
        queryFn: () => analyticsApi.summary().then((r) => r.data),
        enabled: canSeeAll,
    });

    const orders = ordersData ?? [];
    const products = productsData?.items ?? [];
    const totalRevenue = orders
        .filter((o: any) => o.status === "delivered")
        .reduce((sum: number, o: any) => sum + o.total_kes, 0);

    const statusCounts: Record<string, number> = {};
    orders.forEach((o: any) => {
        statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    });

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">
                    Good {greeting}, {user?.full_name?.split(" ")[0]}
                </h1>
                <p className="text-gray-500 text-sm mt-0.5">Here's what's happening at Printex today.</p>
            </div>

            {/* Stat cards — full business view for admin/director, lighter for secretary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {!isSecretary && (
                    <>
                        <StatCard
                            label="Total Orders"
                            value={ordersLoading ? "—" : orders.length}
                            icon={ShoppingBag}
                            color="bg-blue-600"
                            sub="All time"
                        />
                        <StatCard
                            label="Revenue"
                            value={`KES ${(totalRevenue / 100).toLocaleString()}`}
                            icon={TrendingUp}
                            color="bg-green-600"
                            sub="From delivered orders"
                        />
                        <StatCard
                            label="Products"
                            value={products.length}
                            icon={ShoppingBag}
                            color="bg-purple-600"
                            sub="Active in catalogue"
                        />
                    </>
                )}
                <StatCard
                    label="Out of / Low Stock"
                    value={
                        analyticsSummary
                            ? (analyticsSummary.out_of_stock_parts ?? 0) + (analyticsSummary.low_stock_parts ?? 0)
                            : "—"
                    }
                    icon={AlertTriangle}
                    color="bg-red-500"
                    sub="See full breakdown below"
                />
                {canSeeAll && (
                    <StatCard
                        label="Pending Payments"
                        value={analyticsSummary ? kes(analyticsSummary.pending_payments_value ?? 0) : "—"}
                        icon={Wallet}
                        color="bg-amber-500"
                        sub={analyticsSummary ? `${analyticsSummary.pending_payments_count ?? 0} sent/accepted PIs awaiting conversion` : undefined}
                    />
                )}
            </div>

            {!isSecretary && (
                <>
                    {/* Orders by status */}
                    <div className="admin-card p-5">
                        <h2 className="font-bold text-gray-900 mb-4">Orders by Status</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {Object.entries(STATUS_CONFIG).map(([status, { label, icon: Icon, color }]) => (
                                <div key={status} className={`flex items-center gap-3 p-3 rounded-xl ${color}`}>
                                    <Icon size={16} />
                                    <div>
                                        <p className="text-xs font-medium">{label}</p>
                                        <p className="text-xl font-bold">{statusCounts[status] || 0}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent orders */}
                    <div className="admin-card p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-bold text-gray-900">Recent Orders</h2>
                            <a href="/admin/orders" className="text-xs text-blue-600 hover:underline">View all</a>
                        </div>
                        {ordersLoading ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-xl" />)}
                            </div>
                        ) : orders.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-6">No orders yet.</p>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {orders.slice(0, 8).map((order: any) => {
                                    const cfg = STATUS_CONFIG[order.status];
                                    return (
                                        <div key={order.id} className="flex items-center justify-between py-3">
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">{order.order_number}</p>
                                                <p className="text-xs text-gray-400">{order.items?.length} items</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <p className="text-sm font-bold text-gray-900">
                                                    KES {(order.total_kes / 100).toLocaleString()}
                                                </p>
                                                {cfg && (
                                                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${cfg.color}`}>
                                                        {cfg.label}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Stock status — every role (secretary, director, admin) */}
            <StockStatusCard />

            {/* Full analytics summary — director & admin only, per the full-analysis view */}
            {canSeeAll && <AnalyticsSummaryCard summary={analyticsSummary} />}

            {/* Customer purchases — director & admin only, per the full-analysis view */}
            {canSeeAll && <CustomerPurchasesCard />}
        </div>
    );
}

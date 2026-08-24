"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "@/lib/api";
import {
    TrendingUp, TrendingDown, DollarSign, Warehouse, AlertTriangle,
    PackageX, ShoppingCart, Receipt, Sparkles, FileSpreadsheet,
    BarChart3, ListOrdered, Loader2, Printer, Download,
} from "lucide-react";
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import toast from "react-hot-toast";

// ── Date range helpers ───────────────────────────────────────────────────────
// Server expects ISO datetimes; "start" is midnight N days ago, "end" is now.
const RANGES: Record<string, number | null> = {
    "7D": 7,
    "30D": 30,
    "90D": 90,
    "All time": null,
};

function rangeToDates(days: number | null): { start?: string; end?: string } {
    if (days === null) return {};
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return { start: start.toISOString(), end: end.toISOString() };
}

function kes(value: number | string | undefined | null) {
    const n = Number(value ?? 0);
    return `KSh ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

// Quick client-side snapshot of the summary KPIs + top moving parts, as a
// CSV — instant, no server round-trip. Distinct from "Export to Excel"
// below, which pulls the full formatted workbook (with charts and the full
// stock movement ledger) from the server.
function csvCell(value: unknown): string {
    const s = String(value ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildSummaryCsv(summary: any, topParts: any[] | undefined, rangeLabel: string): string {
    const lines: string[] = [];
    lines.push(csvCell("Printex Stock & Inventory Analytics"));
    lines.push(csvCell(`Range: ${rangeLabel}`));
    lines.push("");
    lines.push([csvCell("Metric"), csvCell("Value")].join(","));
    const rows: [string, string][] = [
        ["Total Stock Value", kes(summary?.total_stock_value)],
        ["Parts Tracked", String(summary?.total_parts ?? 0)],
        ["Low Stock Parts", String(summary?.low_stock_parts ?? 0)],
        ["Out of Stock Parts", String(summary?.out_of_stock_parts ?? 0)],
        ["Goods Received (Value)", kes(summary?.goods_received_value)],
        ["Goods Received (Units)", String(summary?.goods_received_qty ?? 0)],
        ["Manual Stock Added (Value)", kes(summary?.manual_stock_added_value)],
        ["Manual Stock Added (Units)", String(summary?.manual_stock_added_qty ?? 0)],
        ["Sales / Stock Out (Value)", kes(summary?.sales_value)],
        ["Sales / Stock Out (Units)", String(summary?.sales_qty ?? 0)],
        ["Purchases Received", kes(summary?.total_purchases_value)],
        ["Expenses", kes(summary?.total_expenses)],
        ["Net Stock Movement", kes(summary?.net_movement_value)],
    ];
    for (const [label, value] of rows) lines.push([csvCell(label), csvCell(value)].join(","));

    if (topParts && topParts.length > 0) {
        lines.push("");
        lines.push(csvCell("Top Moving Parts"));
        lines.push([csvCell("SKU"), csvCell("Part"), csvCell("Qty Moved"), csvCell("Value Moved")].join(","));
        for (const p of topParts) {
            lines.push([csvCell(p.sku), csvCell(p.product_name), csvCell(p.quantity_moved), csvCell(kes(p.value_moved))].join(","));
        }
    }
    return lines.join("\n");
}

export default function DirectorAnalyticsPage() {
    const [rangeLabel, setRangeLabel] = useState<keyof typeof RANGES>("30D");
    const [activeTab, setActiveTab] = useState<"overview" | "top-parts" | "ledger">("overview");
    const [exporting, setExporting] = useState(false);

    const { start, end } = useMemo(() => rangeToDates(RANGES[rangeLabel]), [rangeLabel]);

    const { data: summary, isLoading: summaryLoading, isError: summaryError } = useQuery({
        queryKey: ["analytics-summary", start, end],
        queryFn: () => analyticsApi.summary({ start, end }).then((r) => r.data),
    });

    const { data: topParts, isLoading: topPartsLoading } = useQuery({
        queryKey: ["analytics-top-parts", start, end],
        queryFn: () => analyticsApi.topParts({ start, end, limit: 10 }).then((r) => r.data),
        enabled: activeTab === "overview" || activeTab === "top-parts",
    });

    const { data: movements, isLoading: movementsLoading } = useQuery({
        queryKey: ["analytics-stock-movements", start, end],
        queryFn: () => analyticsApi.stockMovements({ start, end, limit: 200 }).then((r) => r.data),
        enabled: activeTab === "ledger",
    });

    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await analyticsApi.summaryExcelBlob({ start, end });
            const filename = `printex-analytics-${new Date().toISOString().slice(0, 10)}.xlsx`;
            downloadBlob(res.data, filename);
            toast.success("Analytics report downloaded");
        } catch (err: any) {
            // exportExcel uses responseType: "blob", so an error body arrives
            // as a Blob too — err.response.data.message will always be
            // undefined even when the server sent a real JSON error. Read
            // the blob as text first so the real failure reason surfaces.
            let message = "Failed to export report";
            const data = err?.response?.data;
            if (data instanceof Blob) {
                try {
                    const text = await data.text();
                    message = JSON.parse(text)?.detail || JSON.parse(text)?.message || message;
                } catch {
                    // body wasn't JSON — keep the generic message
                }
            } else if (data?.message || data?.detail) {
                message = data.message || data.detail;
            }
            toast.error(message);
        } finally {
            setExporting(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadSummary = () => {
        const csv = buildSummaryCsv(summary, topParts, rangeLabel);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        downloadBlob(blob, `printex-analytics-summary-${new Date().toISOString().slice(0, 10)}.csv`);
        toast.success("Summary downloaded");
    };

    const netPositive = Number(summary?.net_movement_value ?? 0) >= 0;

    return (
        <div className="space-y-6 pb-12 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 print:shadow-none print:border-0 print:p-0">
                <div>
                    <div className="flex items-center gap-2 mb-1 print:hidden">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                            <Sparkles size={12} /> Director Analytics
                        </span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">
                        Stock &amp; Inventory Analytics
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Live figures pulled directly from stock movements, purchases and expenses.
                        <span className="print:inline hidden"> — Range: {rangeLabel}, generated {new Date().toLocaleString()}</span>
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap print:hidden">
                    <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-medium">
                        {Object.keys(RANGES).map((label) => (
                            <button
                                key={label}
                                onClick={() => setRangeLabel(label as keyof typeof RANGES)}
                                className={`px-3 py-1.5 rounded-lg transition-all ${rangeLabel === label ? "bg-white text-gray-900 shadow-sm font-bold" : "text-gray-500 hover:text-gray-900"}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={handleDownloadSummary}
                        title="Download this summary as a CSV file"
                        className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all"
                    >
                        <Download size={16} /> Download
                    </button>

                    <button
                        onClick={handlePrint}
                        title="Print this page"
                        className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all"
                    >
                        <Printer size={16} /> Print
                    </button>

                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all"
                    >
                        {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                        {exporting ? "Preparing…" : "Export to Excel"}
                    </button>
                </div>
            </div>

            {summaryError && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-sm p-4 rounded-2xl print:hidden">
                    Couldn't load analytics — check that you're signed in as a director/super admin and the backend is reachable.
                </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-gray-200 gap-6 text-sm font-medium print:hidden">
                {[
                    { id: "overview", label: "Overview", icon: BarChart3 },
                    { id: "top-parts", label: "Top Moving Parts", icon: TrendingUp },
                    { id: "ledger", label: "Stock Movement Ledger", icon: ListOrdered },
                ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 pb-3 border-b-2 transition-all ${isActive ? "border-indigo-600 text-indigo-600 font-bold" : "border-transparent text-gray-500 hover:text-gray-800"}`}
                        >
                            <Icon size={16} /> {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* KPI Cards — always visible, real data from /analytics/summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-2 print:gap-3">
                <KpiCard
                    label="Total Stock Value"
                    value={summaryLoading ? null : kes(summary?.total_stock_value)}
                    icon={<Warehouse size={16} />}
                    color="blue"
                    sub={summaryLoading ? "" : `${summary?.total_parts ?? 0} parts tracked`}
                />
                <KpiCard
                    label="Low / Out of Stock"
                    value={summaryLoading ? null : `${summary?.low_stock_parts ?? 0} / ${summary?.out_of_stock_parts ?? 0}`}
                    icon={<AlertTriangle size={16} />}
                    color="amber"
                    sub="Low stock / out of stock parts"
                />
                <KpiCard
                    label="Goods Received"
                    value={summaryLoading ? null : kes(summary?.goods_received_value)}
                    icon={<ShoppingCart size={16} />}
                    color="green"
                    sub={summaryLoading ? "" : `${summary?.goods_received_qty ?? 0} units in this period`}
                />
                <KpiCard
                    label="Manual Stock Added"
                    value={summaryLoading ? null : kes(summary?.manual_stock_added_value)}
                    icon={<Warehouse size={16} />}
                    color="teal"
                    sub={summaryLoading ? "" : `${summary?.manual_stock_added_qty ?? 0} units added via Inventory "+"`}
                />
                <KpiCard
                    label="Sales (Stock Out)"
                    value={summaryLoading ? null : kes(summary?.sales_value)}
                    icon={<Receipt size={16} />}
                    color="purple"
                    sub={summaryLoading ? "" : `${summary?.sales_qty ?? 0} units in this period`}
                />
                <KpiCard
                    label="Purchases (Received)"
                    value={summaryLoading ? null : kes(summary?.total_purchases_value)}
                    icon={<DollarSign size={16} />}
                    color="teal"
                    sub="Supplier purchase orders received"
                />
                <KpiCard
                    label="Expenses"
                    value={summaryLoading ? null : kes(summary?.total_expenses)}
                    icon={<Receipt size={16} />}
                    color="red"
                    sub="Recorded operating expenses"
                />
                <KpiCard
                    label="Net Stock Movement"
                    value={summaryLoading ? null : kes(summary?.net_movement_value)}
                    icon={netPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    color={netPositive ? "green" : "red"}
                    sub="Sales value − (goods received + manual stock added)"
                />
                <KpiCard
                    label="Parts Out of Stock"
                    value={summaryLoading ? null : String(summary?.out_of_stock_parts ?? 0)}
                    icon={<PackageX size={16} />}
                    color="gray"
                    sub="Needs restocking now"
                />
            </div>

            {activeTab === "overview" && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900 mb-1">Top Moving Parts</h2>
                    <p className="text-xs text-gray-500 mb-4">By quantity moved (in or out) in the selected period</p>
                    {topPartsLoading ? (
                        <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
                    ) : !topParts || topParts.length === 0 ? (
                        <p className="text-sm text-gray-400 py-10 text-center">No stock movement recorded in this period.</p>
                    ) : (
                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={topParts} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="product_name"
                                        stroke="#94a3b8"
                                        fontSize={11}
                                        angle={-30}
                                        textAnchor="end"
                                        interval={0}
                                        height={60}
                                    />
                                    <YAxis stroke="#94a3b8" fontSize={12} />
                                    <Tooltip
                                        formatter={(value: any, name: string) =>
                                            name === "quantity_moved" ? [value, "Qty moved"] : [kes(value), "Value moved"]
                                        }
                                        contentStyle={{ background: "#1e1b4b", color: "#fff", borderRadius: "12px", border: "none", fontSize: "12px" }}
                                    />
                                    <Bar dataKey="quantity_moved" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            )}

            {activeTab === "top-parts" && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100">
                        <h2 className="text-lg font-bold text-gray-900">Top Moving Parts</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Ranked by total quantity moved in the selected period</p>
                    </div>
                    {topPartsLoading ? (
                        <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
                    ) : !topParts || topParts.length === 0 ? (
                        <p className="text-sm text-gray-400 py-10 text-center">No stock movement recorded in this period.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-400 text-xs border-b border-gray-100">
                                    <th className="px-5 py-2.5 font-medium">SKU</th>
                                    <th className="px-5 py-2.5 font-medium">Part</th>
                                    <th className="px-5 py-2.5 font-medium text-right">Qty Moved</th>
                                    <th className="px-5 py-2.5 font-medium text-right">Value Moved</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topParts.map((p: any) => (
                                    <tr key={p.product_id} className="border-b border-gray-50 text-gray-700">
                                        <td className="px-5 py-2.5 font-mono text-xs text-blue-600">{p.sku}</td>
                                        <td className="px-5 py-2.5">{p.product_name}</td>
                                        <td className="px-5 py-2.5 text-right">{p.quantity_moved}</td>
                                        <td className="px-5 py-2.5 text-right font-semibold">{kes(p.value_moved)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {activeTab === "ledger" && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100">
                        <h2 className="text-lg font-bold text-gray-900">Stock Movement Ledger</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Full traceable record — who moved what, when, and why (latest 200)</p>
                    </div>
                    {movementsLoading ? (
                        <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
                    ) : !movements || movements.length === 0 ? (
                        <p className="text-sm text-gray-400 py-10 text-center">No stock movement recorded in this period.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-400 text-xs border-b border-gray-100">
                                        <th className="px-5 py-2.5 font-medium">Date</th>
                                        <th className="px-5 py-2.5 font-medium">Reason</th>
                                        <th className="px-5 py-2.5 font-medium text-right">Qty Δ</th>
                                        <th className="px-5 py-2.5 font-medium text-right">Qty After</th>
                                        <th className="px-5 py-2.5 font-medium">Reference</th>
                                        <th className="px-5 py-2.5 font-medium">Note</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {movements.map((m: any) => (
                                        <tr key={m.id} className="border-b border-gray-50 text-gray-700">
                                            <td className="px-5 py-2.5 text-xs whitespace-nowrap">{new Date(m.created_at).toLocaleString()}</td>
                                            <td className="px-5 py-2.5 capitalize">{String(m.reason).replace(/_/g, " ")}</td>
                                            <td className={`px-5 py-2.5 text-right font-semibold ${m.quantity_delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                {m.quantity_delta >= 0 ? "+" : ""}{m.quantity_delta}
                                            </td>
                                            <td className="px-5 py-2.5 text-right">{m.quantity_after}</td>
                                            <td className="px-5 py-2.5 text-xs text-gray-500">{m.reference || "—"}</td>
                                            <td className="px-5 py-2.5 text-xs text-gray-400">{m.note || "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const KPI_COLORS: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
    teal: "bg-teal-50 text-teal-600",
    red: "bg-red-50 text-red-600",
    gray: "bg-gray-100 text-gray-600",
};

function KpiCard({
    label, value, icon, color, sub,
}: {
    label: string;
    value: string | null;
    icon: React.ReactNode;
    color: keyof typeof KPI_COLORS;
    sub?: string;
}) {
    return (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 print:shadow-none print:border-gray-300 print:break-inside-avoid">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${KPI_COLORS[color]}`}>
                    {icon}
                </div>
            </div>
            {value === null ? (
                <div className="h-7 w-24 bg-gray-100 rounded animate-pulse" />
            ) : (
                <p className="text-xl font-bold text-gray-900">{value}</p>
            )}
            {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
    );
}

"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { purchasesApi, suppliersApi, expensesApi, productsApi, api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, X, Truck, Receipt, Building2, CheckCircle, XCircle, Search, ChevronUp, ChevronDown, Printer, FileSpreadsheet, Download, Loader2, Pencil } from "lucide-react";
import Link from "next/link";

const inp = "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 placeholder:text-gray-400";

function money(v: number | string) {
    return `KES ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const EXPENSE_CATEGORIES = ["rent", "utilities", "transport", "salaries", "office_supplies", "maintenance", "other"];

type Tab = "purchases" | "expenses" | "suppliers";

export default function PurchasesPage() {
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<Tab>("purchases");

    return (
        <div className="space-y-4 max-w-4xl">
            <div>
                <h1 className="text-xl font-bold text-gray-900">Purchases &amp; Expenses</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                    This is where new stock actually enters the system, and where day-to-day operating costs get logged.
                </p>
            </div>

            <div className="admin-card p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="flex gap-2.5">
                    <Truck size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-gray-800">Purchases</p>
                        <p className="text-gray-500 mt-0.5">
                            Record what you're buying from a supplier — pick the parts and quantities. It's saved as a <b>Draft</b> first and does <b>not</b> touch stock yet. Click the ✓ on a draft once the delivery actually arrives — that's the step that adds the quantity to Inventory and shows up as "Goods Received" in Director Analytics.
                        </p>
                    </div>
                </div>
                <div className="flex gap-2.5">
                    <Receipt size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-gray-800">Expenses</p>
                        <p className="text-gray-500 mt-0.5">
                            Running costs that aren't stock — rent, transport, salaries, utilities. These don't touch inventory at all; they only feed the cost totals in Director Analytics.
                        </p>
                    </div>
                </div>
                <div className="flex gap-2.5">
                    <Building2 size={16} className="text-teal-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-gray-800">Suppliers</p>
                        <p className="text-gray-500 mt-0.5">
                            The list of companies you buy parts from — add one here first, then pick it when creating a purchase order.
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex gap-1 border-b border-gray-200">
                {([
                    ["purchases", "Purchases", Truck],
                    ["expenses", "Expenses", Receipt],
                    ["suppliers", "Suppliers", Building2],
                ] as [Tab, string, React.ElementType][]).map(([key, label, Icon]) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"
                            }`}
                    >
                        <Icon size={14} /> {label}
                    </button>
                ))}
            </div>

            {tab === "purchases" && <PurchasesTab />}
            {tab === "expenses" && <ExpensesTab />}
            {tab === "suppliers" && <SuppliersTab />}
        </div>
    );
}

// ── Purchases ────────────────────────────────────────────────────────────────

function PurchasesTab() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [supplierId, setSupplierId] = useState("");
    const [branchId, setBranchId] = useState("");
    const [notes, setNotes] = useState("");
    const [items, setItems] = useState([{ product_id: "", quantity: "1", unit_cost: "" }]);
    // Parallel to `items` — what's typed in each row's search box, and which
    // row (if any) currently has its results dropdown open.
    const [partQueries, setPartQueries] = useState([""]);
    const [openRow, setOpenRow] = useState<number | null>(null);

    const { data: purchases, isLoading } = useQuery({
        queryKey: ["purchases"],
        queryFn: () => purchasesApi.list().then((r) => r.data),
    });
    const { data: suppliers } = useQuery({
        queryKey: ["suppliers"],
        queryFn: () => suppliersApi.list().then((r) => r.data),
    });
    const { data: branches } = useQuery({
        queryKey: ["branches-for-purchases"],
        queryFn: () => api.get("/branches").then((r) => r.data),
    });
    const { data: products } = useQuery({
        queryKey: ["products-for-purchases"],
        queryFn: () => productsApi.list({ limit: 200 }).then((r) => r.data),
    });

    const createMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) => purchasesApi.create(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["purchases"] });
            toast.success("Purchase order created (draft)");
            setShowForm(false);
            setSupplierId(""); setBranchId(""); setNotes("");
            setItems([{ product_id: "", quantity: "1", unit_cost: "" }]);
            setPartQueries([""]);
        },
        onError: (err: any) => toast.error(err.response?.data?.message || "Failed to create purchase"),
    });

    const receiveMutation = useMutation({
        mutationFn: (id: string) => purchasesApi.receive(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["purchases"] });
            queryClient.invalidateQueries({ queryKey: ["admin-analytics-summary"] });
            toast.success("Stock received and added to inventory");
        },
        onError: (err: any) => toast.error(err.response?.data?.message || "Failed to receive purchase"),
    });

    const cancelMutation = useMutation({
        mutationFn: (id: string) => purchasesApi.cancel(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["purchases"] });
            toast.success("Purchase cancelled");
        },
        onError: (err: any) => toast.error(err.response?.data?.message || "Failed to cancel"),
    });

    const productList = products?.items ?? [];

    // Filters the already-fetched product list client-side by name, SKU, or
    // part number — the same three fields the register/product catalog is
    // organised around, so a search here always reflects the live catalog,
    // not a separate hand-kept list.
    const matchesForQuery = (q: string) => {
        const term = q.trim().toLowerCase();
        if (!term) return productList.slice(0, 8);
        return productList
            .filter((p: any) =>
                p.name?.toLowerCase().includes(term) ||
                p.sku?.toLowerCase().includes(term) ||
                p.part_number?.toLowerCase().includes(term)
            )
            .slice(0, 8);
    };
    const supplierList = suppliers ?? [];
    const branchList = branches?.items ?? branches ?? [];

    const handleCreate = () => {
        if (!supplierId || !branchId) { toast.error("Choose a supplier and a branch"); return; }
        const cleanItems = items
            .filter((it) => it.product_id && it.quantity && it.unit_cost)
            .map((it) => ({ product_id: it.product_id, quantity: parseInt(it.quantity), unit_cost: parseFloat(it.unit_cost) }));
        if (cleanItems.length === 0) { toast.error("Add at least one line item"); return; }
        createMutation.mutate({ supplier_id: supplierId, branch_id: branchId, notes: notes || null, items: cleanItems });
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button onClick={() => setShowForm(!showForm)} className="glass-btn text-sm">
                    {showForm ? <X size={15} /> : <Plus size={15} />}
                    {showForm ? "Cancel" : "New Purchase Order"}
                </button>
            </div>

            {showForm && (
                <div className="admin-card p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inp}>
                            <option value="">Select supplier *</option>
                            {supplierList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inp}>
                            <option value="">Select branch *</option>
                            {branchList.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2">
                        {items.map((it, idx) => {
                            const selected = productList.find((p: any) => p.id === it.product_id);
                            const query = partQueries[idx] ?? "";
                            const showDropdown = openRow === idx && !selected;
                            return (
                                <div key={idx} className="space-y-1">
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input
                                                type="text"
                                                placeholder="Search part by name, SKU, or part number…"
                                                value={selected ? `${selected.name}${selected.part_number ? ` · ${selected.part_number}` : ""}` : query}
                                                onFocus={() => setOpenRow(idx)}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setPartQueries((prev) => prev.map((q, i) => i === idx ? val : q));
                                                    // typing again after a part was picked clears the pick, so
                                                    // the field goes back to being a live search box
                                                    setItems((prev) => prev.map((p, i) => i === idx ? { ...p, product_id: "" } : p));
                                                    setOpenRow(idx);
                                                }}
                                                onBlur={() => setTimeout(() => setOpenRow((r) => (r === idx ? null : r)), 150)}
                                                className={`${inp} pl-8`}
                                            />
                                            {showDropdown && (
                                                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                                                    {matchesForQuery(query).length === 0 ? (
                                                        <p className="px-3 py-2 text-xs text-gray-400">No matching parts</p>
                                                    ) : (
                                                        matchesForQuery(query).map((p: any) => (
                                                            <button
                                                                key={p.id}
                                                                type="button"
                                                                onMouseDown={(e) => e.preventDefault()}
                                                                onClick={() => {
                                                                    setItems((prev) => prev.map((it2, i) => i === idx ? { ...it2, product_id: p.id } : it2));
                                                                    setPartQueries((prev) => prev.map((q, i) => i === idx ? "" : q));
                                                                    setOpenRow(null);
                                                                }}
                                                                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex flex-col gap-0.5"
                                                            >
                                                                <span className="text-gray-800 font-medium">{p.name}</span>
                                                                <span className="text-gray-400">
                                                                    {p.part_number && <span className="font-mono text-blue-600">{p.part_number}</span>}
                                                                    {p.part_number && p.sku ? " · " : ""}
                                                                    {p.sku}
                                                                </span>
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <input type="number" min="1" placeholder="Qty" value={it.quantity}
                                            onChange={(e) => setItems((prev) => prev.map((p, i) => i === idx ? { ...p, quantity: e.target.value } : p))}
                                            className={`${inp} w-20`} />
                                        <input type="number" min="0" step="0.01" placeholder="Unit cost (KES)" value={it.unit_cost}
                                            onChange={(e) => setItems((prev) => prev.map((p, i) => i === idx ? { ...p, unit_cost: e.target.value } : p))}
                                            className={`${inp} w-36`} />
                                        <button onClick={() => {
                                            setItems((prev) => prev.filter((_, i) => i !== idx));
                                            setPartQueries((prev) => prev.filter((_, i) => i !== idx));
                                        }} disabled={items.length === 1}
                                            className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-30"><X size={15} /></button>
                                    </div>
                                </div>
                            );
                        })}
                        <button onClick={() => {
                            setItems((prev) => [...prev, { product_id: "", quantity: "1", unit_cost: "" }]);
                            setPartQueries((prev) => [...prev, ""]);
                        }}
                            className="text-xs text-blue-600 hover:underline">+ Add line item</button>
                    </div>

                    <textarea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} h-16`} />

                    <button onClick={handleCreate} disabled={createMutation.isPending} className="glass-btn text-sm disabled:opacity-50">
                        {createMutation.isPending ? "Creating..." : "Create Purchase Order"}
                    </button>
                </div>
            )}

            {isLoading ? (
                <p className="text-sm text-gray-400">Loading...</p>
            ) : (purchases ?? []).length === 0 ? (
                <div className="admin-card p-8 text-center text-gray-400 text-sm">No purchase orders yet.</div>
            ) : (
                <div className="space-y-2">
                    <p className="text-xs text-gray-400 px-1">
                        <span className="font-medium text-gray-500">Draft</span> = created, stock not added yet ·{" "}
                        <span className="font-medium text-green-600">Received</span> = ✓ clicked, stock added ·{" "}
                        <span className="font-medium text-red-500">Cancelled</span> = won't be received
                    </p>
                    {(purchases ?? []).map((p: any) => (
                        <div key={p.id} className="admin-card p-4 flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <p className="font-semibold text-sm text-gray-900">{p.purchase_number}</p>
                                <p className="text-xs text-gray-500">{money(p.total_amount)} · {p.items?.length ?? 0} line items</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${p.status === "received" ? "bg-green-100 text-green-700" : p.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
                                    }`}>{p.status}</span>
                                {p.status === "draft" && (
                                    <>
                                        <button onClick={() => receiveMutation.mutate(p.id)} title="Mark received — adds stock"
                                            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg">
                                            <CheckCircle size={15} />
                                        </button>
                                        <button onClick={() => cancelMutation.mutate(p.id)} title="Cancel"
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                                            <XCircle size={15} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Expenses ─────────────────────────────────────────────────────────────────

function ExpensesTab() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ category: "other", description: "", amount: "" });

    const { data: expenses, isLoading } = useQuery({
        queryKey: ["expenses"],
        queryFn: () => expensesApi.list().then((r) => r.data),
    });

    const createMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) => expensesApi.create(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["expenses"] });
            queryClient.invalidateQueries({ queryKey: ["admin-analytics-summary"] });
            toast.success("Expense logged");
            setShowForm(false);
            setForm({ category: "other", description: "", amount: "" });
        },
        onError: (err: any) => toast.error(err.response?.data?.message || "Failed to log expense"),
    });

    const handleCreate = () => {
        if (!form.description.trim() || !form.amount) { toast.error("Description and amount are required"); return; }
        createMutation.mutate({ category: form.category, description: form.description, amount: parseFloat(form.amount) });
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button onClick={() => setShowForm(!showForm)} className="glass-btn text-sm">
                    {showForm ? <X size={15} /> : <Plus size={15} />}
                    {showForm ? "Cancel" : "Log Expense"}
                </button>
            </div>

            {showForm && (
                <div className="admin-card p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inp}>
                            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
                        </select>
                        <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">KES</span>
                            <input type="number" min="0" step="0.01" placeholder="Amount" value={form.amount}
                                onChange={(e) => setForm({ ...form, amount: e.target.value })} className={`${inp} pl-11`} />
                        </div>
                    </div>
                    <input placeholder="Description *" value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })} className={inp} />
                    <button onClick={handleCreate} disabled={createMutation.isPending} className="glass-btn text-sm disabled:opacity-50">
                        {createMutation.isPending ? "Saving..." : "Log Expense"}
                    </button>
                </div>
            )}

            {isLoading ? (
                <p className="text-sm text-gray-400">Loading...</p>
            ) : (expenses ?? []).length === 0 ? (
                <div className="admin-card p-8 text-center text-gray-400 text-sm">No expenses logged yet.</div>
            ) : (
                <div className="space-y-2">
                    {(expenses ?? []).map((e: any) => (
                        <div key={e.id} className="admin-card p-4 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-900">{e.description}</p>
                                <p className="text-xs text-gray-500 capitalize">{e.category.replace("_", " ")}</p>
                            </div>
                            <p className="text-sm font-semibold text-gray-900">{money(e.amount)}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Suppliers ────────────────────────────────────────────────────────────────

function SupplierTaggedParts({ supplierId, supplierName, branchList }: { supplierId: string; supplierName: string; branchList: any[] }) {
    const queryClient = useQueryClient();
    const [checked, setChecked] = useState<Record<string, boolean>>({});
    const [createdPurchase, setCreatedPurchase] = useState<any | null>(null);
    const [busy, setBusy] = useState<"" | "print" | "excel" | "pdf" | "list-excel" | "list-pdf">("");

    const { data: parts, isLoading } = useQuery({
        queryKey: ["supplier-tagged-parts", supplierId],
        queryFn: () => suppliersApi.taggedParts(supplierId).then((r) => r.data),
    });

    // Downloads/prints the tagged-parts list itself — every part ever tagged
    // to this supplier — independent of creating a purchase order below.
    const handleListPrint = () => window.print();

    const handleListExportExcel = async () => {
        setBusy("list-excel");
        try {
            const res = await suppliersApi.taggedPartsExcelBlob(supplierId);
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement("a");
            a.href = url; a.download = `${supplierName.replace(/\s+/g, "_")}_tagged_parts.xlsx`;
            a.click(); window.URL.revokeObjectURL(url);
        } catch {
            toast.error("Failed to export Excel");
        } finally {
            setBusy("");
        }
    };

    const handleListDownloadPdf = async () => {
        setBusy("list-pdf");
        try {
            const res = await suppliersApi.taggedPartsPdfBlob(supplierId);
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement("a");
            a.href = url; a.download = `${supplierName.replace(/\s+/g, "_")}_tagged_parts.pdf`;
            a.click(); window.URL.revokeObjectURL(url);
        } catch {
            toast.error("Failed to download PDF");
        } finally {
            setBusy("");
        }
    };

    const createPO = useMutation({
        mutationFn: (payload: Record<string, unknown>) => purchasesApi.create(payload),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ["purchases"] });
            toast.success(`Draft purchase order ${res.data.purchase_number} created`);
            setCreatedPurchase(res.data);
        },
        onError: (err: any) => toast.error(err.response?.data?.message || "Failed to create purchase order"),
    });

    const checkedIds = Object.keys(checked).filter((id) => checked[id]);

    const handleCreatePO = () => {
        if (checkedIds.length === 0) { toast.error("Tick at least one part first"); return; }
        const branchId = branchList[0]?.id;
        if (!branchId) { toast.error("No branch found — add a branch first"); return; }
        createPO.mutate({
            supplier_id: supplierId,
            branch_id: branchId,
            notes: "Draft order — created from Suppliers page tagged parts",
            items: checkedIds.map((id) => ({ product_id: id, quantity: 1, unit_cost: 0 })),
        });
    };

    const handlePrint = () => window.print();

    const handleExportExcel = async () => {
        if (!createdPurchase) return;
        setBusy("excel");
        try {
            const res = await purchasesApi.excelBlob(createdPurchase.id);
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement("a");
            a.href = url; a.download = `${createdPurchase.purchase_number}.xlsx`;
            a.click(); window.URL.revokeObjectURL(url);
        } catch {
            toast.error("Failed to export Excel");
        } finally {
            setBusy("");
        }
    };

    const handleDownloadPdf = async () => {
        if (!createdPurchase) return;
        setBusy("pdf");
        try {
            const res = await purchasesApi.pdfBlob(createdPurchase.id);
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement("a");
            a.href = url; a.download = `${createdPurchase.purchase_number}.pdf`;
            a.click(); window.URL.revokeObjectURL(url);
        } catch {
            toast.error("Failed to download PDF");
        } finally {
            setBusy("");
        }
    };

    if (isLoading) return <p className="text-xs text-gray-400 px-4 pb-3">Loading tagged parts…</p>;
    if (!parts || parts.length === 0) {
        return <p className="text-xs text-gray-400 px-4 pb-3">No parts tagged with this supplier yet — tag one from the product's Suppliers section when adding or editing it.</p>;
    }

    return (
        <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3 mt-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-gray-500">
                    Every part ever tagged to this supplier ({parts.length}). Click a part to open it in the catalogue.
                </p>
                <div className="flex items-center gap-2 flex-wrap print:hidden">
                    <button onClick={handleListPrint} className="flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-sm">
                        <Printer size={12} /> Print
                    </button>
                    <button onClick={handleListExportExcel} disabled={busy === "list-excel"} className="flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-sm disabled:opacity-50">
                        {busy === "list-excel" ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />} Excel
                    </button>
                    <button onClick={handleListDownloadPdf} disabled={busy === "list-pdf"} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg text-xs font-semibold shadow-sm">
                        {busy === "list-pdf" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} PDF
                    </button>
                </div>
            </div>
            <div className="max-h-52 overflow-y-auto space-y-1">
                {parts.map((p: any) => (
                    <div key={p.product_id} className="flex items-center justify-between gap-2 text-xs py-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <input
                                type="checkbox"
                                checked={!!checked[p.product_id]}
                                onChange={(e) => setChecked((prev) => ({ ...prev, [p.product_id]: e.target.checked }))}
                            />
                            <span className="font-mono text-blue-600 flex-shrink-0">{p.part_number || "—"}</span>
                            <span className="text-gray-700 truncate">{p.name}</span>
                            {p.price_usd != null && <span className="text-gray-400 flex-shrink-0">· ${(p.price_usd / 100).toLocaleString()}</span>}
                        </div>
                        <Link
                            href={`/admin/products/new?edit=${p.product_id}`}
                            className="flex items-center gap-1 text-blue-600 hover:underline flex-shrink-0"
                            title="Edit this part"
                        >
                            <Pencil size={11} /> Edit
                        </Link>
                    </div>
                ))}
            </div>
            <p className="text-xs text-gray-500 pt-1">Tick parts below to create a draft purchase order for this supplier.</p>
            <button onClick={handleCreatePO} disabled={createPO.isPending} className="glass-btn text-xs disabled:opacity-50">
                {createPO.isPending ? "Creating…" : `Create Purchase Order (${checkedIds.length} selected)`}
            </button>

            {createdPurchase && (
                <div className="admin-card p-3 bg-green-50 border-green-100 flex flex-col gap-2">
                    <p className="text-xs text-green-800">
                        Draft <b>{createdPurchase.purchase_number}</b> created — visible in the Purchases tab, still needs Receive once the order actually arrives.
                    </p>
                    <div className="flex items-center gap-2 flex-wrap print:hidden">
                        <button onClick={handlePrint} className="flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm">
                            <Printer size={13} /> Print
                        </button>
                        <button onClick={handleExportExcel} disabled={busy === "excel"} className="flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50">
                            {busy === "excel" ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Export to Excel
                        </button>
                        <button onClick={handleDownloadPdf} disabled={busy === "pdf"} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm">
                            {busy === "pdf" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download PDF
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function SuppliersTab() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: "", contact_person: "", phone: "", email: "" });
    const [expanded, setExpanded] = useState<string | null>(null);

    const { data: suppliers, isLoading } = useQuery({
        queryKey: ["suppliers"],
        queryFn: () => suppliersApi.list().then((r) => r.data),
    });
    const { data: branches } = useQuery({
        queryKey: ["branches-for-suppliers"],
        queryFn: () => api.get("/branches").then((r) => r.data),
    });
    const branchList = branches?.items ?? branches ?? [];

    const createMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) => suppliersApi.create(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["suppliers"] });
            toast.success("Supplier added");
            setShowForm(false);
            setForm({ name: "", contact_person: "", phone: "", email: "" });
        },
        onError: (err: any) => toast.error(err.response?.data?.message || "Failed to add supplier"),
    });

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button onClick={() => setShowForm(!showForm)} className="glass-btn text-sm">
                    {showForm ? <X size={15} /> : <Plus size={15} />}
                    {showForm ? "Cancel" : "Add Supplier"}
                </button>
            </div>

            {showForm && (
                <div className="admin-card p-4 space-y-3">
                    <input placeholder="Supplier name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input placeholder="Contact person" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className={inp} />
                        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inp} />
                        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} />
                    </div>
                    <button onClick={() => { if (!form.name.trim()) { toast.error("Name is required"); return; } createMutation.mutate(form); }}
                        disabled={createMutation.isPending} className="glass-btn text-sm disabled:opacity-50">
                        {createMutation.isPending ? "Saving..." : "Add Supplier"}
                    </button>
                </div>
            )}

            {isLoading ? (
                <p className="text-sm text-gray-400">Loading...</p>
            ) : (suppliers ?? []).length === 0 ? (
                <div className="admin-card p-8 text-center text-gray-400 text-sm">No suppliers yet.</div>
            ) : (
                <div className="space-y-2">
                    {(suppliers ?? []).map((s: any) => {
                        const isOpen = expanded === s.id;
                        return (
                            <div key={s.id} className="admin-card overflow-hidden">
                                <button
                                    onClick={() => setExpanded(isOpen ? null : s.id)}
                                    className="w-full text-left p-4 flex items-center justify-between gap-2"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">{s.name}</p>
                                        <p className="text-xs text-gray-500">{[s.contact_person, s.phone, s.email].filter(Boolean).join(" · ") || "No contact details"}</p>
                                    </div>
                                    {isOpen ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
                                </button>
                                {isOpen && <SupplierTaggedParts supplierId={s.id} supplierName={s.name} branchList={branchList} />}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

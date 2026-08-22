"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { purchasesApi, suppliersApi, expensesApi, productsApi, api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, X, Truck, Receipt, Building2, CheckCircle, XCircle } from "lucide-react";

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
                    Restocks from suppliers and operating costs — these feed the "Full Analytics" card on the Overview page.
                </p>
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
                        {items.map((it, idx) => (
                            <div key={idx} className="flex gap-2">
                                <select value={it.product_id} onChange={(e) => setItems((prev) => prev.map((p, i) => i === idx ? { ...p, product_id: e.target.value } : p))} className={`${inp} flex-1`}>
                                    <option value="">Select product</option>
                                    {productList.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <input type="number" min="1" placeholder="Qty" value={it.quantity}
                                    onChange={(e) => setItems((prev) => prev.map((p, i) => i === idx ? { ...p, quantity: e.target.value } : p))}
                                    className={`${inp} w-20`} />
                                <input type="number" min="0" step="0.01" placeholder="Unit cost (KES)" value={it.unit_cost}
                                    onChange={(e) => setItems((prev) => prev.map((p, i) => i === idx ? { ...p, unit_cost: e.target.value } : p))}
                                    className={`${inp} w-36`} />
                                <button onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} disabled={items.length === 1}
                                    className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-30"><X size={15} /></button>
                            </div>
                        ))}
                        <button onClick={() => setItems((prev) => [...prev, { product_id: "", quantity: "1", unit_cost: "" }])}
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

function SuppliersTab() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: "", contact_person: "", phone: "", email: "" });

    const { data: suppliers, isLoading } = useQuery({
        queryKey: ["suppliers"],
        queryFn: () => suppliersApi.list().then((r) => r.data),
    });

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
                    {(suppliers ?? []).map((s: any) => (
                        <div key={s.id} className="admin-card p-4">
                            <p className="text-sm font-medium text-gray-900">{s.name}</p>
                            <p className="text-xs text-gray-500">{[s.contact_person, s.phone, s.email].filter(Boolean).join(" · ") || "No contact details"}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

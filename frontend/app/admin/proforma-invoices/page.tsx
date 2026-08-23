"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { proformaApi } from "@/lib/api";
import { useAuthStore } from "@/stores";
import toast from "react-hot-toast";
import { Plus, X, FileText, Trash2, ChevronDown, ChevronUp } from "lucide-react";

const inp = "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 placeholder:text-gray-400";

type Item = { description: string; quantity: string; unit_price_kes: string };

const emptyItem = (): Item => ({ description: "", quantity: "1", unit_price_kes: "" });

const STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-blue-100 text-blue-700",
    accepted: "bg-green-100 text-green-700",
    expired: "bg-yellow-100 text-yellow-700",
    converted: "bg-purple-100 text-purple-700",
    void: "bg-red-100 text-red-700",
};
const STATUS_OPTIONS = ["draft", "sent", "accepted", "expired", "converted", "void"];

function kes(cents: number) {
    return `KSh ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ProformaInvoicesPage() {
    const { user } = useAuthStore();
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState("all");

    const [form, setForm] = useState({
        customer_name: "", customer_phone: "", customer_email: "",
        notes: "", valid_until: "", tax_kes: "0",
    });
    const [items, setItems] = useState<Item[]>([emptyItem()]);

    const isSecretary = user?.role === "secretary";
    const canSeeAll = user?.role === "super_admin" || user?.role === "director";

    const { data, isLoading } = useQuery({
        queryKey: ["proforma-invoices", statusFilter],
        queryFn: () =>
            proformaApi.list(statusFilter === "all" ? undefined : { status: statusFilter }).then((r) => r.data),
    });

    const createMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) => proformaApi.create(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["proforma-invoices"] });
            toast.success("Proforma invoice created");
            setShowForm(false);
            setForm({ customer_name: "", customer_phone: "", customer_email: "", notes: "", valid_until: "", tax_kes: "0" });
            setItems([emptyItem()]);
        },
        onError: (err: any) => toast.error(err.response?.data?.message || "Failed to create proforma invoice"),
    });

    const statusMutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: string }) => proformaApi.updateStatus(id, status),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["proforma-invoices"] });
            toast.success("Status updated");
        },
        onError: (err: any) => toast.error(err.response?.data?.message || "Failed to update status"),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => proformaApi.remove(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["proforma-invoices"] });
            toast.success("Draft deleted");
        },
        onError: (err: any) => toast.error(err.response?.data?.message || "Failed to delete"),
    });

    const updateItem = (idx: number, field: keyof Item, value: string) => {
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
    };
    const addItem = () => setItems((prev) => [...prev, emptyItem()]);
    const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

    const runningTotal = items.reduce((sum, it) => {
        const qty = parseFloat(it.quantity) || 0;
        const price = parseFloat(it.unit_price_kes) || 0;
        return sum + qty * price;
    }, 0);

    const handleCreate = () => {
        if (!form.customer_name.trim()) { toast.error("Customer name is required"); return; }
        const cleanItems = items
            .filter((it) => it.description.trim())
            .map((it) => ({
                description: it.description.trim(),
                quantity: parseFloat(it.quantity) || 1,
                unit_price_kes: Math.round((parseFloat(it.unit_price_kes) || 0) * 100),
            }));
        if (cleanItems.length === 0) { toast.error("Add at least one line item"); return; }

        createMutation.mutate({
            customer_name: form.customer_name,
            customer_phone: form.customer_phone || null,
            customer_email: form.customer_email || null,
            notes: form.notes || null,
            valid_until: form.valid_until || null,
            tax_kes: Math.round((parseFloat(form.tax_kes) || 0) * 100),
            items: cleanItems,
        });
    };

    const invoices = data || [];

    return (
        <div className="space-y-4 max-w-4xl">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Proforma Invoices</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {canSeeAll
                            ? "Every proforma invoice raised across the business — including secretaries' work."
                            : "Quotes you've raised for customers."}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inp} w-auto`}>
                        <option value="all">All statuses</option>
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={() => setShowForm(!showForm)} className="glass-btn text-sm whitespace-nowrap">
                        <Plus size={15} /> New Proforma Invoice
                    </button>
                </div>
            </div>

            {showForm && (
                <div className="admin-card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-gray-900">New proforma invoice</h2>
                        <button onClick={() => setShowForm(false)}><X size={16} className="text-gray-400" /></button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input placeholder="Customer name *" value={form.customer_name}
                            onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className={inp} />
                        <input placeholder="Phone" value={form.customer_phone}
                            onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} className={inp} />
                        <input placeholder="Email" value={form.customer_email}
                            onChange={(e) => setForm({ ...form, customer_email: e.target.value })} className={inp} />
                        <input type="date" placeholder="Valid until" value={form.valid_until}
                            onChange={(e) => setForm({ ...form, valid_until: e.target.value })} className={inp} />
                    </div>

                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">Line items</p>
                        <div className="space-y-2">
                            {items.map((it, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                    <input placeholder="Description / part" value={it.description}
                                        onChange={(e) => updateItem(idx, "description", e.target.value)}
                                        className={`${inp} flex-1`} />
                                    <input type="number" min="0" step="0.01" placeholder="Qty" value={it.quantity}
                                        onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                                        className={`${inp} w-20`} />
                                    <input type="number" min="0" step="0.01" placeholder="Unit price (KSh)" value={it.unit_price_kes}
                                        onChange={(e) => updateItem(idx, "unit_price_kes", e.target.value)}
                                        className={`${inp} w-32`} />
                                    <button onClick={() => removeItem(idx)} disabled={items.length === 1}
                                        className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-30">
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button onClick={addItem} className="mt-2 text-xs text-blue-600 hover:underline">+ Add line item</button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <textarea placeholder="Notes" value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inp} h-20`} />
                        <div className="flex flex-col justify-between">
                            <label className="text-xs text-gray-500 mb-1">Tax (KSh)</label>
                            <input type="number" min="0" step="0.01" value={form.tax_kes}
                                onChange={(e) => setForm({ ...form, tax_kes: e.target.value })} className={inp} />
                            <p className="text-sm text-gray-600 mt-2">
                                Subtotal: <span className="font-semibold">{kes(Math.round(runningTotal * 100))}</span>
                            </p>
                        </div>
                    </div>

                    <button onClick={handleCreate} disabled={createMutation.isPending} className="glass-btn text-sm w-full disabled:opacity-50">
                        {createMutation.isPending ? "Saving..." : "Create Proforma Invoice"}
                    </button>
                </div>
            )}

            {isLoading ? (
                <p className="text-sm text-gray-400">Loading...</p>
            ) : invoices.length === 0 ? (
                <div className="admin-card p-8 text-center text-gray-400">
                    <FileText size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No proforma invoices yet.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {invoices.map((inv: any) => {
                        const expanded = expandedId === inv.id;
                        return (
                            <div key={inv.id} className="admin-card p-4">
                                <button
                                    onClick={() => setExpandedId(expanded ? null : inv.id)}
                                    className="w-full flex items-center justify-between gap-3 text-left"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-gray-900 text-sm">{inv.pi_number}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[inv.status]}`}>
                                                {inv.status}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                                            {inv.customer_name} · {kes(inv.total_kes)}
                                            {canSeeAll && inv.created_by_name ? ` · by ${inv.created_by_name}` : ""}
                                        </p>
                                    </div>
                                    {expanded ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
                                </button>

                                {expanded && (
                                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                                        <div className="text-xs text-gray-500 space-y-1">
                                            {inv.customer_phone && <p>Phone: {inv.customer_phone}</p>}
                                            {inv.customer_email && <p>Email: {inv.customer_email}</p>}
                                            {inv.valid_until && <p>Valid until: {inv.valid_until}</p>}
                                            {inv.notes && <p>Notes: {inv.notes}</p>}
                                        </div>

                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="text-left text-gray-400 border-b border-gray-100">
                                                    <th className="pb-1.5 font-medium">Item</th>
                                                    <th className="pb-1.5 font-medium text-right">Qty</th>
                                                    <th className="pb-1.5 font-medium text-right">Unit price</th>
                                                    <th className="pb-1.5 font-medium text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {inv.items.map((it: any) => (
                                                    <tr key={it.id} className="border-b border-gray-50 text-gray-700">
                                                        <td className="py-1.5">{it.description}</td>
                                                        <td className="py-1.5 text-right">{it.quantity}</td>
                                                        <td className="py-1.5 text-right">{kes(it.unit_price_kes)}</td>
                                                        <td className="py-1.5 text-right">{kes(it.line_total_kes)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        <div className="flex items-center justify-between text-xs text-gray-600">
                                            <div className="space-y-0.5">
                                                <p>Subtotal: {kes(inv.subtotal_kes)}</p>
                                                <p>Tax: {kes(inv.tax_kes)}</p>
                                                <p className="font-semibold text-gray-900">Total: {kes(inv.total_kes)}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={inv.status}
                                                    onChange={(e) => statusMutation.mutate({ id: inv.id, status: e.target.value })}
                                                    className={`${inp} w-auto py-1.5`}
                                                >
                                                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                                {inv.status === "draft" && (
                                                    <button
                                                        onClick={() => deleteMutation.mutate(inv.id)}
                                                        className="p-2 text-gray-400 hover:text-red-500"
                                                        title="Delete draft"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

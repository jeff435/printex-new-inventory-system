"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { proformaApi, productsApi } from "@/lib/api";
import { downloadBlob, openPdfBlob, printPdfBlob } from "@/lib/file-export";
import { useAuthStore, usePendingPiStore, useAdminBranchStore } from "@/stores";
import toast from "react-hot-toast";
import {
    Plus, X, FileText, Trash2, ChevronDown, ChevronUp,
    Search, Download, Printer, FileSpreadsheet, Pencil,
} from "lucide-react";

const inp = "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 placeholder:text-gray-400";

// Kenya's standard VAT rate. This mirrors VAT_RATE in the backend
// (app/proforma/router.py) purely so the form can show a live preview as
// someone types — the number that actually gets saved is always computed
// server-side, never trusted from here.
const VAT_RATE = 0.16;

type Item = {
    product_id: string | null;
    // Carried as its own field rather than being glued onto the front of the
    // description. The backend snapshots it onto the invoice line so it can
    // be printed in its own "Part No." column, and a number embedded in prose
    // can't be put in a column.
    part_number: string | null;
    description: string;
    quantity: string;
    unit_price_kes: string; // KSh, not cents
};

const emptyItem = (): Item => ({ product_id: null, part_number: null, description: "", quantity: "1", unit_price_kes: "" });

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
function kshInput(value: number) {
    // Feeds an <input type="number">, which cannot render a
    // thousands-separated string (e.g. "15,200.00") — must stay a
    // plain decimal.
    return (value / 100).toFixed(2);
}

// ── Product search box for a single line item ──────────────────────────────

function ProductSearchBox({
    item, onSelectProduct, onDescriptionChange,
}: {
    item: Item;
    onSelectProduct: (p: { id: string; name: string; part_number?: string | null; price_kes: number }) => void;
    onDescriptionChange: (value: string) => void;
}) {
    const [query, setQuery] = useState(item.description);
    const [open, setOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => setQuery(item.description), [item.description]);

    useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    const { data } = useQuery({
        queryKey: ["pi-product-search", query],
        queryFn: () => productsApi.list({ search: query, limit: 8 }).then((r) => r.data),
        enabled: open && query.trim().length >= 2,
    });
    const results = data?.items ?? [];

    return (
        <div ref={boxRef} className="relative flex-1">
            <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-350 text-gray-400" />
                <input
                    placeholder="Search by part number or name"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); onDescriptionChange(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    className={`${inp} pl-7`}
                />
            </div>
            {open && query.trim().length >= 2 && results.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {results.map((p: any) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                                onSelectProduct({ id: p.id, name: p.name, part_number: p.part_number, price_kes: p.price_kes });
                                setQuery(p.name);
                                setOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-gray-50 last:border-0"
                        >
                            <p className="font-medium text-gray-800 truncate">
                                {p.part_number && <span className="text-blue-600 font-mono">{p.part_number}</span>}
                                {p.part_number && " — "}
                                {p.name}
                            </p>
                            <p className="text-gray-400">
                                {p.sku} · {p.needs_pricing ? "Not yet priced" : kes(p.price_kes)}
                            </p>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Full-screen "Add Part" search window ────────────────────────────────────
// A separate, guaranteed-visible way to add a part to the invoice — a fixed
// full-screen overlay, not a dropdown positioned under a small input. It
// can't end up clipped, hidden behind another element, or squeezed to
// nothing the way a small inline dropdown can, so this is the reliable path
// even if the inline search box in a line item ever misbehaves.
function AddPartModal({
    open, onClose, onAdd,
}: {
    open: boolean;
    onClose: () => void;
    onAdd: (p: { id: string; name: string; part_number?: string | null; price_kes: number }) => void;
}) {
    const [query, setQuery] = useState("");
    const [addedIds, setAddedIds] = useState<string[]>([]);

    const { data, isFetching } = useQuery({
        queryKey: ["add-part-modal-search", query],
        queryFn: () => productsApi.list({ search: query, limit: 30 }).then((r) => r.data),
        enabled: open && query.trim().length >= 1,
    });
    const results = data?.items ?? [];

    useEffect(() => {
        if (open) { setQuery(""); setAddedIds([]); }
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[999] flex items-start sm:items-center justify-center bg-black/40 p-3 sm:p-6">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh] mt-10 sm:mt-0">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <h3 className="font-semibold text-gray-900">Add a part to this invoice</h3>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-4 flex-shrink-0">
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                        <input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Type a part number or part name..."
                            className="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-4">
                    {query.trim().length === 0 ? (
                        <p className="text-center text-sm text-gray-400 py-10">Start typing to search your parts.</p>
                    ) : isFetching ? (
                        <p className="text-center text-sm text-gray-400 py-10">Searching…</p>
                    ) : results.length === 0 ? (
                        <p className="text-center text-sm text-gray-400 py-10">No parts match "{query}".</p>
                    ) : (
                        <div className="space-y-1">
                            {results.map((p: any) => {
                                const added = addedIds.includes(p.id);
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => {
                                            onAdd({ id: p.id, name: p.name, part_number: p.part_number, price_kes: p.price_kes });
                                            setAddedIds((prev) => [...prev, p.id]);
                                        }}
                                        className={`w-full flex items-center justify-between gap-3 text-left px-3 py-2.5 rounded-xl transition-colors ${added ? "bg-green-50" : "hover:bg-gray-50"
                                            }`}
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                                {p.part_number && (
                                                    <span className="text-blue-600 font-mono mr-1">{p.part_number}</span>
                                                )}
                                                {p.name}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                {p.sku} · {p.needs_pricing ? "Not yet priced" : kes(p.price_kes)}
                                            </p>
                                        </div>
                                        <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${added ? "bg-green-100 text-green-700" : "bg-blue-50 text-blue-700"
                                            }`}>
                                            {added ? "Added ✓" : "Add"}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
                    <p className="text-xs text-gray-400">
                        {addedIds.length > 0 ? `${addedIds.length} part${addedIds.length > 1 ? "s" : ""} added` : "Pick as many as you need"}
                    </p>
                    <button onClick={onClose} className="glass-btn text-sm px-4 py-2">Done</button>
                </div>
            </div>
        </div>
    );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function ProformaInvoicesPage() {
    const { user } = useAuthStore();
    const { selectedBranchId } = useAdminBranchStore();
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState("all");
    const [busyExportId, setBusyExportId] = useState<string | null>(null);
    const [addPartModalOpen, setAddPartModalOpen] = useState(false);

    const [form, setForm] = useState({
        customer_name: "", customer_phone: "", customer_email: "",
        notes: "", valid_until: "", discount_pct: "0",
    });
    const [items, setItems] = useState<Item[]>([emptyItem()]);

    // ── Parts sent over from the Products page's "Add to Proforma Invoice"
    // button ─────────────────────────────────────────────────────────────
    // Each part in the queue becomes its own line item — never overwrites a
    // row that already has something in it — so clicking "Add to PI" on
    // several different parts (even across separate visits to Products)
    // adds every one of them, not just the last one.
    const { parts: pendingParts, clearParts } = usePendingPiStore();
    useEffect(() => {
        if (pendingParts.length === 0) return;
        setShowForm(true);
        setItems((prev) => {
            const hasRealRow = prev.some((it) => it.description.trim() || it.product_id);
            const base = hasRealRow ? prev : [];
            const newRows: Item[] = pendingParts.map((p) => ({
                product_id: p.product_id,
                part_number: p.part_number || null,
                description: p.name,
                quantity: "1",
                unit_price_kes: kshInput(p.price_kes),
            }));
            return [...base, ...newRows];
        });
        clearParts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingParts.length]);

    const isSecretary = user?.role === "secretary";
    const canSeeAll = user?.role === "super_admin" || user?.role === "director";

    const { data, isLoading } = useQuery({
        queryKey: ["proforma-invoices", statusFilter],
        queryFn: () =>
            proformaApi.list(statusFilter === "all" ? undefined : { status: statusFilter }).then((r) => r.data),
    });

    const resetForm = () => {
        setForm({ customer_name: "", customer_phone: "", customer_email: "", notes: "", valid_until: "", discount_pct: "0" });
        setItems([emptyItem()]);
        setEditingId(null);
    };

    const createMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) => proformaApi.create(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["proforma-invoices"] });
            toast.success("Proforma invoice created");
            setShowForm(false);
            resetForm();
        },
        onError: (err: any) => toast.error(err.response?.data?.message || "Failed to create proforma invoice"),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
            proformaApi.update(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["proforma-invoices"] });
            toast.success("Proforma invoice updated");
            setShowForm(false);
            resetForm();
        },
        onError: (err: any) => toast.error(err.response?.data?.message || "Failed to update proforma invoice"),
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

    const updateItem = (idx: number, field: keyof Item, value: string | null) => {
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
    };
    const addItem = () => setItems((prev) => [...prev, emptyItem()]);
    const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

    // Adds a part chosen from the full-screen Add Part window as its own new
    // line — drops into the first empty row if one's sitting there unused,
    // otherwise appends a fresh row, so it never overwrites a part already
    // added.
    const handleAddPartFromModal = (p: { id: string; name: string; part_number?: string | null; price_kes: number }) => {
        setShowForm(true);
        setItems((prev) => {
            const emptyIdx = prev.findIndex((it) => !it.description.trim() && !it.product_id);
            const newItem: Item = {
                product_id: p.id,
                part_number: p.part_number || null,
                description: p.name,
                quantity: "1",
                unit_price_kes: kshInput(p.price_kes),
            };
            if (emptyIdx !== -1) {
                return prev.map((it, i) => (i === emptyIdx ? newItem : it));
            }
            return [...prev, newItem];
        });
    };

    // ── Live preview totals — mirrors the server's calc, display only ────────
    const subtotalCents = items.reduce((sum, it) => {
        const qty = parseFloat(it.quantity) || 0;
        const price = Math.round((parseFloat(it.unit_price_kes) || 0) * 100);
        return sum + qty * price;
    }, 0);
    const discountPct = Math.min(100, Math.max(0, parseFloat(form.discount_pct) || 0));
    const discountCents = Math.round(subtotalCents * (discountPct / 100));
    const taxableCents = subtotalCents - discountCents;
    const vatCents = Math.round(taxableCents * VAT_RATE);
    const totalCents = taxableCents + vatCents;

    const buildPayload = () => {
        const cleanItems = items
            .filter((it) => it.description.trim())
            .map((it) => ({
                product_id: it.product_id || null,
                part_number: (it.part_number || "").trim() || null,
                description: it.description.trim(),
                quantity: parseFloat(it.quantity) || 1,
                unit_price_kes: Math.round((parseFloat(it.unit_price_kes) || 0) * 100),
            }));
        return {
            customer_name: form.customer_name,
            customer_phone: form.customer_phone || null,
            customer_email: form.customer_email || null,
            // Which branch's shelf this quote's parts come off. Falls back to
            // null (no auto stock deduction happens) when "All branches" is
            // selected in the header, since there'd be no single branch to
            // deduct from.
            branch_id: selectedBranchId || null,
            notes: form.notes || null,
            valid_until: form.valid_until || null,
            discount_pct: discountPct,
            items: cleanItems,
        };
    };

    const handleSave = () => {
        if (!form.customer_name.trim()) { toast.error("Customer name is required"); return; }
        const payload = buildPayload();
        if ((payload.items as unknown[]).length === 0) { toast.error("Add at least one line item"); return; }
        if (editingId) updateMutation.mutate({ id: editingId, payload });
        else createMutation.mutate(payload);
    };

    const startEdit = (inv: any) => {
        setEditingId(inv.id);
        setForm({
            customer_name: inv.customer_name,
            customer_phone: inv.customer_phone || "",
            customer_email: inv.customer_email || "",
            notes: inv.notes || "",
            valid_until: inv.valid_until || "",
            discount_pct: String(inv.discount_pct ?? "0"),
        });
        setItems(
            inv.items.map((it: any) => ({
                product_id: it.product_id,
                part_number: it.part_number ?? null,
                description: it.description,
                quantity: String(it.quantity),
                unit_price_kes: kshInput(it.unit_price_kes),
            }))
        );
        setShowForm(true);
        setExpandedId(null);
    };

    const handlePrint = async (id: string) => {
        setBusyExportId(id);
        try {
            const res = await proformaApi.pdfBlob(id);
            printPdfBlob(res);
        } catch {
            toast.error("Couldn't load the PDF for printing");
        } finally {
            setBusyExportId(null);
        }
    };
    const handleDownloadPdf = async (id: string, piNumber: string) => {
        setBusyExportId(id);
        try {
            const res = await proformaApi.pdfBlob(id);
            openPdfBlob(res);
        } catch {
            toast.error("Couldn't download the PDF");
        } finally {
            setBusyExportId(null);
        }
    };
    const handleDownloadExcel = async (id: string, piNumber: string) => {
        setBusyExportId(id);
        try {
            const res = await proformaApi.excelBlob(id);
            downloadBlob(res, `${piNumber}.xlsx`);
        } catch {
            toast.error("Couldn't export to Excel");
        } finally {
            setBusyExportId(null);
        }
    };

    const invoices = data || [];
    const saving = createMutation.isPending || updateMutation.isPending;

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
                    <button
                        onClick={() => { if (showForm) resetForm(); setShowForm(!showForm); }}
                        className="glass-btn text-sm whitespace-nowrap"
                    >
                        {showForm ? <X size={15} /> : <Plus size={15} />}
                        {showForm ? "Cancel" : "New Proforma Invoice"}
                    </button>
                </div>
            </div>

            {showForm && (
                <div className="admin-card p-4 space-y-4">
                    <h2 className="font-semibold text-gray-900 text-sm">
                        {editingId ? "Edit draft proforma invoice" : "New proforma invoice"}
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input placeholder="Customer name *" value={form.customer_name}
                            onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className={inp} />
                        <input placeholder="Phone" value={form.customer_phone}
                            onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} className={inp} />
                        <input placeholder="Email" value={form.customer_email}
                            onChange={(e) => setForm({ ...form, customer_email: e.target.value })} className={inp} />
                    </div>

                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">
                            Line items — search links straight to inventory; price fills in automatically but can still be edited
                        </p>
                        <div className="space-y-2">
                            {items.map((it, idx) => {
                                // Read straight off the row now that part_number is
                                // its own field. This used to be recovered by slicing
                                // the description at " — ", which silently mangled any
                                // part whose own name contained an em dash.
                                const linkedPartNumber = it.part_number;
                                const linkedName = it.product_id ? it.description : null;

                                const qty = parseFloat(it.quantity) || 0;
                                const priceCents = Math.round((parseFloat(it.unit_price_kes) || 0) * 100);
                                const lineTotalCents = qty * priceCents;

                                return (
                                    <div key={idx} className="space-y-1">
                                        <div className="flex gap-2 items-start">
                                            <ProductSearchBox
                                                item={it}
                                                onDescriptionChange={(value) => {
                                                    updateItem(idx, "description", value);
                                                    updateItem(idx, "product_id", null);
                                                    // The old catalogue number must not survive
                                                    // onto what is now a different, manual line.
                                                    updateItem(idx, "part_number", null);
                                                }}
                                                onSelectProduct={(p) => {
                                                    updateItem(idx, "product_id", p.id);
                                                    updateItem(idx, "description", p.name);
                                                    updateItem(idx, "part_number", p.part_number || null);
                                                    updateItem(idx, "unit_price_kes", kshInput(p.price_kes));
                                                    // Picking a part on the last row opens a fresh
                                                    // empty row right away, so adding several parts
                                                    // in a row never requires reaching for "+ Add
                                                    // line item" in between each one.
                                                    if (idx === items.length - 1) addItem();
                                                }}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Part No."
                                                value={it.part_number ?? ""}
                                                onChange={(e) => updateItem(idx, "part_number", e.target.value || null)}
                                                className={`${inp} w-32 font-mono`}
                                                title="Printed in its own column on the PDF. Filled in automatically when you link a catalogue part; type it by hand for a manual line."
                                            />
                                            <input type="number" min="0" step="0.01" placeholder="Qty" value={it.quantity}
                                                onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                                                className={`${inp} w-20`} />
                                            <div className="relative w-36">
                                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">KSh</span>
                                                <input type="number" min="0" step="0.01" placeholder="Unit price" value={it.unit_price_kes}
                                                    onChange={(e) => updateItem(idx, "unit_price_kes", e.target.value)}
                                                    className={`${inp} pl-9`} title="Kenya Shillings — editable even after linking to inventory" />
                                            </div>
                                            <button onClick={() => removeItem(idx)} disabled={items.length === 1}
                                                className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-30 mt-0.5">
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                        {(linkedName || qty > 0) && (
                                            <div className="flex items-center justify-between gap-2 pl-1 text-xs">
                                                {linkedName ? (
                                                    <p className="text-green-700 truncate">
                                                        ✓ Linked to inventory
                                                        {linkedPartNumber && (
                                                            <span className="font-mono text-blue-600"> · {linkedPartNumber}</span>
                                                        )}
                                                        <span className="text-gray-500"> · {linkedName}</span>
                                                        <span className="text-gray-400"> · Qty {it.quantity || 0}</span>
                                                    </p>
                                                ) : <span />}
                                                {lineTotalCents > 0 && (
                                                    <p className="font-semibold text-gray-700 flex-shrink-0">= {kes(lineTotalCents)}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                            <button onClick={addItem} className="text-xs text-blue-600 hover:underline">+ Add blank line item</button>
                            <button
                                onClick={() => setAddPartModalOpen(true)}
                                className="glass-btn text-xs px-3 py-1.5 flex items-center gap-1.5"
                            >
                                <Search size={12} />
                                Add Part
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-3">
                            <textarea placeholder="Notes" value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inp} h-20`} />
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Valid until</label>
                                <input type="date" value={form.valid_until}
                                    onChange={(e) => setForm({ ...form, valid_until: e.target.value })} className={inp} />
                            </div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
                            <div className="flex items-center justify-between">
                                <label className="text-xs text-gray-500">Discount (%)</label>
                                <input type="number" min="0" max="100" step="0.1" value={form.discount_pct}
                                    onChange={(e) => setForm({ ...form, discount_pct: e.target.value })}
                                    className="w-20 px-2 py-1 text-sm text-right bg-white border border-gray-200 rounded-lg" />
                            </div>
                            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{kes(subtotalCents)}</span></div>
                            {discountCents > 0 && (
                                <div className="flex justify-between text-gray-600"><span>Discount ({discountPct}%)</span><span>- {kes(discountCents)}</span></div>
                            )}
                            <div className="flex justify-between text-gray-600"><span>VAT (16%, fixed)</span><span>{kes(vatCents)}</span></div>
                            <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200"><span>Total</span><span>{kes(totalCents)}</span></div>
                        </div>
                    </div>

                    <button onClick={handleSave} disabled={saving} className="glass-btn text-sm w-full disabled:opacity-50">
                        {saving ? "Saving..." : editingId ? "Save changes" : "Create Proforma Invoice"}
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
                        const canEdit = inv.status === "draft" && (canSeeAll || inv.created_by_id === user?.id);
                        const exportBusy = busyExportId === inv.id;
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

                                        <div className="flex flex-wrap items-end justify-between gap-3 text-xs text-gray-600">
                                            <div className="space-y-0.5">
                                                <p>Subtotal: {kes(inv.subtotal_kes)}</p>
                                                {inv.discount_kes > 0 && <p>Discount ({Number(inv.discount_pct)}%): - {kes(inv.discount_kes)}</p>}
                                                <p>VAT (16%): {kes(inv.tax_kes)}</p>
                                                <p className="font-semibold text-gray-900">Total: {kes(inv.total_kes)}</p>
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {canEdit && (
                                                    <button onClick={() => startEdit(inv)} title="Edit draft"
                                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                                                        <Pencil size={14} />
                                                    </button>
                                                )}
                                                <button onClick={() => handleDownloadPdf(inv.id, inv.pi_number)} disabled={exportBusy}
                                                    title="Open / download PDF" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-40">
                                                    <Download size={14} />
                                                </button>
                                                <button onClick={() => handlePrint(inv.id)} disabled={exportBusy}
                                                    title="Print" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-40">
                                                    <Printer size={14} />
                                                </button>
                                                <button onClick={() => handleDownloadExcel(inv.id, inv.pi_number)} disabled={exportBusy}
                                                    title="Export to Excel" className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-40">
                                                    <FileSpreadsheet size={14} />
                                                </button>
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

            <AddPartModal
                open={addPartModalOpen}
                onClose={() => setAddPartModalOpen(false)}
                onAdd={handleAddPartFromModal}
            />
        </div>
    );
}

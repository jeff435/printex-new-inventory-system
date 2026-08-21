"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, Pencil, X, Check } from "lucide-react";

const inp = "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 placeholder:text-gray-400";

export default function AdminCategoriesPage() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [form, setForm] = useState({ name: "", slug: "", parent_id: "" });
    const [editName, setEditName] = useState("");

    const { data: categories, isLoading } = useQuery({
        queryKey: ["admin-categories"],
        queryFn: () => api.get("/categories").then((r) => r.data),
    });

    const createMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) => api.post("/categories", payload),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-categories"] }); toast.success("Category created"); setShowForm(false); setForm({ name: "", slug: "", parent_id: "" }); },
        onError: (err: any) => toast.error(err.response?.data?.detail || "Failed"),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.patch(`/categories/${id}`, payload),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-categories"] }); toast.success("Updated"); setEditingId(null); },
        onError: (err: any) => toast.error(err.response?.data?.detail || "Failed"),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/categories/${id}`),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-categories"] }); toast.success("Deleted"); setConfirmDelete(null); },
        onError: (err: any) => toast.error(err.response?.data?.detail || "Cannot delete — category may have products"),
    });

    const cats = categories || [];
    const topLevel = cats.filter((c: any) => !c.parent_id);

    return (
        <div className="space-y-4 max-w-2xl">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-gray-900">Categories</h1>
                <button onClick={() => setShowForm(!showForm)} className="glass-btn text-sm">
                    <Plus size={15} /> Add Category
                </button>
            </div>

            {showForm && (
                <div className="admin-card p-5 space-y-3">
                    <h2 className="font-semibold text-gray-800">New Category</h2>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Fresh Food" className={inp} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Slug (auto)</label>
                            <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="fresh-food" className={inp} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Parent Category</label>
                        <select value={form.parent_id} onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))} className={inp}>
                            <option value="">None (top-level)</option>
                            {topLevel.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={() => {
                                if (!form.name) { toast.error("Name required"); return; }
                                const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                                createMutation.mutate({ name: form.name, slug, parent_id: form.parent_id || null });
                            }}
                            disabled={createMutation.isPending}
                            className="glass-btn text-sm disabled:opacity-50"
                        >
                            {createMutation.isPending ? "Creating..." : "Create"}
                        </button>
                        <button onClick={() => setShowForm(false)} className="glass-btn-ghost text-sm">Cancel</button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 bg-gray-100 animate-pulse rounded-2xl" />)}</div>
            ) : cats.length === 0 ? (
                <div className="admin-card p-12 text-center text-gray-400 text-sm">No categories yet.</div>
            ) : (
                <div className="admin-card overflow-hidden">
                    <div className="divide-y divide-gray-100">
                        {cats.map((cat: any) => (
                            <div key={cat.id} className="flex items-center gap-3 p-4 hover:bg-blue-50/40 transition-colors">
                                {editingId === cat.id ? (
                                    <>
                                        <input
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            className="flex-1 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800"
                                        />
                                        <button onClick={() => updateMutation.mutate({ id: cat.id, payload: { name: editName } })} className="glass-icon-btn glass-icon-btn-accent w-8 h-8"><Check size={13} /></button>
                                        <button onClick={() => setEditingId(null)} className="glass-icon-btn w-8 h-8"><X size={13} /></button>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-gray-900">{cat.name}</p>
                                            <p className="text-xs text-gray-400">/{cat.slug}{cat.parent_id && <span className="ml-2 text-blue-500">sub-category</span>}</p>
                                        </div>
                                        <button onClick={() => { setEditingId(cat.id); setEditName(cat.name); }} className="glass-icon-btn w-8 h-8 text-blue-600"><Pencil size={13} /></button>
                                        {confirmDelete === cat.id ? (
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => deleteMutation.mutate(cat.id)} className="text-xs text-white bg-red-500 px-2 py-1 rounded-lg">Confirm</button>
                                                <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500 px-2 py-1">Cancel</button>
                                            </div>
                                        ) : (
                                            <button onClick={() => setConfirmDelete(cat.id)} className="glass-icon-btn w-8 h-8 text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

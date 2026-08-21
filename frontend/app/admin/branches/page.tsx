"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, X } from "lucide-react";

const inp = "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 placeholder:text-gray-400";

export default function AdminBranchesPage() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: "", slug: "", address: "", area: "", city: "Nairobi", phone: "", delivery_radius_km: "10" });

    const { data: branches, isLoading } = useQuery({
        queryKey: ["admin-branches"],
        queryFn: () => api.get("/branches").then((r) => r.data),
    });

    const createMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) => api.post("/branches", payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
            toast.success("Branch created");
            setShowForm(false);
            setForm({ name: "", slug: "", address: "", area: "", city: "Nairobi", phone: "", delivery_radius_km: "10" });
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || "Failed to create branch"),
    });

    const toggleActiveMutation = useMutation({
        mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => api.patch(`/branches/${id}`, { is_active }),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-branches"] }); toast.success("Branch updated"); },
        onError: (err: any) => toast.error(err.response?.data?.detail || "Failed"),
    });

    const handleCreate = () => {
        if (!form.name || !form.address || !form.area) { toast.error("Name, address and area are required"); return; }
        const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        createMutation.mutate({ name: form.name, slug, address: form.address, area: form.area, city: form.city, phone: form.phone || null, delivery_radius_km: parseFloat(form.delivery_radius_km), is_active: true });
    };

    const branchList = branches || [];

    return (
        <div className="space-y-4 max-w-2xl">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-gray-900">Branches</h1>
                <button onClick={() => setShowForm(!showForm)} className="glass-btn text-sm">
                    <Plus size={15} /> Add Branch
                </button>
            </div>

            {showForm && (
                <div className="admin-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold text-gray-800">New Branch</h2>
                        <button onClick={() => setShowForm(false)} className="glass-icon-btn w-7 h-7"><X size={13} /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Branch Name *</label>
                            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Printex Nairobi" className={inp} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Slug (auto)</label>
                            <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="printex-nairobi" className={inp} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Address *</label>
                        <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Westlands Mall, Waiyaki Way" className={inp} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Area *</label>
                            <input value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} placeholder="Westlands" className={inp} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                            <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Nairobi" className={inp} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+254712345678" className={inp} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Radius (km)</label>
                            <input type="number" value={form.delivery_radius_km} onChange={(e) => setForm((f) => ({ ...f, delivery_radius_km: e.target.value }))} placeholder="10" className={inp} />
                        </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button onClick={handleCreate} disabled={createMutation.isPending} className="glass-btn text-sm disabled:opacity-50">
                            {createMutation.isPending ? "Creating..." : "Create Branch"}
                        </button>
                        <button onClick={() => setShowForm(false)} className="glass-btn-ghost text-sm">Cancel</button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="space-y-3">{[1,2].map((i) => <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl" />)}</div>
            ) : branchList.length === 0 ? (
                <div className="admin-card p-12 text-center text-gray-400 text-sm">No branches yet.</div>
            ) : (
                <div className="space-y-3">
                    {branchList.map((branch: any) => (
                        <div key={branch.id} className="admin-card p-5">
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <p className="font-bold text-gray-900">{branch.name}</p>
                                    <p className="text-sm text-gray-500">{branch.address}</p>
                                    <p className="text-xs text-gray-400">{branch.area}, {branch.city}</p>
                                </div>
                                <button
                                    onClick={() => toggleActiveMutation.mutate({ id: branch.id, is_active: !branch.is_active })}
                                    className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${branch.is_active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                                >
                                    {branch.is_active ? "Active" : "Inactive"}
                                </button>
                            </div>
                            <div className="flex gap-4 text-xs text-gray-400 mt-2">
                                {branch.phone && <span>📞 {branch.phone}</span>}
                                <span>📍 {branch.delivery_radius_km}km radius</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

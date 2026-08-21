"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, X, UserCog } from "lucide-react";

const inp = "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 placeholder:text-gray-400";

export default function AdminDirectorsPage() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ full_name: "", phone: "", email: "", password: "" });

    const { data: directors, isLoading } = useQuery({
        queryKey: ["admin-directors"],
        queryFn: () => staffApi.listDirectors().then((r) => r.data),
    });

    const createMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) => staffApi.createDirector(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-directors"] });
            toast.success("Director added");
            setShowForm(false);
            setForm({ full_name: "", phone: "", email: "", password: "" });
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || "Failed to add director"),
    });

    const handleCreate = () => {
        if (!form.full_name || !form.password) { toast.error("Name and password are required"); return; }
        if (!form.phone && !form.email) { toast.error("Provide a phone or email so they can sign in"); return; }
        if (form.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
        createMutation.mutate({
            full_name: form.full_name,
            phone: form.phone || null,
            email: form.email || null,
            password: form.password,
        });
    };

    const directorList = directors || [];

    return (
        <div className="space-y-4 max-w-2xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Directors</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Directors you add here can sign in and add their own secretaries.</p>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="glass-btn text-sm whitespace-nowrap">
                    <Plus size={15} /> Add Director
                </button>
            </div>

            {showForm && (
                <div className="admin-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold text-gray-800">New Director</h2>
                        <button onClick={() => setShowForm(false)} className="glass-icon-btn w-7 h-7"><X size={13} /></button>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                        <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Jane Wanjiru" className={inp} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+254712345678" className={inp} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                            <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@printex.co.ke" className={inp} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Temporary Password *</label>
                        <input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="At least 8 characters" className={inp} />
                        <p className="text-xs text-gray-400 mt-1">Share this with them directly — they can change it after signing in.</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button onClick={handleCreate} disabled={createMutation.isPending} className="glass-btn text-sm disabled:opacity-50">
                            {createMutation.isPending ? "Adding..." : "Add Director"}
                        </button>
                        <button onClick={() => setShowForm(false)} className="glass-btn-ghost text-sm">Cancel</button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-2xl" />)}</div>
            ) : directorList.length === 0 ? (
                <div className="admin-card p-12 text-center text-gray-400 text-sm">No directors yet.</div>
            ) : (
                <div className="space-y-3">
                    {directorList.map((d: any) => (
                        <div key={d.id} className="admin-card p-4 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 flex-shrink-0">
                                <UserCog size={16} />
                            </div>
                            <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate">{d.full_name}</p>
                                <p className="text-xs text-gray-500 truncate">{d.phone || "—"} {d.email ? `· ${d.email}` : ""}</p>
                            </div>
                            <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full ${d.status === "active" || d.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                {d.status}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Search, Shield } from "lucide-react";
import { useAuthStore } from "@/stores";

type UserRole = "customer" | "branch_manager" | "inventory_manager" | "driver" | "super_admin" | "director" | "secretary";
const ROLE_COLORS: Record<UserRole, string> = {
    customer: "bg-gray-100 text-gray-600",
    driver: "bg-orange-100 text-orange-700",
    inventory_manager: "bg-purple-100 text-purple-700",
    branch_manager: "bg-blue-100 text-blue-700",
    super_admin: "bg-red-100 text-red-700",
    director: "bg-indigo-100 text-indigo-700",
    secretary: "bg-teal-100 text-teal-700",
};
const ROLE_OPTIONS: UserRole[] = ["super_admin", "director", "secretary"];

export default function AdminUsersPage() {
    const { user: currentUser } = useAuthStore();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [editingRole, setEditingRole] = useState<string | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ["admin-users", search],
        queryFn: () => api.get("/auth/users", { params: { limit: 100, search: search || undefined } }).then((r) => r.data),
    });

    const updateRoleMutation = useMutation({
        mutationFn: ({ id, role }: { id: string; role: string }) => api.patch(`/auth/users/${id}`, { role }),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Role updated"); setEditingRole(null); },
        onError: (err: any) => toast.error(err.response?.data?.detail || "Failed to update role"),
    });

    const users = data?.items ?? data ?? [];

    return (
        <div className="space-y-4">
            <div className="admin-toolbar relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or phone..."
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 placeholder:text-gray-400"
                />
            </div>

            {isLoading ? (
                <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-2xl" />)}</div>
            ) : users.length === 0 ? (
                <div className="admin-card p-12 text-center text-gray-400 text-sm">No users found.</div>
            ) : (
                <div className="admin-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/80">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {users.map((u: any) => (
                                    <tr key={u.id} className="hover:bg-blue-50/40 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                                                    {u.full_name?.[0] ?? "?"}
                                                </div>
                                                <p className="font-medium text-gray-900">{u.full_name}</p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">
                                            <p>{u.phone || "—"}</p>
                                            <p className="text-xs">{u.email || "—"}</p>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {editingRole === u.id ? (
                                                <select
                                                    defaultValue={u.role}
                                                    autoFocus
                                                    onChange={(e) => { if (e.target.value !== u.role) { updateRoleMutation.mutate({ id: u.id, role: e.target.value }); } else { setEditingRole(null); } }}
                                                    onBlur={() => setEditingRole(null)}
                                                    className="text-xs px-2 py-1 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800"
                                                >
                                                    {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                                                </select>
                                            ) : (
                                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${ROLE_COLORS[u.role as UserRole] || "bg-gray-100 text-gray-600"}`}>
                                                    {u.role?.replace(/_/g, " ")}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${u.status === "ACTIVE" || u.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                                {u.status?.toLowerCase()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end">
                                                {u.id !== currentUser?.id && (
                                                    <button onClick={() => setEditingRole(u.id)} className="glass-icon-btn w-8 h-8 text-blue-600" title="Change role">
                                                        <Shield size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
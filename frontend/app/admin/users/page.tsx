"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/lib/api";
import toast from "react-hot-toast";
import { Search, Shield, Pencil, KeyRound, Ban, CheckCircle2, Trash2, X, AlertTriangle } from "lucide-react";
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

const inp = "w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 placeholder:text-gray-400";

type StaffUser = {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    role: string;
    status: string;
};

type Dialog =
    | { kind: "edit"; user: StaffUser }
    | { kind: "password"; user: StaffUser }
    | { kind: "delete"; user: StaffUser }
    | null;

export default function AdminUsersPage() {
    const { user: currentUser } = useAuthStore();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [editingRole, setEditingRole] = useState<string | null>(null);
    const [dialog, setDialog] = useState<Dialog>(null);

    const isAdmin = currentUser?.role === "super_admin";

    const { data, isLoading } = useQuery({
        queryKey: ["admin-users", search],
        queryFn: () => usersApi.list({ limit: 100, search: search || undefined }).then((r) => r.data),
    });

    const users: StaffUser[] = data?.items ?? data ?? [];
    // The server decides who this viewer may act on and returns the list.
    // Falling back to "nothing is manageable" is the safe default if an older
    // backend doesn't send the field, rather than showing buttons that 403.
    const manageable: string[] = data?.manageable_ids ?? [];
    const canManage = (u: StaffUser) => manageable.includes(u.id);

    const done = (msg: string) => {
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        toast.success(msg);
        setDialog(null);
    };
    const fail = (fallback: string) => (err: any) =>
        toast.error(err.response?.data?.detail || err.response?.data?.message || fallback);

    const updateRole = useMutation({
        mutationFn: ({ id, role }: { id: string; role: string }) => usersApi.updateRole(id, role),
        onSuccess: () => { done("Role updated"); setEditingRole(null); },
        onError: fail("Failed to update role"),
    });

    const updateProfile = useMutation({
        mutationFn: ({ id, ...body }: { id: string; full_name: string; phone: string | null; email: string | null }) =>
            usersApi.updateProfile(id, body),
        onSuccess: () => done("Details updated"),
        onError: fail("Failed to update details"),
    });

    const updateStatus = useMutation({
        mutationFn: ({ id, status }: { id: string; status: "active" | "suspended" }) => usersApi.updateStatus(id, status),
        onSuccess: (_d, v) => done(v.status === "suspended" ? "Account suspended" : "Account reinstated"),
        onError: fail("Failed to change status"),
    });

    const resetPassword = useMutation({
        mutationFn: ({ id, password }: { id: string; password: string }) => usersApi.resetPassword(id, password),
        onSuccess: (r) => done(r.data?.message || "Password reset"),
        onError: fail("Failed to reset password"),
    });

    const deleteUser = useMutation({
        mutationFn: (id: string) => usersApi.remove(id),
        onSuccess: (r) => done(r.data?.message || "User deleted"),
        onError: fail("Failed to delete user"),
    });

    return (
        <div className="space-y-4">
            <div className="admin-toolbar relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, phone or email..."
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 placeholder:text-gray-400"
                />
            </div>

            {!isAdmin && (
                <p className="text-xs text-gray-500 px-1">
                    As a director you can edit, suspend, reset passwords for and delete secretary accounts.
                </p>
            )}

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
                                {users.map((u) => {
                                    const suspended = (u.status || "").toLowerCase() !== "active";
                                    const allowed = canManage(u);
                                    return (
                                        <tr key={u.id} className="hover:bg-blue-50/40 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                                                        {u.full_name?.[0] ?? "?"}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-gray-900">{u.full_name}</p>
                                                        {u.id === currentUser?.id && <p className="text-xs text-gray-400">That&apos;s you</p>}
                                                    </div>
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
                                                        onChange={(e) => { if (e.target.value !== u.role) { updateRole.mutate({ id: u.id, role: e.target.value }); } else { setEditingRole(null); } }}
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
                                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${!suspended ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                                                    {u.status?.toLowerCase()}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-1">
                                                    {allowed ? (
                                                        <>
                                                            <button onClick={() => setDialog({ kind: "edit", user: u })} className="glass-icon-btn w-8 h-8 text-gray-600" title="Edit details">
                                                                <Pencil size={13} />
                                                            </button>
                                                            {isAdmin && (
                                                                <button onClick={() => setEditingRole(u.id)} className="glass-icon-btn w-8 h-8 text-blue-600" title="Change role">
                                                                    <Shield size={13} />
                                                                </button>
                                                            )}
                                                            <button onClick={() => setDialog({ kind: "password", user: u })} className="glass-icon-btn w-8 h-8 text-indigo-600" title="Reset password">
                                                                <KeyRound size={13} />
                                                            </button>
                                                            <button
                                                                onClick={() => updateStatus.mutate({ id: u.id, status: suspended ? "active" : "suspended" })}
                                                                disabled={updateStatus.isPending}
                                                                className={`glass-icon-btn w-8 h-8 ${suspended ? "text-green-600" : "text-amber-600"}`}
                                                                title={suspended ? "Reinstate account" : "Suspend account"}
                                                            >
                                                                {suspended ? <CheckCircle2 size={13} /> : <Ban size={13} />}
                                                            </button>
                                                            <button onClick={() => setDialog({ kind: "delete", user: u })} className="glass-icon-btn w-8 h-8 text-red-600" title="Delete permanently">
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <span className="text-xs text-gray-300">—</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {dialog?.kind === "edit" && (
                <EditDialog
                    user={dialog.user}
                    pending={updateProfile.isPending}
                    onClose={() => setDialog(null)}
                    onSave={(v) => updateProfile.mutate({ id: dialog.user.id, ...v })}
                />
            )}
            {dialog?.kind === "password" && (
                <PasswordDialog
                    user={dialog.user}
                    pending={resetPassword.isPending}
                    onClose={() => setDialog(null)}
                    onSave={(password) => resetPassword.mutate({ id: dialog.user.id, password })}
                />
            )}
            {dialog?.kind === "delete" && (
                <DeleteDialog
                    user={dialog.user}
                    pending={deleteUser.isPending}
                    onClose={() => setDialog(null)}
                    onConfirm={() => deleteUser.mutate(dialog.user.id)}
                />
            )}
        </div>
    );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
            <div className="admin-card w-full max-w-sm p-5 space-y-3 bg-white">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-gray-800">{title}</h2>
                    <button onClick={onClose} className="glass-icon-btn w-7 h-7"><X size={13} /></button>
                </div>
                {children}
            </div>
        </div>
    );
}

function EditDialog({ user, pending, onClose, onSave }: {
    user: StaffUser; pending: boolean; onClose: () => void;
    onSave: (v: { full_name: string; phone: string | null; email: string | null }) => void;
}) {
    const [form, setForm] = useState({
        full_name: user.full_name ?? "",
        phone: user.phone ?? "",
        email: user.email ?? "",
    });

    const submit = () => {
        if (!form.full_name.trim()) { toast.error("Name is required"); return; }
        if (!form.phone.trim() && !form.email.trim()) {
            toast.error("Keep a phone or an email — it's how they sign in");
            return;
        }
        onSave({
            full_name: form.full_name.trim(),
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
        });
    };

    return (
        <Modal title={`Edit ${user.full_name}`} onClose={onClose}>
            <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className={inp} />
            </div>
            <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+254712345678 or 0712345678" className={inp} />
            </div>
            <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@printex.co.ke" className={inp} />
            </div>
            <p className="text-xs text-gray-400">They sign in with either the phone or the email, plus their password.</p>
            <div className="flex gap-2 pt-1">
                <button onClick={submit} disabled={pending} className="glass-btn text-sm disabled:opacity-50">
                    {pending ? "Saving..." : "Save changes"}
                </button>
                <button onClick={onClose} className="glass-btn-ghost text-sm">Cancel</button>
            </div>
        </Modal>
    );
}

function PasswordDialog({ user, pending, onClose, onSave }: {
    user: StaffUser; pending: boolean; onClose: () => void; onSave: (password: string) => void;
}) {
    const [password, setPassword] = useState("");

    return (
        <Modal title={`Reset password — ${user.full_name}`} onClose={onClose}>
            <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New Password *</label>
                {/* Deliberately type="text": whoever is doing the reset has to read
                    the password back to the person, so masking it helps nobody. */}
                <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoFocus
                    className={inp}
                />
            </div>
            <p className="text-xs text-gray-400">
                Share it with them directly — they can change it from Settings. This signs them
                out of any device they&apos;re currently using.
            </p>
            <div className="flex gap-2 pt-1">
                <button
                    onClick={() => { if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; } onSave(password); }}
                    disabled={pending}
                    className="glass-btn text-sm disabled:opacity-50"
                >
                    {pending ? "Resetting..." : "Reset password"}
                </button>
                <button onClick={onClose} className="glass-btn-ghost text-sm">Cancel</button>
            </div>
        </Modal>
    );
}

function DeleteDialog({ user, pending, onClose, onConfirm }: {
    user: StaffUser; pending: boolean; onClose: () => void; onConfirm: () => void;
}) {
    // Typing the name is deliberate friction. Deletion is irreversible and
    // reassigns their invoices, so it should not be one stray click away.
    const [confirmText, setConfirmText] = useState("");
    const matches = confirmText.trim().toLowerCase() === (user.full_name || "").trim().toLowerCase();

    return (
        <Modal title="Delete this account?" onClose={onClose}>
            <div className="flex gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                <AlertTriangle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-700 space-y-1">
                    <p><b>{user.full_name}</b> will be permanently removed. This cannot be undone.</p>
                    <p>Any proforma invoices, orders or purchases they raised are kept and reassigned to you, so the paperwork stays intact.</p>
                    <p>If you only want to stop them signing in, suspend the account instead — that is reversible.</p>
                </div>
            </div>
            <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                    Type <span className="font-semibold text-gray-800">{user.full_name}</span> to confirm
                </label>
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus className={inp} />
            </div>
            <div className="flex gap-2 pt-1">
                <button
                    onClick={onConfirm}
                    disabled={!matches || pending}
                    className="glass-btn text-sm bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {pending ? "Deleting..." : "Delete permanently"}
                </button>
                <button onClick={onClose} className="glass-btn-ghost text-sm">Cancel</button>
            </div>
        </Modal>
    );
}

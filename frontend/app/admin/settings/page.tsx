"use client";
import { useState } from "react";
import { useAuthStore } from "@/stores";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";

export default function AdminSettingsPage() {
    const { user, setUser } = useAuthStore();

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [saving, setSaving] = useState(false);

    const inputClass = "w-full px-3 py-2.5 bg-white border border-[#e6e8eb] rounded-xl text-sm text-[#14151a] focus:outline-none focus:ring-2 focus:ring-[#2f8f4e]/20 transition-all placeholder:text-[#9ca0a8]";
    const labelClass = "text-sm font-medium text-[#4b5058] block mb-1.5";

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            toast.error("Please fill in all password fields");
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error("New passwords don't match");
            return;
        }
        if (newPassword.length < 8) {
            toast.error("Password must be at least 8 characters");
            return;
        }
        setSaving(true);
        try {
            await api.post("/auth/me/change-password", {
                current_password: currentPassword,
                new_password: newPassword,
            });
            toast.success("Password changed successfully");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            // Tokens aren't kept in the store itself (setUser only ever
            // writes them to localStorage), so re-read them from there.
            const accessToken = localStorage.getItem("access_token");
            const refreshToken = localStorage.getItem("refresh_token");
            if (user && accessToken && refreshToken) setUser(user, accessToken, refreshToken);
        } catch (err: any) {
            toast.error((err.response?.data?.detail || err.response?.data?.message) || "Failed to change password");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-lg mx-auto space-y-6">
            <div>
                <h1 className="text-lg font-semibold text-[#14151a]">Account settings</h1>
                <p className="text-sm text-[#6b7078] mt-1">
                    Signed in as <span className="font-medium text-[#14151a]">{user?.full_name}</span>{" "}
                    <span className="capitalize">({user?.role?.replace(/_/g, " ")})</span>
                </p>
            </div>

            <div className="bg-white rounded-2xl border border-[#e6e8eb] p-6">
                <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck size={16} className="text-[#2f8f4e]" />
                    <h2 className="text-sm font-semibold text-[#14151a]">Change password</h2>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className={labelClass}>Current password</label>
                        <div className="relative">
                            <input
                                type={showCurrent ? "text" : "password"}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className={`${inputClass} pr-10`}
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrent((v) => !v)}
                                tabIndex={-1}
                                aria-label={showCurrent ? "Hide password" : "Show password"}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca0a8] hover:text-[#14151a]"
                            >
                                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>New password</label>
                        <div className="relative">
                            <input
                                type={showNew ? "text" : "password"}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className={`${inputClass} pr-10`}
                                placeholder="Min. 8 characters"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNew((v) => !v)}
                                tabIndex={-1}
                                aria-label={showNew ? "Hide password" : "Show password"}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca0a8] hover:text-[#14151a]"
                            >
                                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>Confirm new password</label>
                        <div className="relative">
                            <input
                                type={showConfirm ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className={`${inputClass} pr-10`}
                                placeholder="Repeat new password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirm((v) => !v)}
                                tabIndex={-1}
                                aria-label={showConfirm ? "Hide password" : "Show password"}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca0a8] hover:text-[#14151a]"
                            >
                                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleChangePassword}
                    disabled={saving}
                    className="glass-btn w-full mt-5 py-2.5 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    <Lock size={14} />
                    {saving ? "Updating..." : "Change password"}
                </button>
            </div>
        </div>
    );
}

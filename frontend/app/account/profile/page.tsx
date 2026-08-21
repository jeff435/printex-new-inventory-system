"use client";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { User, Phone, Mail, Lock, Save, Eye, EyeOff } from "lucide-react";

export default function ProfilePage() {
    const { user, isAuthenticated, _hasHydrated, setUser } = useAuthStore();
    const router = useRouter();

    const [fullName, setFullName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [savingContact, setSavingContact] = useState(false);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);

    useEffect(() => {
        if (_hasHydrated && !isAuthenticated) router.push("/login");
    }, [_hasHydrated, isAuthenticated, router]);

    useEffect(() => {
        if (user) {
            setFullName(user.full_name || "");
            setPhone(user.phone?.replace("+254", "0") || "");
            setEmail(user.email || "");
        }
    }, [user]);

    const handleSaveContact = async () => {
        if (!fullName.trim()) { toast.error("Name is required"); return; }
        setSavingContact(true);
        try {
            const { data } = await api.patch("/auth/me/contact", {
                full_name: fullName,
                phone: phone || undefined,
                email: email || undefined,
            });
            // Update store with new user data
            const tokens = useAuthStore.getState();
            setUser(data, tokens.accessToken!, tokens.refreshToken!);
            toast.success("Profile updated");
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Failed to update profile");
        } finally {
            setSavingContact(false);
        }
    };

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
        setSavingPassword(true);
        try {
            await api.post("/auth/me/change-password", {
                current_password: currentPassword,
                new_password: newPassword,
            });
            toast.success("Password changed successfully");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Failed to change password");
        } finally {
            setSavingPassword(false);
        }
    };

    if (!_hasHydrated || !user) return null;

    const inputClass = "w-full px-3 py-2.5 bg-white/10 border border-[#e6e8eb] rounded-xl text-sm text-[#14151a] focus:outline-none focus:ring-2 focus:ring-[#2f8f4e]/20 focus:bg-[#f0f1f3] transition-all placeholder:text-[#14151a]/35";
    const labelClass = "text-sm font-medium text-[#14151a]/85 block mb-1.5";

    return (
        <div className="max-w-xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold text-[#14151a] mb-6 drop-shadow">My Profile</h1>

            {/* Avatar + name summary */}
            <div className="glass-card rounded-2xl p-5 mb-5 flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-[#eaf6ee] border-2 border-[#cce8d4] flex items-center justify-center text-[#14151a] text-2xl font-bold flex-shrink-0">
                    {user.full_name?.charAt(0) || "?"}
                </div>
                <div>
                    <p className="text-lg font-bold text-[#14151a]">{user.full_name}</p>
                    <p className="text-sm text-[#9ca0a8]">{user.phone || user.email}</p>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#eaf6ee] text-[#2f8f4e] border border-[#cce8d4] capitalize mt-1 inline-block">
                        {user.role?.replace(/_/g, " ")}
                    </span>
                </div>
            </div>

            {/* Personal details */}
            <div className="glass-panel rounded-2xl p-5 mb-5">
                <h2 className="font-bold text-[#14151a] mb-4 flex items-center gap-2">
                    <User size={16} className="text-[#2f8f4e]" />
                    Personal Details
                </h2>
                <div className="space-y-3">
                    <div>
                        <label className={labelClass}>Full Name</label>
                        <input
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className={inputClass}
                            placeholder="Your full name"
                        />
                    </div>
                    <div>
                        <label className={labelClass}>
                            <Phone size={13} className="inline mr-1 opacity-60" />
                            Phone Number
                        </label>
                        <input
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className={inputClass}
                            placeholder="0712 345 678"
                        />
                    </div>
                    <div>
                        <label className={labelClass}>
                            <Mail size={13} className="inline mr-1 opacity-60" />
                            Email Address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={inputClass}
                            placeholder="you@example.com"
                        />
                    </div>
                </div>
                <button
                    onClick={handleSaveContact}
                    disabled={savingContact}
                    className="glass-btn w-full mt-4 py-2.5 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    <Save size={14} />
                    {savingContact ? "Saving..." : "Save Changes"}
                </button>
            </div>

            {/* Change password */}
            <div className="glass-panel rounded-2xl p-5">
                <h2 className="font-bold text-[#14151a] mb-4 flex items-center gap-2">
                    <Lock size={16} className="text-[#2f8f4e]" />
                    Change Password
                </h2>
                <div className="space-y-3">
                    <div>
                        <label className={labelClass}>Current Password</label>
                        <div className="relative">
                            <input
                                type={showCurrent ? "text" : "password"}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className={`${inputClass} pr-10`}
                                placeholder="Enter current password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrent(!showCurrent)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca0a8] hover:text-[#6b7078]"
                            >
                                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>New Password</label>
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
                                onClick={() => setShowNew(!showNew)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca0a8] hover:text-[#6b7078]"
                            >
                                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>Confirm New Password</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className={inputClass}
                            placeholder="Repeat new password"
                        />
                    </div>
                </div>
                <button
                    onClick={handleChangePassword}
                    disabled={savingPassword}
                    className="glass-btn w-full mt-4 py-2.5 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    <Lock size={14} />
                    {savingPassword ? "Updating..." : "Change Password"}
                </button>
            </div>
        </div>
    );
}
"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { ShieldCheck, CheckCircle2, Phone, Mail } from "lucide-react";

type Channel = "phone" | "email";

function VerifyAccountContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = searchParams.get("next") || "/";
    const { user, isAuthenticated, _hasHydrated, setUser } = useAuthStore();

    const [pending, setPending] = useState<Channel[] | null>(null);
    const [current, setCurrent] = useState<Channel | null>(null);
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);

    useEffect(() => {
        if (!_hasHydrated) return;
        if (!isAuthenticated) {
            router.push(next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login");
            return;
        }

        (async () => {
            try {
                const { data: freshUser } = await authApi.me();
                const need: Channel[] = [];
                if (freshUser.phone && !freshUser.is_phone_verified) need.push("phone");
                if (freshUser.email && !freshUser.is_email_verified) need.push("email");
                setPending(need);
                setCurrent(need[0] ?? null);
            } catch {
                setPending([]);
            }
        })();
    }, [_hasHydrated, isAuthenticated, router, next]);

    const destination = current === "phone" ? user?.phone : user?.email;

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!current) return;
        setLoading(true);
        try {
            await authApi.verifyOtp({
                ...(current === "phone" ? { phone: user?.phone } : { email: user?.email }),
                code,
                purpose: current === "phone" ? "verify_phone" : "verify_email",
            });

            if (user) {
                const updated = {
                    ...user,
                    is_phone_verified: current === "phone" ? true : user.is_phone_verified,
                    is_email_verified: current === "email" ? true : user.is_email_verified,
                };
                const accessToken = localStorage.getItem("access_token") || "";
                const refreshToken = localStorage.getItem("refresh_token") || "";
                setUser(updated, accessToken, refreshToken);
            }

            toast.success(`${current === "phone" ? "Phone" : "Email"} verified!`);
            setCode("");

            setPending((prev) => {
                const remaining = (prev || []).filter((c) => c !== current);
                setCurrent(remaining[0] ?? null);
                return remaining;
            });
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Incorrect or expired code");
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (!current) return;
        setResending(true);
        try {
            await authApi.resendOtp(current);
            toast.success("Code resent");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Could not resend code");
        } finally {
            setResending(false);
        }
    };

    const inp = "w-full px-4 py-2.5 rounded-xl bg-[#f0f1f3] border border-[#e6e8eb] text-[#14151a] placeholder-[#9ca0a8] focus:outline-none focus:ring-2 focus:ring-[#2f8f4e]/20 text-sm";

    if (!_hasHydrated || pending === null) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <div className="w-full max-w-sm glass-card p-8 animate-pulse h-72" />
            </div>
        );
    }

    if (pending.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <div className="w-full max-w-sm">
                    <div className="glass-card p-8 text-center">
                        <div className="w-12 h-12 bg-green-500/80 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 size={22} className="text-[#14151a]" />
                        </div>
                        <h1 className="text-2xl font-bold text-[#14151a]">You&apos;re all set</h1>
                        <p className="text-[#6b7078] text-sm mt-1 mb-6">Your account details are verified.</p>
                        <Link href={next} className="glass-btn w-full py-3 text-sm inline-block">
                            {next !== "/" ? "Continue" : "Start shopping"}
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <div className="glass-card p-8">
                    <div className="mb-8 text-center">
                        <div className="w-12 h-12 bg-[#eaf6ee] rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <ShieldCheck size={22} className="text-[#14151a]" />
                        </div>
                        <h1 className="text-2xl font-bold text-[#14151a]">
                            Verify your {current === "phone" ? "phone" : "email"}
                        </h1>
                        <p className="text-[#6b7078] text-sm mt-1 flex items-center justify-center gap-1.5">
                            {current === "phone" ? <Phone size={13} /> : <Mail size={13} />}
                            <span className="text-[#14151a] font-medium">{destination}</span>
                        </p>
                    </div>

                    <form onSubmit={handleVerify} className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-[#4b5058] block mb-1.5">6-digit code</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                                placeholder="123456"
                                required
                                className={`${inp} text-center text-lg tracking-[0.4em] font-mono`}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || code.length < 4}
                            className="glass-btn w-full py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Verifying..." : "Verify"}
                        </button>
                    </form>

                    <button
                        type="button"
                        onClick={handleResend}
                        disabled={resending}
                        className="w-full text-center text-xs text-[#9ca0a8] hover:text-[#14151a] mt-5 transition-colors disabled:opacity-50"
                    >
                        {resending ? "Sending..." : "Didn't get a code? Resend"}
                    </button>

                    {pending.length > 1 && (
                        <p className="text-center text-xs text-[#9ca0a8] mt-3">
                            Next, we&apos;ll verify your {pending.find((c) => c !== current)}.
                        </p>
                    )}

                    <p className="text-center text-sm mt-6">
                        <Link href={next} className="text-[#9ca0a8] hover:text-[#14151a] text-xs">Skip for now</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function VerifyAccountPage() {
    return (
        <Suspense>
            <VerifyAccountContent />
        </Suspense>
    );
}
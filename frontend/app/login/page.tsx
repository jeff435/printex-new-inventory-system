"use client";
import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { Package, ArrowLeft, UserCog, Contact, LayoutDashboard, Eye, EyeOff } from "lucide-react";
import { markLoginForCookieReminder } from "@/lib/cookieConsent";


function LoginContent() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  // Printex is a staff-only inventory system — every sign-in starts with
  // picking which of the three roles you are, then entering credentials.
  // There's no OTP step here: the backend signs staff straight in.
  const [step, setStep] = useState<"staff-picker" | "credentials">("staff-picker");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [staffRole, setStaffRole] = useState<"super_admin" | "director" | "secretary" | null>(null);

  const STAFF_ROLES: { role: "super_admin" | "director" | "secretary"; label: string; desc: string; icon: React.ElementType }[] = [
    { role: "super_admin", label: "Administrator", desc: "Full system overview and controls", icon: LayoutDashboard },
    { role: "director", label: "Director", desc: "Oversees analytics across the business", icon: UserCog },
    { role: "secretary", label: "Secretary", desc: "Raises proforma invoices and daily records", icon: Contact },
  ];
  const staffRoleLabel = STAFF_ROLES.find((r) => r.role === staffRole)?.label;

  const handleLogin = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.login({ identifier, password });
      const role = data.user.role;

      if (staffRole && role !== staffRole) {
        toast.error(`This account isn't registered as ${staffRoleLabel}. Try a different sign-in box.`);
        setStep("staff-picker");
        setPassword("");
        return;
      }

      setUser(data.user, data.access_token, data.refresh_token);
      toast.success(`Welcome back, ${data.user.full_name.split(" ")[0]}!`);
      markLoginForCookieReminder();
      router.push("/admin");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const inp = "w-full px-4 py-2.5 rounded-xl bg-[#f0f1f3] border border-[#e6e8eb] text-[#14151a] placeholder-[#9ca0a8] focus:outline-none focus:ring-2 focus:ring-[#2f8f4e]/20 text-sm";

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="glass-card p-8">
          {step === "staff-picker" && (
            <>
              <div className="mb-6 text-center">
                <div className="w-12 h-12 bg-[#eaf6ee] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Package size={22} className="text-[#14151a]" />
                </div>
                <h1 className="text-2xl font-bold text-[#14151a]">Printex Staff Sign In</h1>
                <p className="text-[#6b7078] text-sm mt-1">Choose your role to continue</p>
              </div>

              <div className="space-y-3">
                {STAFF_ROLES.map(({ role, label, desc, icon: Icon }) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => { setStaffRole(role); setStep("credentials"); }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-[#f0f1f3] hover:bg-[#e6e8eb] border border-[#e6e8eb] text-left transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#eaf6ee] flex items-center justify-center flex-shrink-0">
                      <Icon size={17} className="text-[#14151a]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#14151a]">Log in as {label}</p>
                      <p className="text-xs text-[#6b7078] truncate">{desc}</p>
                    </div>
                  </button>
                ))}

                <div className="pt-3 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setUser(
                        {
                          id: "director-demo-1",
                          full_name: "Executive Director",
                          phone: "+254700000000",
                          email: "director@printex.co.ke",
                          role: "director",
                          is_phone_verified: true,
                          is_email_verified: true,
                        },
                        "demo-director-access-token",
                        "demo-director-refresh-token"
                      );
                      toast.success("Welcome back, Executive Director!");
                      router.push("/admin/directors/analytics");
                    }}
                    className="w-full flex items-center justify-center gap-2 p-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all transform hover:scale-[1.02]"
                  >
                    🚀 Instant Director Demo Login
                  </button>
                </div>
              </div>
            </>
          )}

          {step === "credentials" && (
            <>
              <button
                type="button"
                onClick={() => { setStep("staff-picker"); setPassword(""); }}
                className="flex items-center gap-1.5 text-xs text-[#6b7078] hover:text-[#14151a] mb-6 transition-colors"
              >
                <ArrowLeft size={14} /> Back
              </button>

              <div className="mb-8 text-center">
                <div className="w-12 h-12 bg-[#eaf6ee] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Package size={22} className="text-[#14151a]" />
                </div>
                <h1 className="text-2xl font-bold text-[#14151a]">Sign in as {staffRoleLabel}</h1>
                <p className="text-[#6b7078] text-sm mt-1">Enter your staff credentials</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-[#4b5058] block mb-1.5">Phone or Email</label>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="+254712345678 or email"
                    required
                    autoFocus
                    className={inp}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#4b5058] block mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className={`${inp} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca0a8] hover:text-[#14151a] transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <span
                    className="text-xs text-[#6b7078]"
                    title="Contact the administrator to reset a staff password"
                  >
                    Forgot password? Ask the administrator.
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="glass-btn w-full py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
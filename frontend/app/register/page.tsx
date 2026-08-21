"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { ShoppingBag } from "lucide-react";
import GoogleSignInButton from "@/components/GoogleSignInButton";

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const setUser = useAuthStore((s) => s.setUser);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", password: "" });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const loginHref = next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";
  const verifyHref = next !== "/" ? `/verify-account?next=${encodeURIComponent(next)}` : "/verify-account";

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone && !form.email) { toast.error("Enter a phone number or email"); return; }
    if (!acceptedTerms) { toast.error("Please accept the Terms & Conditions to continue"); return; }
    setLoading(true);
    try {
      const payload = {
        full_name: form.full_name,
        password: form.password,
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.email ? { email: form.email } : {}),
      };
      const { data } = await authApi.register(payload);
      setUser(data.user, data.access_token, data.refresh_token);
      toast.success("Account created! Let's verify your details.");
      router.push(verifyHref);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const inp = "w-full px-4 py-2.5 rounded-xl bg-white border border-[#e6e8eb] text-[#14151a] placeholder-[#9ca0a8] focus:outline-none focus:ring-2 focus:ring-[#8FA878] text-sm";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="glass-card p-8">
          <div className="mb-8 text-center">
            <div className="w-12 h-12 bg-[#eaf6ee] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShoppingBag size={22} className="text-[#14151a]" />
            </div>
            <h1 className="text-2xl font-bold text-[#14151a]">Create account</h1>
            <p className="text-[#6b7078] text-sm mt-1">Create your Printex account today</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#4b5058] block mb-1.5">Full Name</label>
              <input type="text" value={form.full_name} onChange={set("full_name")} placeholder="Jane Wanjiku" required className={inp} />
            </div>
            <div>
              <label className="text-sm font-medium text-[#4b5058] block mb-1.5">Phone Number</label>
              <input type="tel" value={form.phone} onChange={set("phone")} placeholder="0712 345 678" className={inp} />
            </div>
            <div>
              <label className="text-sm font-medium text-[#4b5058] block mb-1.5">
                Email <span className="text-[#9ca0a8] font-normal">(optional)</span>
              </label>
              <input type="email" value={form.email} onChange={set("email")} placeholder="jane@example.com" className={inp} />
            </div>
            <div>
              <label className="text-sm font-medium text-[#4b5058] block mb-1.5">Password</label>
              <input type="password" value={form.password} onChange={set("password")} placeholder="Min. 8 characters" required minLength={8} className={inp} />
            </div>

            <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required
                className="mt-0.5 w-4 h-4 rounded border-[#e6e8eb] bg-white accent-[#C9963E] shrink-0"
              />
              <span className="text-xs text-[#6b7078] leading-relaxed">
                I agree to Printex's{" "}
                <Link href="/terms" target="_blank" className="text-[#2f8f4e] font-medium hover:underline">
                  Terms &amp; Conditions
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="text-[#2f8f4e] font-medium hover:underline">
                  Privacy Policy
                </Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !acceptedTerms}
              className="glass-btn w-full py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/20" />
            <span className="text-xs text-[#9ca0a8] uppercase tracking-wide">or</span>
            <div className="flex-1 h-px bg-white/20" />
          </div>

          <GoogleSignInButton mode="signup" next={next} termsAccepted={acceptedTerms} />

          <p className="text-center text-sm text-[#9ca0a8] mt-6">
            Already have an account?{" "}
            <Link href={loginHref} className="text-[#14151a] font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterContent />
    </Suspense>
  );
}
"use client";
import Script from "next/script";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { markLoginForCookieReminder } from "@/lib/cookieConsent";

declare global {
    interface Window {
        google?: any;
    }
}

export default function GoogleSignInButton({
    mode = "signin",
    next,
    termsAccepted = true,
}: {
    mode?: "signin" | "signup";
    next?: string;
    /** Only relevant when mode === "signup" — gates the button until T&C is checked. */
    termsAccepted?: boolean;
}) {
    const buttonRef = useRef<HTMLDivElement>(null);
    const setUser = useAuthStore((s) => s.setUser);
    const router = useRouter();
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const blocked = mode === "signup" && !termsAccepted;

    useEffect(() => {
        if (!clientId) return;
        let cancelled = false;

        const render = () => {
            if (cancelled || !window.google || !buttonRef.current) return;
            window.google.accounts.id.initialize({
                client_id: clientId,
                callback: async (response: { credential: string }) => {
                    // Defensive check — the overlay below blocks clicks, but One Tap
                    // or a stale render could still fire this without a fresh click.
                    if (mode === "signup" && !termsAccepted) {
                        toast.error("Please accept the Terms & Conditions to continue");
                        return;
                    }
                    try {
                        const { data } = await authApi.google(response.credential);
                        setUser(data.user, data.access_token, data.refresh_token);
                        toast.success(`Welcome, ${data.user.full_name.split(" ")[0]}!`);
                        if (mode === "signin") markLoginForCookieReminder();
                        const role = data.user.role;
                        const ADMIN_ROLES = ["super_admin", "branch_manager", "inventory_manager"];
                        if (role === "driver") router.push("/driver");
                        else if (ADMIN_ROLES.includes(role)) router.push("/admin");
                        else router.push(next || "/");
                    } catch (err: any) {
                        toast.error(err.response?.data?.message || "Google sign-in failed");
                    }
                },
            });
            window.google.accounts.id.renderButton(buttonRef.current, {
                theme: "filled_black",
                size: "large",
                width: 320,
                text: mode === "signup" ? "signup_with" : "signin_with",
            });
        };

        if (window.google) render();

        // The GIS script may still be loading — poll briefly until it's ready.
        const interval = setInterval(() => {
            if (window.google) {
                render();
                clearInterval(interval);
            }
        }, 200);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [clientId, mode, next, setUser, router, termsAccepted]);

    // Not configured on this deployment — render nothing rather than a broken button.
    if (!clientId) return null;

    return (
        <>
            <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
            <div className="relative">
                <div ref={buttonRef} className={`flex justify-center ${blocked ? "opacity-50 pointer-events-none" : ""}`} />
                {blocked && (
                    <p className="text-center text-[11px] text-[#9ca0a8] mt-1.5">
                        Accept the Terms &amp; Conditions above to continue with Google
                    </p>
                )}
            </div>
        </>
    );
}
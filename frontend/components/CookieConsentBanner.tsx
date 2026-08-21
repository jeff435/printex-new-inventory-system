"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getConsent, hasDecided, setConsent, consumeLoginCookieReminder } from "@/lib/cookieConsent";

export default function CookieConsentBanner() {
    const pathname = usePathname();
    const [visible, setVisible] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [analytics, setAnalytics] = useState(false);
    const [marketing, setMarketing] = useState(false);

    useEffect(() => {
        // Only decide client-side, after mount, to avoid SSR/hydration mismatch
        const loginReminder = consumeLoginCookieReminder();
        if (loginReminder || !hasDecided()) {
            // Pre-fill the toggles from any existing saved choice, so re-opening
            // "Manage preferences" reflects what they already chose rather than
            // resetting to off.
            const existing = getConsent();
            if (existing) {
                setAnalytics(existing.analytics);
                setMarketing(existing.marketing);
            }
            setVisible(true);
        }
    }, [pathname]);
    const acceptAll = () => {
        setConsent({ analytics: true, marketing: true });
        setVisible(false);
    };

    const rejectAll = () => {
        setConsent({ analytics: false, marketing: false });
        setVisible(false);
    };

    const savePreferences = () => {
        setConsent({ analytics, marketing });
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div className="fixed bottom-0 inset-x-0 z-[100] px-4 pb-4">
            <div className="max-w-4xl mx-auto v2-card rounded-2xl shadow-[0_16px_44px_rgba(20,21,26,0.14)] p-5 md:p-6">
                {!showDetails ? (
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                        <div className="flex-1">
                            <p className="text-[var(--v2-text)] font-semibold text-sm mb-1">We use cookies 🍪</p>
                            <p className="text-[var(--v2-text-muted)] text-xs leading-relaxed">
                                Printex uses functional cookies to keep you signed in and remember your preferences.
                                With your consent, we'd also like to use analytics and marketing cookies to improve
                                the Service and show relevant offers. Read our{" "}
                                <Link href="/privacy" target="_blank" className="text-[var(--v2-accent)] font-semibold hover:underline">
                                    Privacy Policy
                                </Link>{" "}
                                for details.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0">
                            <button
                                onClick={() => setShowDetails(true)}
                                className="glass-btn-ghost text-xs"
                            >
                                Manage preferences
                            </button>
                            <button
                                onClick={rejectAll}
                                className="glass-btn-ghost text-xs"
                            >
                                Reject all
                            </button>
                            <button onClick={acceptAll} className="glass-btn text-xs px-4 py-2">
                                Accept all
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <p className="text-[var(--v2-text)] font-semibold text-sm mb-4">Cookie preferences</p>

                        <div className="space-y-3 mb-5">
                            {/* Functional — always on */}
                            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--v2-surface-muted)] border border-[var(--v2-border)]">
                                <div>
                                    <p className="text-sm font-medium text-[var(--v2-text)]">Functional</p>
                                    <p className="text-xs text-[var(--v2-text-muted)]">
                                        Required for sign-in, cart, branch selection, and checkout to work. Always active.
                                    </p>
                                </div>
                                <span className="text-xs font-semibold text-[var(--v2-accent-dark)] px-2.5 py-1 rounded-full bg-[var(--v2-accent-bg)] shrink-0 ml-3">
                                    Always on
                                </span>
                            </div>

                            {/* Analytics */}
                            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--v2-surface-muted)] border border-[var(--v2-border)]">
                                <div className="pr-3">
                                    <p className="text-sm font-medium text-[var(--v2-text)]">Analytics</p>
                                    <p className="text-xs text-[var(--v2-text-muted)]">
                                        Helps us understand how the Service is used so we can improve it (e.g. Google Analytics).
                                    </p>
                                </div>
                                <button
                                    onClick={() => setAnalytics((v) => !v)}
                                    className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${analytics ? "bg-[var(--v2-accent)]" : "bg-[#c9ced6]"}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${analytics ? "translate-x-5" : ""}`} />
                                </button>
                            </div>

                            {/* Marketing */}
                            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--v2-surface-muted)] border border-[var(--v2-border)]">
                                <div className="pr-3">
                                    <p className="text-sm font-medium text-[var(--v2-text)]">Marketing</p>
                                    <p className="text-xs text-[var(--v2-text-muted)]">
                                        Used to show relevant offers and measure campaign performance (e.g. Meta Pixel).
                                    </p>
                                </div>
                                <button
                                    onClick={() => setMarketing((v) => !v)}
                                    className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${marketing ? "bg-[var(--v2-accent)]" : "bg-[#c9ced6]"}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${marketing ? "translate-x-5" : ""}`} />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2">
                            <button
                                onClick={() => setShowDetails(false)}
                                className="glass-btn-ghost text-xs"
                            >
                                Back
                            </button>
                            <button onClick={rejectAll} className="glass-btn-ghost text-xs">
                                Reject all
                            </button>
                            <button onClick={savePreferences} className="glass-btn text-xs px-4 py-2">
                                Save preferences
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
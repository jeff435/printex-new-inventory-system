export type CookieCategory = "functional" | "analytics" | "marketing";

export interface CookieConsent {
    functional: true; // always on — required for the app to work (auth, cart, branch prefs)
    analytics: boolean;
    marketing: boolean;
    decidedAt: string; // ISO timestamp
}

const STORAGE_KEY = "printex_cookie_consent";
const CONSENT_EVENT = "printex-cookie-consent-changed";

export const DEFAULT_CONSENT: CookieConsent = {
    functional: true,
    analytics: false,
    marketing: false,
    decidedAt: "",
};

export function getConsent(): CookieConsent | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        return { ...DEFAULT_CONSENT, ...parsed, functional: true };
    } catch {
        return null;
    }
}

export function setConsent(consent: Omit<CookieConsent, "functional" | "decidedAt">) {
    if (typeof window === "undefined") return;
    const full: CookieConsent = {
        functional: true,
        analytics: consent.analytics,
        marketing: consent.marketing,
        decidedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: full }));
}

export function hasDecided(): boolean {
    return getConsent() !== null;
}

export function onConsentChange(cb: (consent: CookieConsent) => void) {
    if (typeof window === "undefined") return () => { };
    const handler = (e: Event) => cb((e as CustomEvent<CookieConsent>).detail);
    window.addEventListener(CONSENT_EVENT, handler);
    return () => window.removeEventListener(CONSENT_EVENT, handler);
}

// --- Login reminder ---------------------------------------------------
// Re-surfaces the cookie banner as a reminder every time a user logs in and
// lands on the homepage, WITHOUT touching their previously saved consent
// choices. Session-scoped (sessionStorage) so it fires once per login, not
// on every subsequent page navigation within that session.

const LOGIN_REMINDER_KEY = "printex_show_cookie_reminder";

export function markLoginForCookieReminder() {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(LOGIN_REMINDER_KEY, "1");
    } catch {
        // sessionStorage unavailable (e.g. private browsing) — fail silently,
        // banner will still show normally for undecided consent.
    }
}

export function consumeLoginCookieReminder(): boolean {
    if (typeof window === "undefined") return false;
    try {
        const flagged = sessionStorage.getItem(LOGIN_REMINDER_KEY) === "1";
        if (flagged) sessionStorage.removeItem(LOGIN_REMINDER_KEY);
        return flagged;
    } catch {
        return false;
    }
}
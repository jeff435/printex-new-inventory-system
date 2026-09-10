import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

// Cap what we keep in localStorage. Without this the transcript grows without
// bound across sessions, and once it passes the ~5MB quota every subsequent
// setItem throws — which in zustand's persist middleware surfaces as a failed
// rehydrate on the next page load (see onRehydrateStorage below).
const MAX_PERSISTED_MESSAGES = 50;

interface ChatState {
    isOpen: boolean;
    messages: ChatMessage[];
    sessionId: string | null;
    isLoading: boolean;
    hasNewMessage: boolean; // drives the notification dot when the panel is closed
    _hasHydrated: boolean;

    toggleOpen: () => void;
    addMessage: (message: ChatMessage) => void;
    setSessionId: (id: string) => void;
    setLoading: (loading: boolean) => void;
    clearChat: () => void;
    setHasHydrated: (val: boolean) => void;
}

export const useChatStore = create<ChatState>()(
    persist(
        (set) => ({
            isOpen: false,
            messages: [],
            sessionId: null,
            isLoading: false,
            hasNewMessage: false,
            _hasHydrated: false,

            toggleOpen: () =>
                set((state) => ({
                    isOpen: !state.isOpen,
                    hasNewMessage: state.isOpen ? state.hasNewMessage : false,
                })),

            addMessage: (message) =>
                set((state) => ({
                    messages: [...state.messages, message],
                    hasNewMessage: message.role === "assistant" && !state.isOpen ? true : state.hasNewMessage,
                })),

            setSessionId: (id) => set({ sessionId: id }),
            setLoading: (loading) => set({ isLoading: loading }),
            clearChat: () => set({ messages: [], sessionId: null, hasNewMessage: false }),
            setHasHydrated: (val) => set({ _hasHydrated: val }),
        }),
        {
            name: "printex-chat",
            partialize: (state) => ({
                // Only the tail is persisted — see MAX_PERSISTED_MESSAGES.
                messages: state.messages.slice(-MAX_PERSISTED_MESSAGES),
                sessionId: state.sessionId,
            }),
            // ChatWidget renders nothing until _hasHydrated flips true, so this
            // callback MUST set it in every outcome. The previous version
            // (`state?.setHasHydrated(true)`) only ran on the success path: if
            // the stored JSON was corrupt or the storage quota had been blown,
            // zustand invokes this with state === undefined plus an error, the
            // optional chaining silently no-ops, _hasHydrated stays false
            // forever and the chat button never appears at all — with nothing
            // in the console to explain it. Setting state on the store
            // directly covers both paths.
            onRehydrateStorage: () => (state, error) => {
                if (error) {
                    console.warn("Chat history couldn't be restored; starting a fresh session.", error);
                    try {
                        window.localStorage.removeItem("printex-chat");
                    } catch {
                        // private mode / storage disabled — nothing to clean up
                    }
                }
                // Not `state?.setHasHydrated(...)` — on the error path there is no state.
                useChatStore.setState({ _hasHydrated: true });
            },
        }
    )
);

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

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
                messages: state.messages,
                sessionId: state.sessionId,
            }),
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true);
            },
        }
    )
);
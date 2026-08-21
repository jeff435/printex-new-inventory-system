"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore, type ChatMessage } from "@/stores/chatStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// Swap these for your actual design tokens if they differ from your Tailwind config.
// The widget previously carried its own private sage/olive/cream palette,
// unrelated to the storefront tokens — it rendered as a dark green launcher on
// a light grey page. These map onto the v2 system instead. Keys are unchanged
// so every `COLORS.x` reference in this file keeps working.
const COLORS = {
    sage: "#2A2C33",
    sageDark: "#14151A",
    olive: "#0C5A16",
    cream: "#FFFFFF",
    creamDark: "#E6E8EB",
    gold: "#EAF6EE",
    ink: "#14151A",
};

export default function ChatWidget() {
    const {
        isOpen,
        messages,
        sessionId,
        isLoading,
        hasNewMessage,
        _hasHydrated,
        toggleOpen,
        addMessage,
        setSessionId,
        setLoading,
    } = useChatStore();

    const [input, setInput] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, isLoading]);

    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    // Avoid rendering persisted state before hydration to prevent SSR mismatch
    if (!_hasHydrated) return null;

    async function sendMessage() {
        const trimmed = input.trim();
        if (!trimmed || isLoading) return;

        const userMessage: ChatMessage = { role: "user", content: trimmed };
        addMessage(userMessage);
        setInput("");
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: trimmed, session_id: sessionId }),
            });

            if (!res.ok) {
                throw new Error(`Chat request failed: ${res.status}`);
            }

            const data: { reply: string; session_id: string } = await res.json();
            setSessionId(data.session_id);
            addMessage({ role: "assistant", content: data.reply });
        } catch {
            addMessage({
                role: "assistant",
                content: "Sorry, I couldn't connect just now — please try again in a moment.",
            });
        } finally {
            setLoading(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    return (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
            {isOpen && (
                <div
                    className="flex h-[560px] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border shadow-2xl"
                    style={{ backgroundColor: COLORS.cream, borderColor: COLORS.creamDark }}
                >
                    {/* Header */}
                    <div
                        className="flex items-center justify-between px-4 py-3.5"
                        style={{ backgroundColor: COLORS.sageDark }}
                    >
                        <div className="flex items-center gap-2.5">
                            <div
                                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold"
                                style={{ backgroundColor: COLORS.gold, color: COLORS.ink }}
                            >
                                S
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-white">Printex Assistant</p>
                                <p className="text-[11px] text-white/70">Usually replies instantly</p>
                            </div>
                        </div>
                        <button
                            onClick={toggleOpen}
                            aria-label="Close chat"
                            className="rounded-full p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                            </svg>
                        </button>
                    </div>

                    {/* Messages */}
                    <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                        {messages.length === 0 && (
                            <div
                                className="rounded-xl border px-3.5 py-3 text-sm leading-relaxed"
                                style={{ borderColor: COLORS.creamDark, color: COLORS.ink }}
                            >
                                Habari! 👋 Ask me about products, prices, or your order status.
                            </div>
                        )}

                        {messages.map((m, i) => (
                            <MessageBubble key={i} message={m} />
                        ))}

                        {isLoading && <TypingIndicator />}
                    </div>

                    {/* Input */}
                    <div className="border-t px-3 py-3" style={{ borderColor: COLORS.creamDark }}>
                        <div className="flex items-end gap-2">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type a message..."
                                rows={1}
                                className="max-h-24 flex-1 resize-none rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2"
                                style={{ borderColor: COLORS.creamDark, color: COLORS.ink }}
                            />
                            <button
                                onClick={sendMessage}
                                disabled={!input.trim() || isLoading}
                                aria-label="Send message"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40"
                                style={{ backgroundColor: COLORS.sage }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating button */}
            <button
                onClick={toggleOpen}
                aria-label={isOpen ? "Close chat" : "Open chat"}
                className="relative flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition hover:scale-105"
                style={{ backgroundColor: COLORS.sageDark }}
            >
                {hasNewMessage && !isOpen && (
                    <span
                        className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white"
                        style={{ backgroundColor: COLORS.gold }}
                    />
                )}
                {isOpen ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                    </svg>
                ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
                        <path
                            d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.2 0-2.3-.25-3.3-.7L4 21l1.35-4.05A8.46 8.46 0 0 1 3.5 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5Z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                )}
            </button>
        </div>
    );
}

function MessageBubble({ message }: { message: ChatMessage }) {
    const isUser = message.role === "user";
    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div
                className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
                style={
                    isUser
                        ? { backgroundColor: COLORS.sage, color: "white", borderBottomRightRadius: 4 }
                        : { backgroundColor: "white", color: COLORS.ink, border: `1px solid ${COLORS.creamDark}`, borderBottomLeftRadius: 4 }
                }
            >
                {message.content}
            </div>
        </div>
    );
}

function TypingIndicator() {
    return (
        <div className="flex justify-start">
            <div
                className="flex items-center gap-1 rounded-2xl px-4 py-3"
                style={{ backgroundColor: "white", border: `1px solid ${COLORS.creamDark}`, borderBottomLeftRadius: 4 }}
            >
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        className="h-1.5 w-1.5 animate-bounce rounded-full"
                        style={{ backgroundColor: COLORS.sage, animationDelay: `${i * 0.15}s` }}
                    />
                ))}
            </div>
        </div>
    );
}
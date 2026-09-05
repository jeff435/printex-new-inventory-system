"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Bot, X, Send, Paperclip, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

type Msg = { role: "user" | "assistant"; content: string };
type Provider = "groq" | "xai";

// The second, privileged "AI" described in the system: unlike the public
// ChatWidget (unauthenticated, 3 read-only tools), this one only ever
// mounts inside AdminShellClient — which already gates its own render on
// ADMIN_ROLES (super_admin/director/secretary) — and talks to POST
// /admin-ai/*, which independently re-checks the same three roles
// server-side via require_staff. Two separate checks, not one shared gate,
// so a bug in either layer alone can't expose this to the wrong person.
export default function AdminAIWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState("");
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [provider, setProvider] = useState<Provider>("groq");
    const [providers, setProviders] = useState<{ groq: { available: boolean }; xai: { available: boolean } } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && !providers) {
            api.get("/admin-ai/providers").then((r) => setProviders(r.data)).catch(() => {});
        }
    }, [isOpen, providers]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, isLoading]);

    const send = async () => {
        const trimmed = input.trim();
        if (!trimmed || isLoading) return;
        setMessages((m) => [...m, { role: "user", content: trimmed }]);
        setInput("");
        setIsLoading(true);
        try {
            const res = await api.post("/admin-ai", { message: trimmed, session_id: sessionId, provider });
            setSessionId(res.data.session_id);
            setMessages((m) => [...m, { role: "assistant", content: res.data.reply }]);
        } catch (err: any) {
            const detail = err.response?.data?.detail || "Something went wrong reaching the assistant.";
            setMessages((m) => [...m, { role: "assistant", content: detail }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (file: File) => {
        setUploading(true);
        setMessages((m) => [...m, { role: "user", content: `📄 Uploaded: ${file.name}` }]);
        try {
            const form = new FormData();
            form.append("file", file);
            form.append("provider", provider);
            form.append("auto_create", "false"); // preview first — matches the "review before saving" default
            const res = await api.post("/admin-ai/extract-invoice", form, { headers: { "Content-Type": "multipart/form-data" } });
            const parts = res.data.preview || [];
            if (parts.length === 0) {
                setMessages((m) => [...m, { role: "assistant", content: "I couldn't find any part lines in that invoice." }]);
            } else {
                const list = parts.map((p: any, i: number) => `${i + 1}. ${p.name}${p.part_number ? ` (${p.part_number})` : ""} — KSh ${p.price_kes} × ${p.quantity || 1}`).join("\n");
                setMessages((m) => [...m, { role: "assistant", content: `Found ${parts.length} part(s) in that invoice:\n\n${list}\n\nSay "add all of these" if you'd like me to create them in the catalogue, or tell me which ones to skip.` }]);
            }
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Couldn't read that invoice");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed bottom-5 left-5 z-50 flex flex-col items-start gap-3">
            {isOpen && (
                <div className="flex h-[560px] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-900 text-white">
                        <div className="flex items-center gap-2">
                            <Bot size={16} />
                            <span className="text-sm font-semibold">Printex Assistant</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <select
                                value={provider}
                                onChange={(e) => setProvider(e.target.value as Provider)}
                                className="text-xs bg-gray-800 text-white border border-gray-700 rounded-lg px-1.5 py-0.5"
                            >
                                <option value="groq">Groq {providers && !providers.groq.available ? "(not set up)" : ""}</option>
                                <option value="xai">xAI Grok {providers && !providers.xai.available ? "(not set up)" : ""}</option>
                            </select>
                            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/10 rounded-lg"><X size={16} /></button>
                        </div>
                    </div>

                    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                        {messages.length === 0 && (
                            <p className="text-xs text-gray-400">
                                Ask about stats, invoices, payments, or products — or upload a supplier invoice (PDF) to add parts automatically.
                            </p>
                        )}
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-800"}`}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                        {isLoading && <div className="text-xs text-gray-400">Thinking…</div>}
                    </div>

                    <div className="border-t border-gray-100 p-3 flex items-end gap-2">
                        <input
                            ref={fileInputRef} type="file" accept="application/pdf" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ""; }}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            title="Upload a supplier invoice (PDF)"
                            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-40"
                        >
                            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                        </button>
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                            placeholder="Ask anything…"
                            rows={1}
                            className="flex-1 resize-none text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300"
                        />
                        <button onClick={send} disabled={isLoading || !input.trim()} className="p-2 bg-gray-900 text-white rounded-xl disabled:opacity-40">
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            )}

            <button
                onClick={() => setIsOpen((v) => !v)}
                className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-3 rounded-full shadow-xl"
            >
                <Bot size={18} />
                {!isOpen && <span className="text-sm font-semibold">Assistant</span>}
            </button>
        </div>
    );
}

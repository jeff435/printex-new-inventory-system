"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Wallet, ArrowUpRight, ArrowDownLeft, Plus } from "lucide-react";

const TOPUP_PRESETS = [500, 1000, 2000, 5000];

export default function WalletPage() {
    const { isAuthenticated, _hasHydrated } = useAuthStore();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [amount, setAmount] = useState("");
    const [customAmount, setCustomAmount] = useState(false);

    useEffect(() => {
        if (_hasHydrated && !isAuthenticated) router.push("/login");
    }, [_hasHydrated, isAuthenticated, router]);

    const { data: wallet, isLoading } = useQuery({
        queryKey: ["wallet"],
        queryFn: () => api.get("/wallet/balance").then(r => r.data),
        enabled: isAuthenticated,
    });

    const { data: txnData, isLoading: txnLoading } = useQuery({
        queryKey: ["wallet-transactions"],
        queryFn: () => api.get("/wallet/transactions?limit=20").then(r => r.data),
        enabled: isAuthenticated,
    });

    const topUpMutation = useMutation({
        mutationFn: (amountCents: number) =>
            api.post("/wallet/topup", { amount_kes: amountCents }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["wallet"] });
            queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
            toast.success("Wallet topped up successfully!");
            setAmount("");
            setCustomAmount(false);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || "Top-up failed");
        },
    });

    const handleTopUp = () => {
        const kes = parseFloat(amount);
        if (!kes || kes < 100) {
            toast.error("Minimum top-up is KES 100");
            return;
        }
        topUpMutation.mutate(Math.round(kes * 100));
    };

    if (!_hasHydrated || isLoading) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-12 space-y-4">
                <div className="h-40 bg-[#f8f9fa] animate-pulse rounded-2xl" />
                <div className="h-48 bg-[#f8f9fa] animate-pulse rounded-2xl" />
                <div className="h-64 bg-[#f8f9fa] animate-pulse rounded-2xl" />
            </div>
        );
    }

    const transactions = txnData?.items || [];

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">My Wallet</h1>

            {/* Balance card — glass blue gradient */}
            <div className="glass-gradient-blue rounded-2xl p-6 mb-5">
                <div className="flex items-center gap-2 mb-4 text-[#2f8f4e]/70">
                    <Wallet size={18} />
                    <span className="text-sm font-medium">Printex Wallet</span>
                </div>
                <p className="text-4xl font-bold text-[#14151a] mb-1">
                    {wallet?.balance_display || "KES 0.00"}
                </p>
                <p className="text-sm text-[#2f8f4e]/70">Available balance</p>
            </div>

            {/* Top up */}
            <div className="glass-panel rounded-2xl p-5 mb-5">
                <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Plus size={16} className="text-[#2f8f4e]" />
                    Top Up Wallet
                </h2>

                <div className="grid grid-cols-4 gap-2 mb-4">
                    {TOPUP_PRESETS.map((preset) => (
                        <button
                            key={preset}
                            onClick={() => {
                                setAmount(String(preset));
                                setCustomAmount(false);
                            }}
                            className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                                amount === String(preset) && !customAmount
                                    ? "glass-btn"
                                    : "bg-[#f8f9fa] text-gray-700 border-white hover:bg-white/80"
                            }`}
                        >
                            {preset.toLocaleString()}
                        </button>
                    ))}
                </div>

                <div className="mb-4">
                    <button
                        onClick={() => { setCustomAmount(true); setAmount(""); }}
                        className={`text-sm mb-2 ${customAmount ? "text-[#2f8f4e] font-medium" : "text-gray-500 hover:text-[#2f8f4e]"}`}
                    >
                        Enter custom amount
                    </button>
                    {customAmount && (
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">KES</span>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="e.g. 3000"
                                min={100}
                                className="w-full pl-12 pr-4 py-2 bg-white/60 border border-white/80 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white/80 transition-all"
                            />
                        </div>
                    )}
                </div>

                <button
                    onClick={handleTopUp}
                    disabled={!amount || topUpMutation.isPending}
                    className="w-full glass-btn disabled:opacity-50 py-3 rounded-xl text-sm"
                >
                    {topUpMutation.isPending
                        ? "Processing..."
                        : amount
                        ? `Top Up KES ${parseFloat(amount || "0").toLocaleString()}`
                        : "Select an amount"}
                </button>
                <p className="text-xs text-gray-400 text-center mt-2">
                    This is a simulated top-up for demo purposes
                </p>
            </div>

            {/* Transaction history */}
            <div className="glass-panel rounded-2xl p-5">
                <h2 className="font-bold text-gray-900 mb-4">Transaction History</h2>
                {txnLoading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-12 bg-[#f8f9fa] animate-pulse rounded-lg" />
                        ))}
                    </div>
                ) : transactions.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">
                        No transactions yet. Top up your wallet to get started!
                    </p>
                ) : (
                    <div className="divide-y divide-[#e6e8eb]">
                        {transactions.map((txn: any) => {
                            const isCredit = txn.type === "top_up" || txn.type === "refund";
                            return (
                                <div key={txn.id} className="flex items-center justify-between py-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isCredit ? "bg-green-100" : "bg-red-100"}`}>
                                            {isCredit
                                                ? <ArrowUpRight size={14} className="text-green-600" />
                                                : <ArrowDownLeft size={14} className="text-red-500" />
                                            }
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900 capitalize">
                                                {txn.type.replace("_", " ")}
                                            </p>
                                            <p className="text-xs text-gray-400">{txn.description}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-sm font-bold ${isCredit ? "text-green-600" : "text-red-500"}`}>
                                            {isCredit ? "+" : ""}KES {(Math.abs(txn.amount_kes) / 100).toLocaleString()}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            Bal: KES {(txn.balance_after_kes / 100).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

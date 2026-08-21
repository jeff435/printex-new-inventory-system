"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Star, TrendingUp, Gift, ArrowUpRight, ArrowDownLeft } from "lucide-react";

const TIER_THRESHOLDS: Record<string, number> = {
    bronze: 0, silver: 1000, gold: 5000, platinum: 15000,
};

const TIER_GRADIENT: Record<string, string> = {
    bronze: "from-amber-100/80 to-orange-100/60",
    silver: "from-gray-100/80 to-slate-100/60",
    gold: "from-yellow-100/80 to-amber-100/60",
    platinum: "from-blue-100/80 to-sky-100/60",
};

const TIER_ACCENT: Record<string, string> = {
    bronze: "text-amber-700 bg-amber-100 border-amber-300",
    silver: "text-gray-600 bg-gray-100 border-gray-300",
    gold: "text-yellow-700 bg-yellow-100 border-yellow-300",
    platinum: "text-[#2f8f4e] bg-[#eaf6ee] border-[#cce8d4]",
};

const TIER_BAR: Record<string, string> = {
    bronze: "bg-amber-500",
    silver: "bg-gray-400",
    gold: "bg-yellow-500",
    platinum: "bg-[#2f8f4e]",
};

export default function LoyaltyPage() {
    const { isAuthenticated, _hasHydrated } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        if (_hasHydrated && !isAuthenticated) router.push("/login");
    }, [_hasHydrated, isAuthenticated, router]);

    const { data: account, isLoading: accountLoading } = useQuery({
        queryKey: ["loyalty-account"],
        queryFn: () => api.get("/loyalty/account").then(r => r.data),
        enabled: isAuthenticated,
    });

    const { data: txnData, isLoading: txnLoading } = useQuery({
        queryKey: ["loyalty-transactions"],
        queryFn: () => api.get("/loyalty/transactions?limit=20").then(r => r.data),
        enabled: isAuthenticated,
    });

    if (!_hasHydrated || accountLoading) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-12 space-y-4">
                <div className="h-40 bg-[#e9eaed] animate-pulse rounded-2xl" />
                <div className="h-8 w-48 bg-[#e9eaed] animate-pulse rounded" />
                <div className="h-24 bg-[#e9eaed] animate-pulse rounded-2xl" />
                <div className="h-24 bg-[#e9eaed] animate-pulse rounded-2xl" />
            </div>
        );
    }

    if (!account) return null;

    const tier = account.tier as string;
    const gradient = TIER_GRADIENT[tier] || TIER_GRADIENT.bronze;
    const accent = TIER_ACCENT[tier] || TIER_ACCENT.bronze;
    const bar = TIER_BAR[tier] || TIER_BAR.bronze;
    const progress = account.tier_progress;
    const tierKeys = Object.keys(TIER_THRESHOLDS);
    const currentThreshold = TIER_THRESHOLDS[tier];
    const nextThreshold = progress.next ? TIER_THRESHOLDS[progress.next] : null;
    const progressPercent = nextThreshold
        ? Math.min(100, ((account.lifetime_points - currentThreshold) / (nextThreshold - currentThreshold)) * 100)
        : 100;

    const transactions = txnData?.items || [];

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold text-[#14151a] mb-6">Loyalty Rewards</h1>

            {/* Balance card — glass gradient */}
            <div className={`rounded-2xl p-6 mb-5 bg-gradient-to-br ${gradient} backdrop-blur-xl border border-white/70 shadow-lg`}>
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Points Balance</p>
                        <p className="text-5xl font-bold text-gray-900">
                            {account.points_balance.toLocaleString()}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                            Worth KES {(account.kes_value / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-semibold text-sm uppercase tracking-wide ${accent}`}>
                        <Star size={14} fill="currentColor" />
                        {tier}
                    </div>
                </div>

                <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                        <span>{account.lifetime_points.toLocaleString()} lifetime pts</span>
                        {progress.next ? (
                            <span>{progress.points_to_next.toLocaleString()} pts to {progress.next}</span>
                        ) : (
                            <span>Max tier reached 🎉</span>
                        )}
                    </div>
                    <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${bar}`} style={{ width: `${progressPercent}%` }} />
                    </div>
                    <div className="flex justify-between mt-2">
                        {tierKeys.map((t) => (
                            <span key={t} className={`text-xs capitalize font-medium ${t === tier ? "text-gray-800" : "text-gray-400"}`}>
                                {t}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* How it works */}
            <div className="admin-card p-5 mb-5">
                <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <Gift size={16} className="text-[#2f8f4e]" />
                    How it works
                </h2>
                <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-start gap-2">
                        <TrendingUp size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                        <span>Earn <strong>1 point</strong> for every KES 10 spent on delivered orders</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <Star size={14} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                        <span>Redeem points at checkout — <strong>1 point = KES 0.50 off</strong></span>
                    </div>
                    <div className="flex items-start gap-2">
                        <Gift size={14} className="text-[#2f8f4e] mt-0.5 flex-shrink-0" />
                        <span>Minimum redemption is <strong>100 points</strong> (KES 50 off)</span>
                    </div>
                </div>
            </div>

            {/* Transaction history */}
            <div className="admin-card p-5">
                <h2 className="font-bold text-gray-900 mb-4">Transaction History</h2>
                {txnLoading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-12 bg-[#e9eaed] animate-pulse rounded-lg" />
                        ))}
                    </div>
                ) : transactions.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">
                        No transactions yet. Place an order to start earning points!
                    </p>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {transactions.map((txn: any) => (
                            <div key={txn.id} className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${txn.type === "earn" ? "bg-green-100" : "bg-red-100"}`}>
                                        {txn.type === "earn"
                                            ? <ArrowUpRight size={14} className="text-green-600" />
                                            : <ArrowDownLeft size={14} className="text-red-500" />
                                        }
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900 capitalize">
                                            {txn.type === "earn" ? "Points Earned" : "Points Redeemed"}
                                        </p>
                                        <p className="text-xs text-gray-400">{txn.description}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`text-sm font-bold ${txn.type === "earn" ? "text-green-600" : "text-red-500"}`}>
                                        {txn.type === "earn" ? "+" : ""}{txn.points} pts
                                    </p>
                                    <p className="text-xs text-gray-400">Balance: {txn.balance_after.toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
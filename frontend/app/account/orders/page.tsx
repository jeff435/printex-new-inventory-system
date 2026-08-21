"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ordersApi, api } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { ChevronRight, ShoppingBag, X } from "lucide-react";
import toast from "react-hot-toast";

const STATUS_COLORS: Record<string, string> = {
    pending_payment: "bg-yellow-400/20 text-yellow-300 border border-yellow-400/30",
    confirmed: "bg-blue-400/20 text-[#2f8f4e] border border-[#cce8d4]",
    picking: "bg-purple-400/20 text-purple-300 border border-purple-400/30",
    packed: "bg-indigo-400/20 text-indigo-300 border border-indigo-400/30",
    dispatched: "bg-orange-400/20 text-orange-300 border border-orange-400/30",
    delivered: "bg-green-400/20 text-green-300 border border-green-400/30",
    cancelled: "bg-red-400/20 text-red-300 border border-red-400/30",
    refunded: "bg-gray-400/20 text-gray-300 border border-gray-400/30",
};

const CANCELLABLE_STATUSES = ["pending_payment", "confirmed"];

export default function OrdersPage() {
    const { isAuthenticated, _hasHydrated } = useAuthStore();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

    useEffect(() => {
        if (_hasHydrated && !isAuthenticated) router.push("/login");
    }, [_hasHydrated, isAuthenticated, router]);

    const { data, isLoading } = useQuery({
        queryKey: ["orders"],
        queryFn: () => ordersApi.list().then(r => r.data),
        enabled: isAuthenticated,
    });

    const cancelMutation = useMutation({
        mutationFn: (orderId: string) => api.post(`/orders/${orderId}/cancel`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["orders"] });
            toast.success("Order cancelled successfully");
            setConfirmCancel(null);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.detail || "Could not cancel order");
            setConfirmCancel(null);
        },
    });

    if (!_hasHydrated || isLoading) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-12 space-y-4">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-24 bg-white/10 animate-pulse rounded-2xl" />
                ))}
            </div>
        );
    }

    const orders = (data || []).filter((o: any) => o.status !== "cancelled");

    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold text-[#14151a] mb-6 drop-shadow">My Orders</h1>
            {orders.length === 0 ? (
                <div className="text-center py-20">
                    <ShoppingBag size={48} className="text-[#c3c6cb] mx-auto mb-4" />
                    <p className="text-[#9ca0a8] mb-4">No orders yet.</p>
                    <button
                        onClick={() => router.push("/products")}
                        className="glass-btn px-6 py-3 rounded-xl text-sm"
                    >
                        Start Shopping
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {orders.map((order: any) => {
                        const canCancel = CANCELLABLE_STATUSES.includes(order.status);
                        const isCancelling = confirmCancel === order.id;

                        return (
                            <div key={order.id} className="glass-card rounded-2xl overflow-hidden">
                                <Link
                                    href={`/account/orders/${order.id}`}
                                    className="block p-5 hover:bg-[#f8f9fa] transition-colors"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="font-bold text-[#14151a]">{order.order_number}</span>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-medium px-3 py-1 rounded-full capitalize ${STATUS_COLORS[order.status] || "bg-white/10 text-[#6b7078]"}`}>
                                                {order.status.replace(/_/g, " ")}
                                            </span>
                                            <ChevronRight size={16} className="text-[#9ca0a8]" />
                                        </div>
                                    </div>
                                    <p className="text-sm text-[#9ca0a8]">
                                        {order.items?.length} item{order.items?.length !== 1 ? "s" : ""}
                                    </p>
                                    <p className="text-base font-bold text-[#14151a] mt-1">
                                        KES {(order.total_kes / 100).toLocaleString()}
                                    </p>
                                </Link>

                                {canCancel && (
                                    <div className="px-5 pb-4 border-t border-[#e6e8eb] pt-3">
                                        {isCancelling ? (
                                            <div className="flex items-center gap-3">
                                                <p className="text-sm text-[#6b7078] flex-1">Cancel this order?</p>
                                                <button
                                                    onClick={() => cancelMutation.mutate(order.id)}
                                                    disabled={cancelMutation.isPending}
                                                    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-red-500/80 hover:bg-red-500 text-[#14151a] transition-colors disabled:opacity-50"
                                                >
                                                    {cancelMutation.isPending ? "Cancelling..." : "Yes, cancel"}
                                                </button>
                                                <button
                                                    onClick={() => setConfirmCancel(null)}
                                                    className="text-xs font-medium px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#6b7078] transition-colors"
                                                >
                                                    Keep order
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setConfirmCancel(order.id);
                                                }}
                                                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
                                            >
                                                <X size={13} />
                                                Cancel order
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
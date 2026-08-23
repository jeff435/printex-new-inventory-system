"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import {
    Phone, MapPin, Hash, Package, Banknote, AlertCircle,
    CheckCircle, Truck, ChevronRight, RefreshCw,
} from "lucide-react";

type DriverDelivery = {
    id: string;
    order_id: string;
    status: "assigned" | "picked_up" | "en_route" | "delivered" | "failed";
    estimated_arrival: string | null;
    delivery_otp: string | null;
    otp_verified: boolean;
    driver_notes: string | null;
    failure_reason: string | null;
    order: {
        order_number: string;
        total_kes: number;
        payment_method: string | null;
        payment_status: string;
        special_instructions: string | null;
        customer_name: string | null;
        customer_phone: string | null;
        address_street: string | null;
        address_area: string | null;
        address_phone: string | null;
        address_instructions: string | null;
    } | null;
};

const NEXT_STATUS: Record<string, { next: string; label: string } | null> = {
    assigned: { next: "picked_up", label: "Mark Picked Up" },
    picked_up: { next: "en_route", label: "Mark En Route" },
    en_route: { next: "delivered", label: "Mark Delivered" },
    delivered: null,
    failed: null,
};

const STATUS_LABEL: Record<string, string> = {
    assigned: "Assigned",
    picked_up: "Picked Up",
    en_route: "En Route",
    delivered: "Delivered",
    failed: "Failed",
};

const STATUS_COLOR: Record<string, string> = {
    assigned: "bg-gray-100 text-gray-600",
    picked_up: "bg-indigo-100 text-indigo-700",
    en_route: "bg-orange-100 text-orange-700",
    delivered: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
};

export default function DriverDashboard() {
    const queryClient = useQueryClient();
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: ["my-deliveries"],
        queryFn: () => api.get("/deliveries/my-deliveries").then((r) => r.data as DriverDelivery[]),
        refetchInterval: 30000,
    });

    const updateMutation = useMutation({
        mutationFn: ({ orderId, status, failureReason }: { orderId: string; status: string; failureReason?: string }) =>
            api.patch(`/deliveries/status/${orderId}`, { status, failure_reason: failureReason }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["my-deliveries"] });
            toast.success("Status updated");
        },
        onError: (err: any) => toast.error((err.response?.data?.detail || err.response?.data?.message) || "Could not update status"),
    });

    const handleAdvance = (orderId: string, nextStatus: string) => {
        updateMutation.mutate({ orderId, status: nextStatus });
    };

    const handleFail = (orderId: string) => {
        const reason = window.prompt("Why couldn't this delivery be completed?");
        if (reason === null) return;
        updateMutation.mutate({ orderId, status: "failed", failureReason: reason || "Not specified" });
    };

    const deliveries = data ?? [];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h1 className="text-lg font-bold text-gray-900">My Deliveries</h1>
                <button
                    onClick={() => refetch()}
                    className="flex items-center gap-1.5 text-xs text-gray-500 px-2.5 py-1.5 rounded-lg hover:bg-gray-100"
                >
                    <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
                    Refresh
                </button>
            </div>

            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2].map((i) => <div key={i} className="h-24 bg-white animate-pulse rounded-2xl border border-gray-100" />)}
                </div>
            ) : deliveries.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center border border-gray-100">
                    <Truck size={28} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No deliveries assigned right now.</p>
                    <p className="text-xs text-gray-300 mt-1">This refreshes automatically every 30 seconds.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {deliveries.map((d) => {
                        const o = d.order;
                        const isExpanded = expandedId === d.id;
                        const nextAction = NEXT_STATUS[d.status];
                        const isCOD = o?.payment_method === "cash_on_delivery" && o?.payment_status !== "paid";

                        return (
                            <div key={d.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                                <div
                                    className="flex items-center gap-3 p-4 cursor-pointer"
                                    onClick={() => setExpandedId(isExpanded ? null : d.id)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-900 text-sm">{o?.order_number ?? "Order"}</p>
                                        <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
                                            <MapPin size={10} /> {o?.address_area ?? "—"}
                                        </p>
                                    </div>
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_COLOR[d.status]}`}>
                                        {STATUS_LABEL[d.status]}
                                    </span>
                                    <ChevronRight size={16} className={`text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                </div>

                                {isExpanded && (
                                    <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50/60">
                                        {/* Customer */}
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">{o?.customer_name ?? "Customer"}</p>
                                                <p className="text-xs text-gray-500">{o?.address_street}, {o?.address_area}</p>
                                            </div>
                                            {o?.customer_phone && (
                                                <a
                                                    href={`tel:${o.customer_phone}`}
                                                    className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-xl flex-shrink-0"
                                                >
                                                    <Phone size={13} /> Call
                                                </a>
                                            )}
                                        </div>

                                        {o?.address_instructions && (
                                            <p className="text-xs text-gray-500 italic bg-white rounded-lg px-3 py-2 border border-gray-100">
                                                "{o.address_instructions}"
                                            </p>
                                        )}

                                        {/* OTP */}
                                        {d.delivery_otp && (
                                            <div className="flex items-center gap-2 text-sm font-mono font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2">
                                                <Hash size={14} className="text-gray-400" />
                                                Delivery OTP: <span className="text-blue-700">{d.delivery_otp}</span>
                                                <span className="text-xs text-gray-400 font-normal ml-auto">Confirm with customer before marking delivered</span>
                                            </div>
                                        )}

                                        {/* COD reminder */}
                                        {isCOD && (
                                            <div className="flex items-center gap-2 text-sm font-semibold text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2">
                                                <Banknote size={14} />
                                                Collect KES {o ? (o.total_kes / 100).toLocaleString() : "—"} cash on delivery
                                            </div>
                                        )}

                                        {o?.special_instructions && (
                                            <div className="flex items-start gap-2 text-xs text-gray-500 bg-white border border-gray-100 rounded-lg px-3 py-2">
                                                <Package size={12} className="mt-0.5 flex-shrink-0" />
                                                {o.special_instructions}
                                            </div>
                                        )}

                                        {d.status === "failed" && d.failure_reason && (
                                            <div className="flex items-center gap-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                                <AlertCircle size={13} /> {d.failure_reason}
                                            </div>
                                        )}

                                        {/* Actions */}
                                        {d.status !== "delivered" && d.status !== "failed" && (
                                            <div className="flex gap-2 pt-1">
                                                {nextAction && (
                                                    <button
                                                        onClick={() => handleAdvance(d.order_id, nextAction.next)}
                                                        disabled={updateMutation.isPending}
                                                        className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
                                                    >
                                                        <CheckCircle size={15} />
                                                        {nextAction.label}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleFail(d.order_id)}
                                                    disabled={updateMutation.isPending}
                                                    className="px-3 py-2.5 rounded-xl text-sm font-semibold text-red-500 border border-red-200 disabled:opacity-50"
                                                >
                                                    Failed
                                                </button>
                                            </div>
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
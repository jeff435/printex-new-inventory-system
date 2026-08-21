"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
    ChevronRight, Package, Truck, CheckCircle, XCircle,
    MapPin, Phone, Clock, ShoppingBag, PackageCheck,
    AlertCircle, Star, Navigation, X
} from "lucide-react";
import toast from "react-hot-toast";

// ── Order pipeline steps ──────────────────────────────────────────────────────
const ORDER_STEPS = [
    { key: "pending_payment", label: "Payment", icon: ShoppingBag, desc: "Awaiting payment" },
    { key: "confirmed", label: "Confirmed", icon: CheckCircle, desc: "Order received" },
    { key: "picking", label: "Picking", icon: Package, desc: "Gathering items" },
    { key: "packed", label: "Packed", icon: PackageCheck, desc: "Ready to dispatch" },
    { key: "dispatched", label: "Dispatched", icon: Navigation, desc: "On the way" },
    { key: "delivered", label: "Delivered", icon: Star, desc: "Order complete" },
];

// ── Delivery sub-steps ────────────────────────────────────────────────────────
const DELIVERY_STEPS = [
    { key: "assigned", label: "Driver Assigned", icon: Truck, desc: "A driver has been assigned to your order" },
    { key: "picked_up", label: "Order Collected", icon: Package, desc: "Driver picked up your order from the branch" },
    { key: "en_route", label: "On the Way", icon: Navigation, desc: "Your order is heading to you now" },
    { key: "delivered", label: "Delivered", icon: CheckCircle, desc: "Order successfully delivered" },
];

// ── Colour helpers ────────────────────────────────────────────────────────────
const stepColour = (done: boolean, active: boolean) =>
    done
        ? active
            ? "bg-[#2f8f4e] border-blue-600 text-[#14151a] shadow-lg shadow-blue-500/30"
            : "bg-[#2f8f4e] border-blue-600 text-[#14151a]"
        : "bg-white border-gray-200 text-gray-300";

const labelColour = (done: boolean, active: boolean) =>
    active ? "text-[#2f8f4e] font-semibold" : done ? "text-gray-700 font-medium" : "text-gray-400";

const connectorColour = (filled: boolean) =>
    filled ? "bg-[#2f8f4e]" : "bg-gray-100";

const CANCELLABLE_STATUSES = ["pending_payment", "confirmed"];

// ─────────────────────────────────────────────────────────────────────────────
export default function OrderTrackingPage() {
    const params = useParams();
    const orderId = params.id as string;
    const { isAuthenticated, _hasHydrated } = useAuthStore();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [confirmCancel, setConfirmCancel] = useState(false);

    useEffect(() => {
        if (_hasHydrated && !isAuthenticated) router.push("/login");
    }, [_hasHydrated, isAuthenticated, router]);

    const { data, isLoading, isError } = useQuery({
        queryKey: ["tracking", orderId],
        queryFn: () => api.get(`/deliveries/track/${orderId}`).then(r => r.data),
        enabled: isAuthenticated && !!orderId,
        refetchInterval: 30_000,
    });

    const cancelMutation = useMutation({
        mutationFn: () => api.post(`/orders/${orderId}/cancel`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tracking", orderId] });
            queryClient.invalidateQueries({ queryKey: ["orders"] });
            toast.success("Order cancelled successfully");
            setConfirmCancel(false);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || "Could not cancel order");
            setConfirmCancel(false);
        },
    });

    // ── Loading skeleton ────────────────────────────────────────────────────────
    if (!_hasHydrated || isLoading) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-10 space-y-5">
                <div className="h-4 w-36 bg-gray-100 animate-pulse rounded-lg mb-8" />
                <div className="h-28 bg-gray-100 animate-pulse rounded-2xl" />
                <div className="h-56 bg-gray-100 animate-pulse rounded-2xl" />
                <div className="h-32 bg-gray-100 animate-pulse rounded-2xl" />
            </div>
        );
    }

    if (isError || !data) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-24 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                    <XCircle size={32} className="text-gray-300" />
                </div>
                <p className="text-gray-500 mb-6">Order not found or no longer available.</p>
                <Link href="/account/orders" className="inline-flex items-center gap-1 text-sm text-[#2f8f4e] hover:underline font-medium">
                    <ChevronRight size={14} className="rotate-180" /> Back to orders
                </Link>
            </div>
        );
    }

    const { order_number, order_status, delivery, driver_name, driver_phone } = data;
    const isCancelled = order_status === "cancelled";
    const isDelivered = order_status === "delivered";
    const canCancel = CANCELLABLE_STATUSES.includes(order_status);

    const orderStepIdx = ORDER_STEPS.findIndex(s => s.key === order_status);
    const deliveryStepIdx = delivery ? DELIVERY_STEPS.findIndex(s => s.key === delivery.status) : -1;

    const activeOrderStep = ORDER_STEPS[orderStepIdx];
    const activeDeliveryStep = DELIVERY_STEPS[deliveryStepIdx];

    // ── Page ────────────────────────────────────────────────────────────────────
    return (
        <div className="max-w-2xl mx-auto px-4 py-8 pb-16">

            {/* Breadcrumb */}
            <nav className="flex items-center justify-between gap-1.5 text-xs text-gray-400 mb-7">
                <div className="flex items-center gap-1.5">
                    <Link href="/account/orders" className="hover:text-[#2f8f4e] transition-colors">My Orders</Link>
                    <ChevronRight size={12} />
                    <span className="text-gray-700 font-medium">{order_number}</span>
                </div>
                <Link
                    href={`/account/orders/${orderId}/receipt`}
                    className="inline-flex items-center gap-1 text-[#2f8f4e] hover:underline font-medium"
                >
                    Print receipt
                </Link>
            </nav>

            {/* Hero status banner */}
            {isCancelled ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                        <XCircle size={24} className="text-red-500" />
                    </div>
                    <div>
                        <p className="font-bold text-red-700">Order Cancelled</p>
                        <p className="text-sm text-red-500 mt-0.5">This order has been cancelled. Contact support if needed.</p>
                    </div>
                </div>
            ) : (
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 mb-5 text-[#14151a] shadow-lg shadow-blue-500/20">
                    <div className="flex items-center gap-3 mb-1">
                        {activeOrderStep && (
                            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                                {(() => { const Icon = activeOrderStep.icon; return <Icon size={18} />; })()}
                            </div>
                        )}
                        <div>
                            <p className="text-xs text-blue-200 uppercase tracking-wider font-medium">Current status</p>
                            <p className="text-lg font-bold leading-tight">{activeOrderStep?.label ?? order_status}</p>
                        </div>
                    </div>
                    {activeOrderStep && (
                        <p className="text-sm text-blue-100 ml-12">{activeOrderStep.desc}</p>
                    )}
                </div>
            )}

            {/* Cancel order card */}
            {canCancel && (
                <div className="glass-panel p-5 mb-5">
                    {confirmCancel ? (
                        <div className="flex items-center gap-3">
                            <p className="text-sm text-gray-600 flex-1">Are you sure you want to cancel this order?</p>
                            <button
                                onClick={() => cancelMutation.mutate()}
                                disabled={cancelMutation.isPending}
                                className="text-xs font-semibold px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-[#14151a] transition-colors disabled:opacity-50"
                            >
                                {cancelMutation.isPending ? "Cancelling..." : "Yes, cancel"}
                            </button>
                            <button
                                onClick={() => setConfirmCancel(false)}
                                className="text-xs font-medium px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                            >
                                Keep order
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirmCancel(true)}
                            className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
                        >
                            <X size={14} />
                            Cancel this order
                        </button>
                    )}
                </div>
            )}

            {/* Order pipeline */}
            {!isCancelled && (
                <div className="glass-panel p-6 mb-5">
                    <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-5">Order Progress</h2>

                    {/* Horizontal step bar on wider, vertical on narrow */}
                    <div className="hidden sm:flex items-start">
                        {ORDER_STEPS.map((step, idx) => {
                            const done = idx <= orderStepIdx;
                            const active = idx === orderStepIdx;
                            const Icon = step.icon;
                            return (
                                <div key={step.key} className="flex items-start flex-1 min-w-0">
                                    <div className="flex flex-col items-center flex-shrink-0 w-full">
                                        <div className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center transition-all duration-300 ${stepColour(done, active)}`}>
                                            <Icon size={15} />
                                        </div>
                                        <p className={`text-center mt-2 leading-snug px-0.5 transition-colors duration-300 ${labelColour(done, active)}`} style={{ fontSize: "10px" }}>
                                            {step.label}
                                        </p>
                                    </div>
                                    {idx < ORDER_STEPS.length - 1 && (
                                        <div className={`flex-1 h-0.5 mt-4 mx-1 transition-colors duration-500 ${idx < orderStepIdx ? connectorColour(true) : connectorColour(false)}`} />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Mobile: vertical timeline */}
                    <div className="sm:hidden space-y-0">
                        {ORDER_STEPS.map((step, idx) => {
                            const done = idx <= orderStepIdx;
                            const active = idx === orderStepIdx;
                            const Icon = step.icon;
                            return (
                                <div key={step.key} className="flex gap-3">
                                    <div className="flex flex-col items-center">
                                        <div className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center flex-shrink-0 transition-all ${stepColour(done, active)}`}>
                                            <Icon size={14} />
                                        </div>
                                        {idx < ORDER_STEPS.length - 1 && (
                                            <div className={`w-0.5 flex-1 my-1 ${idx < orderStepIdx ? "bg-[#2f8f4e]" : "bg-gray-100"}`} style={{ minHeight: "24px" }} />
                                        )}
                                    </div>
                                    <div className="pb-5 pt-1">
                                        <p className={`text-sm leading-tight ${labelColour(done, active)}`}>{step.label}</p>
                                        {active && <p className="text-xs text-gray-400 mt-0.5">{step.desc}</p>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Delivery tracking */}
            {delivery ? (
                <div className="glass-panel p-6 mb-5">
                    <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-5">Delivery Tracking</h2>

                    <div className="space-y-0">
                        {DELIVERY_STEPS.map((step, idx) => {
                            const done = idx <= deliveryStepIdx;
                            const active = idx === deliveryStepIdx;
                            const Icon = step.icon;
                            return (
                                <div key={step.key} className="flex gap-4">
                                    {/* Timeline spine */}
                                    <div className="flex flex-col items-center">
                                        <div className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${stepColour(done, active)}`}>
                                            <Icon size={16} />
                                        </div>
                                        {idx < DELIVERY_STEPS.length - 1 && (
                                            <div className={`w-0.5 my-1 transition-colors duration-500 ${idx < deliveryStepIdx ? "bg-[#2f8f4e]" : "bg-gray-100"}`} style={{ minHeight: "28px" }} />
                                        )}
                                    </div>
                                    {/* Content */}
                                    <div className="pb-6 pt-1.5 flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className={`text-sm leading-tight ${labelColour(done, active)}`}>{step.label}</p>
                                            {active && (
                                                <span className="text-[10px] bg-blue-50 text-[#2f8f4e] border border-blue-100 px-2 py-0.5 rounded-full font-semibold tracking-wide uppercase">
                                                    Now
                                                </span>
                                            )}
                                        </div>
                                        {(active || done) && (
                                            <p className="text-xs text-gray-400 mt-0.5">{step.desc}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ETA */}
                    {delivery.estimated_arrival && !isDelivered && (
                        <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mt-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                                <Clock size={14} className="text-[#2f8f4e]" />
                            </div>
                            <div>
                                <p className="text-xs text-blue-500 font-medium uppercase tracking-wide">Estimated Arrival</p>
                                <p className="text-sm font-bold text-blue-800">{delivery.estimated_arrival}</p>
                            </div>
                        </div>
                    )}

                    {/* OTP box */}
                    {delivery.delivery_otp && !delivery.otp_verified && (
                        <div className="mt-4 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <AlertCircle size={16} className="text-amber-500" />
                                <p className="text-sm font-bold text-amber-800">Delivery Confirmation Code</p>
                            </div>
                            <p className="text-xs text-amber-600 mb-3">Share this code with your driver when they arrive to confirm delivery.</p>
                            <div className="bg-white border border-amber-200 rounded-xl py-4 px-6 text-center shadow-sm">
                                <p className="text-4xl font-extrabold tracking-[0.3em] text-amber-700 font-mono">{delivery.delivery_otp}</p>
                            </div>
                        </div>
                    )}

                    {delivery.otp_verified && (
                        <div className="mt-4 flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                                <CheckCircle size={16} className="text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-green-800">Delivery Confirmed</p>
                                <p className="text-xs text-green-600">OTP verified successfully</p>
                            </div>
                        </div>
                    )}

                    {delivery.failure_reason && (
                        <div className="mt-4 flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                                <XCircle size={16} className="text-red-500" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-red-700">Delivery Issue</p>
                                <p className="text-xs text-red-500">{delivery.failure_reason}</p>
                            </div>
                        </div>
                    )}
                </div>
            ) : !isCancelled && (
                <div className="glass-panel p-6 mb-5">
                    <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3">Delivery Tracking</h2>
                    <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <Truck size={16} className="text-gray-400" />
                        </div>
                        <p className="text-sm text-gray-500">A driver hasn&apos;t been assigned yet — check back soon.</p>
                    </div>
                </div>
            )}

            {/* Driver card */}
            {driver_name && (
                <div className="glass-panel p-6">
                    <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-4">Your Driver</h2>
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-[#eaf6ee] flex items-center justify-center text-[#2f8f4e] font-extrabold text-xl flex-shrink-0">
                            {driver_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-gray-900 text-base">{driver_name}</p>
                            {driver_phone && (
                                <a
                                    href={`tel:${driver_phone}`}
                                    className="inline-flex items-center gap-1.5 text-sm text-[#2f8f4e] hover:underline mt-1 font-medium"
                                >
                                    <Phone size={13} />
                                    {driver_phone}
                                </a>
                            )}
                        </div>
                        {driver_phone && (
                            <a
                                href={`tel:${driver_phone}`}
                                className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#eaf6ee] border border-[#cce8d4] flex items-center justify-center text-[#2f8f4e] hover:bg-[#dff2e5] transition-colors"
                                aria-label="Call driver"
                            >
                                <Phone size={16} />
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
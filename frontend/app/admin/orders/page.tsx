"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAdminBranchStore } from "@/stores";
import toast from "react-hot-toast";
import { ChevronDown, EyeOff, Eye, Truck, MapPin, Phone, User as UserIcon, Hash } from "lucide-react";

type OrderStatus = "pending_payment" | "confirmed" | "picking" | "packed" | "dispatched" | "delivered" | "cancelled" | "refunded";
const STATUS_OPTIONS: OrderStatus[] = ["pending_payment", "confirmed", "picking", "packed", "dispatched", "delivered", "cancelled", "refunded"];
const STATUS_COLORS: Record<string, string> = {
    pending_payment: "bg-yellow-100 text-yellow-700",
    confirmed: "bg-blue-100 text-blue-700",
    picking: "bg-purple-100 text-purple-700",
    packed: "bg-indigo-100 text-indigo-700",
    dispatched: "bg-orange-100 text-orange-700",
    delivered: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
    refunded: "bg-gray-100 text-gray-600",
};

type DeliveryStatus = "assigned" | "picked_up" | "en_route" | "delivered" | "failed";
const DELIVERY_STATUS_OPTIONS: DeliveryStatus[] = ["assigned", "picked_up", "en_route", "delivered", "failed"];
const DELIVERY_STATUS_COLORS: Record<string, string> = {
    assigned: "bg-gray-100 text-gray-600",
    picked_up: "bg-indigo-100 text-indigo-700",
    en_route: "bg-orange-100 text-orange-700",
    delivered: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
};

type Driver = { id: string; full_name: string; phone: string | null };

export default function AdminOrdersPage() {
    const queryClient = useQueryClient();
    const { selectedBranchId } = useAdminBranchStore();
    const [statusFilter, setStatusFilter] = useState("all");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showCancelled, setShowCancelled] = useState(false);
    // Per-order draft state for the "assign driver" form (orderId -> {driverId, eta})
    const [assignDraft, setAssignDraft] = useState<Record<string, { driverId: string; eta: string }>>({});

    const { data, isLoading } = useQuery({
        queryKey: ["admin-orders", statusFilter, selectedBranchId],
        queryFn: () => api.get("/orders/admin/queue", {
            params: { branch_id: selectedBranchId || undefined, status: statusFilter === "all" ? undefined : statusFilter }
        }).then((r) => r.data),
        enabled: selectedBranchId !== null,
    });

    const { data: drivers } = useQuery({
        queryKey: ["admin-drivers"],
        queryFn: () => api.get("/auth/drivers").then((r) => r.data as Driver[]),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/orders/${id}/status`, { status }),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-orders"] }); toast.success("Order status updated"); },
        onError: (err: any) => toast.error((err.response?.data?.detail || err.response?.data?.message) || "Update failed"),
    });

    const assignDriverMutation = useMutation({
        mutationFn: ({ orderId, driverId, eta }: { orderId: string; driverId: string; eta: string }) =>
            api.post(`/deliveries/assign/${orderId}`, { driver_id: driverId, estimated_arrival: eta || null }),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-orders"] }); toast.success("Driver assigned"); },
        onError: (err: any) => toast.error((err.response?.data?.detail || err.response?.data?.message) || "Could not assign driver"),
    });

    const updateDeliveryMutation = useMutation({
        mutationFn: ({ orderId, status, failureReason }: { orderId: string; status: string; failureReason?: string }) =>
            api.patch(`/deliveries/status/${orderId}`, { status, failure_reason: failureReason }),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-orders"] }); toast.success("Delivery status updated"); },
        onError: (err: any) => toast.error((err.response?.data?.detail || err.response?.data?.message) || "Could not update delivery"),
    });

    const allOrders = Array.isArray(data) ? data : (data?.items ?? []);
    const cancelledOrders = allOrders.filter((o: any) => o.status === "cancelled");
    const activeOrders = allOrders.filter((o: any) => o.status !== "cancelled");
    const orders = showCancelled ? allOrders : activeOrders;

    const getDriver = (driverId: string | null | undefined) => (drivers ?? []).find((d) => d.id === driverId);

    const handleAssign = (orderId: string) => {
        const draft = assignDraft[orderId];
        if (!draft?.driverId) { toast.error("Pick a driver first"); return; }
        assignDriverMutation.mutate({ orderId, driverId: draft.driverId, eta: draft.eta ?? "" });
    };

    const handleDeliveryStatus = (orderId: string, status: DeliveryStatus) => {
        if (status === "failed") {
            const reason = window.prompt("Reason for failed delivery?");
            if (reason === null) return; // cancelled prompt
            updateDeliveryMutation.mutate({ orderId, status, failureReason: reason || "Not specified" });
        } else {
            updateDeliveryMutation.mutate({ orderId, status });
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-gray-900">Orders</h1>
                <div className="admin-toolbar flex items-center gap-3">
                    {cancelledOrders.length > 0 && (
                        <button
                            onClick={() => setShowCancelled(!showCancelled)}
                            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-all ${showCancelled
                                ? "bg-red-50 text-red-600 border-red-200"
                                : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                }`}
                        >
                            {showCancelled ? <EyeOff size={13} /> : <Eye size={13} />}
                            {showCancelled ? "Hide cancelled" : `Show cancelled (${cancelledOrders.length})`}
                        </button>
                    )}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
                    >
                        <option value="all">All statuses</option>
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                    </select>
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-2xl" />)}</div>
            ) : orders.length === 0 ? (
                <div className="admin-card p-12 text-center text-gray-400 text-sm">
                    {allOrders.length > 0 && !showCancelled
                        ? `No active orders. ${cancelledOrders.length} cancelled order${cancelledOrders.length !== 1 ? "s" : ""} hidden.`
                        : "No orders found."
                    }
                </div>
            ) : (
                <div className="space-y-3">
                    {orders.map((order: any) => {
                        const delivery = order.delivery;
                        const assignedDriver = getDriver(delivery?.driver_id);
                        const isHomeDelivery = order.delivery_type === "home_delivery";
                        const draft = assignDraft[order.id] ?? { driverId: "", eta: "" };

                        return (
                            <div key={order.id} className={`admin-card overflow-hidden ${order.status === "cancelled" ? "opacity-60" : ""}`}>
                                <div
                                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/80 transition-colors"
                                    onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-900 text-sm">{order.order_number}</p>
                                        <p className="text-xs text-gray-400 truncate">
                                            {order.user?.full_name || "Customer"} · {order.items?.length} items
                                        </p>
                                    </div>
                                    <p className="text-sm font-bold text-gray-900 flex-shrink-0">
                                        KES {(order.total_kes / 100).toLocaleString()}
                                    </p>
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 capitalize ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-600"}`}>
                                        {order.status.replace(/_/g, " ")}
                                    </span>
                                    {isHomeDelivery && delivery && (
                                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 capitalize flex items-center gap-1 ${DELIVERY_STATUS_COLORS[delivery.status] || "bg-gray-100 text-gray-600"}`}>
                                            <Truck size={11} />
                                            {delivery.status.replace(/_/g, " ")}
                                        </span>
                                    )}
                                    <ChevronDown size={14} className={`text-gray-400 flex-shrink-0 transition-transform ${expandedId === order.id ? "rotate-180" : ""}`} />
                                </div>

                                {expandedId === order.id && (
                                    <div className="border-t border-gray-100 p-4 bg-gray-50/80 space-y-4">

                                        {/* Customer + address */}
                                        <div className="grid sm:grid-cols-2 gap-3">
                                            <div className="bg-white rounded-xl p-3 border border-gray-100">
                                                <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
                                                    <UserIcon size={11} /> Customer
                                                </p>
                                                <p className="text-sm font-medium text-gray-900">{order.user?.full_name || "—"}</p>
                                                {order.user?.phone && (
                                                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                                        <Phone size={10} /> {order.user.phone}
                                                    </p>
                                                )}
                                            </div>
                                            {isHomeDelivery && order.address && (
                                                <div className="bg-white rounded-xl p-3 border border-gray-100">
                                                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
                                                        <MapPin size={11} /> Delivery address
                                                    </p>
                                                    <p className="text-sm text-gray-900">{order.address.street}, {order.address.area}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5">{order.address.full_name} · {order.address.phone}</p>
                                                    {order.address.delivery_instructions && (
                                                        <p className="text-xs text-gray-400 mt-1 italic">"{order.address.delivery_instructions}"</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Items */}
                                        <div>
                                            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Items</p>
                                            <div className="space-y-1">
                                                {order.items?.map((item: any) => (
                                                    <div key={item.id} className="flex justify-between text-sm">
                                                        <span className="text-gray-700">{item.product?.name || "Product"} × {item.quantity}</span>
                                                        <span className="text-gray-900 font-medium">KES {(item.total_price_kes / 100).toLocaleString()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Order status controls */}
                                        {order.status !== "cancelled" && order.status !== "delivered" && order.status !== "refunded" && (
                                            <div>
                                                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Update Order Status</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {STATUS_OPTIONS.filter(s => s !== "cancelled" && s !== "refunded").map((s) => (
                                                        <button
                                                            key={s}
                                                            disabled={s === order.status || updateMutation.isPending}
                                                            onClick={() => updateMutation.mutate({ id: order.id, status: s })}
                                                            className={`text-xs px-3 py-1.5 rounded-xl font-semibold border transition-all capitalize disabled:opacity-40 disabled:cursor-not-allowed ${s === order.status
                                                                ? "bg-blue-600 text-white border-blue-600"
                                                                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                                                }`}
                                                        >
                                                            {s.replace(/_/g, " ")}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Delivery management — only for home delivery, non-terminal orders */}
                                        {isHomeDelivery && order.status !== "cancelled" && order.status !== "refunded" && (
                                            <div className="admin-toolbar bg-white rounded-xl p-3 border border-gray-100">
                                                <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                                    <Truck size={11} /> Delivery
                                                </p>

                                                {!delivery ? (
                                                    <div className="flex flex-wrap items-end gap-2">
                                                        <select
                                                            value={draft.driverId}
                                                            onChange={(e) => setAssignDraft((p) => ({ ...p, [order.id]: { ...draft, driverId: e.target.value } }))}
                                                            className="text-sm bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                        >
                                                            <option value="">Select driver…</option>
                                                            {(drivers ?? []).map((d) => (
                                                                <option key={d.id} value={d.id}>{d.full_name}{d.phone ? ` — ${d.phone}` : ""}</option>
                                                            ))}
                                                        </select>
                                                        <input
                                                            type="text"
                                                            placeholder="ETA, e.g. 30 mins"
                                                            value={draft.eta}
                                                            onChange={(e) => setAssignDraft((p) => ({ ...p, [order.id]: { ...draft, eta: e.target.value } }))}
                                                            className="text-sm bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 w-32 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                        />
                                                        <button
                                                            onClick={() => handleAssign(order.id)}
                                                            disabled={assignDriverMutation.isPending}
                                                            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                                                        >
                                                            Assign driver
                                                        </button>
                                                        {(drivers ?? []).length === 0 && (
                                                            <p className="text-xs text-gray-400 w-full mt-1">
                                                                No drivers found — add a user with the "driver" role first.
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2.5">
                                                        <div className="flex items-center justify-between flex-wrap gap-2">
                                                            <div className="text-sm">
                                                                <span className="text-gray-900 font-medium">{assignedDriver?.full_name || "Driver"}</span>
                                                                {assignedDriver?.phone && <span className="text-gray-400"> · {assignedDriver.phone}</span>}
                                                                {delivery.estimated_arrival && (
                                                                    <span className="text-gray-400"> · ETA {delivery.estimated_arrival}</span>
                                                                )}
                                                            </div>
                                                            {delivery.delivery_otp && (
                                                                <span className="flex items-center gap-1 text-xs font-mono font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">
                                                                    <Hash size={10} /> OTP {delivery.delivery_otp}
                                                                    {delivery.otp_verified && <span className="text-green-600">✓ verified</span>}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {delivery.status !== "delivered" && delivery.status !== "failed" && (
                                                            <div className="flex flex-wrap gap-2">
                                                                {DELIVERY_STATUS_OPTIONS.map((s) => (
                                                                    <button
                                                                        key={s}
                                                                        disabled={s === delivery.status || updateDeliveryMutation.isPending}
                                                                        onClick={() => handleDeliveryStatus(order.id, s)}
                                                                        className={`text-xs px-3 py-1.5 rounded-xl font-semibold border transition-all capitalize disabled:opacity-40 disabled:cursor-not-allowed ${s === delivery.status
                                                                            ? "bg-orange-600 text-white border-orange-600"
                                                                            : s === "failed"
                                                                                ? "bg-white text-red-500 border-red-200 hover:bg-red-50"
                                                                                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                                                            }`}
                                                                    >
                                                                        {s.replace(/_/g, " ")}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {delivery.status === "failed" && delivery.failure_reason && (
                                                            <p className="text-xs text-red-500 font-medium">Failure reason: {delivery.failure_reason}</p>
                                                        )}

                                                        {/* Reassign to a different driver */}
                                                        {delivery.status !== "delivered" && (
                                                            <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-gray-100">
                                                                <select
                                                                    value={draft.driverId}
                                                                    onChange={(e) => setAssignDraft((p) => ({ ...p, [order.id]: { ...draft, driverId: e.target.value } }))}
                                                                    className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                                >
                                                                    <option value="">Reassign driver…</option>
                                                                    {(drivers ?? []).map((d) => (
                                                                        <option key={d.id} value={d.id}>{d.full_name}</option>
                                                                    ))}
                                                                </select>
                                                                <button
                                                                    onClick={() => handleAssign(order.id)}
                                                                    disabled={assignDriverMutation.isPending || !draft.driverId}
                                                                    className="text-xs font-medium px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"
                                                                >
                                                                    Reassign
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {order.status === "cancelled" && order.cancellation_reason && (
                                            <p className="text-xs text-red-500 font-medium">
                                                Reason: {order.cancellation_reason}
                                            </p>
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
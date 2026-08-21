"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore, useAdminBranchStore } from "@/stores";
import { ShoppingBag, TrendingUp, AlertTriangle, Clock, CheckCircle, Truck, XCircle } from "lucide-react";

type StatCardProps = { label: string; value: string | number; icon: React.ElementType; color: string; sub?: string };

function StatCard({ label, value, icon: Icon, color, sub }: StatCardProps) {
    return (
        <div className="admin-card p-5">
            <div className="flex items-start justify-between mb-3">
                <p className="text-sm text-gray-500 font-medium">{label}</p>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                    <Icon size={16} className="text-white" />
                </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
    );
}

type StatusCfg = { label: string; icon: React.ElementType; color: string };
const STATUS_CONFIG: Record<string, StatusCfg> = {
    pending_payment: { label: "Pending Payment", icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    confirmed: { label: "Confirmed", icon: CheckCircle, color: "text-blue-600 bg-blue-50" },
    picking: { label: "Picking", icon: ShoppingBag, color: "text-purple-600 bg-purple-50" },
    packed: { label: "Packed", icon: ShoppingBag, color: "text-indigo-600 bg-indigo-50" },
    dispatched: { label: "Dispatched", icon: Truck, color: "text-orange-600 bg-orange-50" },
    delivered: { label: "Delivered", icon: CheckCircle, color: "text-green-600 bg-green-50" },
    cancelled: { label: "Cancelled", icon: XCircle, color: "text-red-600 bg-red-50" },
};

export default function AdminOverviewPage() {
    const { user } = useAuthStore();
    const { selectedBranchId } = useAdminBranchStore();

    const { data: ordersData, isLoading: ordersLoading } = useQuery({
        queryKey: ["admin-orders-overview", selectedBranchId],
        queryFn: () => api.get("/orders/admin/queue", { params: { branch_id: selectedBranchId || undefined } }).then((r) => r.data),
        enabled: selectedBranchId !== null,
    });
    const { data: productsData } = useQuery({
        queryKey: ["admin-products-overview"],
        queryFn: () => api.get("/products?limit=100").then((r) => r.data),
    });
    const { data: inventoryData } = useQuery({
        queryKey: ["admin-inventory-overview", selectedBranchId],
        queryFn: () => api.get("/inventory", { params: { limit: 100, branch_id: selectedBranchId || undefined } }).then((r) => r.data),
        enabled: selectedBranchId !== null,
    });

    const orders = ordersData ?? [];
    const products = productsData?.items ?? [];
    const totalRevenue = orders
        .filter((o: any) => o.status === "delivered")
        .reduce((sum: number, o: any) => sum + o.total_kes, 0);

    const statusCounts: Record<string, number> = {};
    orders.forEach((o: any) => {
        statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    });

    // stock_status values from API are uppercase: "IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"
    const invItems = inventoryData?.items ?? [];
    const lowStockItems = invItems.filter(
        (i: any) => i.stock_status === "LOW_STOCK" || i.stock_status === "OUT_OF_STOCK"
    );

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">
                    Good {greeting}, {user?.full_name?.split(" ")[0]}
                </h1>
                <p className="text-gray-500 text-sm mt-0.5">Here's what's happening at Printex today.</p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Total Orders"
                    value={ordersLoading ? "—" : orders.length}
                    icon={ShoppingBag}
                    color="bg-blue-600"
                    sub="All time"
                />
                <StatCard
                    label="Revenue"
                    value={`KES ${(totalRevenue / 100).toLocaleString()}`}
                    icon={TrendingUp}
                    color="bg-green-600"
                    sub="From delivered orders"
                />
                <StatCard
                    label="Products"
                    value={products.length}
                    icon={ShoppingBag}
                    color="bg-purple-600"
                    sub="Active in catalogue"
                />
                <StatCard
                    label="Low Stock"
                    value={lowStockItems.length}
                    icon={AlertTriangle}
                    color={lowStockItems.length > 0 ? "bg-red-500" : "bg-gray-400"}
                    sub="Items needing restock"
                />
            </div>

            {/* Orders by status */}
            <div className="admin-card p-5">
                <h2 className="font-bold text-gray-900 mb-4">Orders by Status</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(STATUS_CONFIG).map(([status, { label, icon: Icon, color }]) => (
                        <div key={status} className={`flex items-center gap-3 p-3 rounded-xl ${color}`}>
                            <Icon size={16} />
                            <div>
                                <p className="text-xs font-medium">{label}</p>
                                <p className="text-xl font-bold">{statusCounts[status] || 0}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recent orders */}
            <div className="admin-card p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-gray-900">Recent Orders</h2>
                    <a href="/admin/orders" className="text-xs text-blue-600 hover:underline">View all</a>
                </div>
                {ordersLoading ? (
                    <div className="space-y-2">
                        {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-xl" />)}
                    </div>
                ) : orders.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No orders yet.</p>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {orders.slice(0, 8).map((order: any) => {
                            const cfg = STATUS_CONFIG[order.status];
                            return (
                                <div key={order.id} className="flex items-center justify-between py-3">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">{order.order_number}</p>
                                        <p className="text-xs text-gray-400">{order.items?.length} items</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <p className="text-sm font-bold text-gray-900">
                                            KES {(order.total_kes / 100).toLocaleString()}
                                        </p>
                                        {cfg && (
                                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${cfg.color}`}>
                                                {cfg.label}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Stock alerts */}
            {lowStockItems.length > 0 && (
                <div className="admin-card p-5 border border-red-200">
                    <h2 className="font-bold text-red-600 mb-4 flex items-center gap-2">
                        <AlertTriangle size={16} />
                        Stock Alerts ({lowStockItems.length})
                    </h2>
                    <div className="divide-y divide-gray-100">
                        {lowStockItems.slice(0, 8).map((item: any) => (
                            <div key={item.id} className="flex items-center justify-between py-3">
                                <p className="text-sm font-medium text-gray-800">{item.product?.name}</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-500">{item.quantity_on_hand} left</span>
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.stock_status === "OUT_OF_STOCK"
                                            ? "bg-red-100 text-red-600"
                                            : "bg-yellow-100 text-yellow-700"
                                        }`}>
                                        {item.stock_status === "OUT_OF_STOCK" ? "Out of stock" : "Low stock"}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
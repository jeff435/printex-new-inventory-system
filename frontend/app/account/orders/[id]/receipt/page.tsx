"use client";
import { useQuery } from "@tanstack/react-query";
import { ordersApi } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { Printer, ChevronLeft, ShoppingBag } from "lucide-react";

const fmt = (kes: number) => `KES ${kes.toLocaleString("en-KE")}`;

const PAYMENT_LABELS: Record<string, string> = {
    mpesa: "M-Pesa",
    card: "Card",
    cash: "Cash on Delivery",
    wallet: "Printex Wallet",
};

export default function ReceiptPage() {
    const params = useParams();
    const orderId = params.id as string;
    const { isAuthenticated, _hasHydrated } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        if (_hasHydrated && !isAuthenticated) router.push("/login");
    }, [_hasHydrated, isAuthenticated, router]);

    const { data: order, isLoading, isError } = useQuery({
        queryKey: ["order-receipt", orderId],
        queryFn: () => ordersApi.get(orderId).then((r) => r.data),
        enabled: isAuthenticated && !!orderId,
    });

    if (!_hasHydrated || isLoading) {
        return (
            <div className="max-w-xl mx-auto px-4 py-10">
                <div className="h-96 bg-gray-100 animate-pulse rounded-2xl" />
            </div>
        );
    }

    if (isError || !order) {
        return (
            <div className="max-w-xl mx-auto px-4 py-24 text-center">
                <p className="text-gray-500 mb-6">Receipt not found.</p>
                <Link href="/account/orders" className="text-sm text-[#2f8f4e] hover:underline font-medium">
                    Back to orders
                </Link>
            </div>
        );
    }

    const createdAt = order.created_at ? new Date(order.created_at) : null;

    return (
        <div className="max-w-xl mx-auto px-4 py-8 pb-16">
            {/* On-screen controls — hidden when printing */}
            <div className="flex items-center justify-between mb-5 print:hidden">
                <Link
                    href={`/account/orders/${orderId}`}
                    className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#2f8f4e] transition-colors"
                >
                    <ChevronLeft size={16} /> Back to order
                </Link>
                <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 bg-[#2f8f4e] hover:bg-[#14151a] text-[#14151a] text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                >
                    <Printer size={15} /> Print receipt
                </button>
            </div>

            {/* Printable receipt */}
            <div className="glass-panel p-8 print:shadow-none print:border-0 print:rounded-none">
                <div className="flex items-center justify-between border-b border-dashed border-gray-200 pb-5 mb-5">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 bg-[#2f8f4e] rounded-xl flex items-center justify-center">
                            <ShoppingBag size={18} className="text-[#14151a]" />
                        </div>
                        <div>
                            <p className="font-extrabold text-gray-900 leading-tight">Printex</p>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Printing Press Spare Parts, Nairobi</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-gray-400">Receipt</p>
                        <p className="font-bold text-gray-900">{order.order_number}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                    <div>
                        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Billed to</p>
                        <p className="font-medium text-gray-900">{order.user?.full_name}</p>
                        {order.user?.phone && <p className="text-gray-500 text-xs">{order.user.phone}</p>}
                        {order.user?.email && <p className="text-gray-500 text-xs">{order.user.email}</p>}
                    </div>
                    <div className="text-right">
                        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Date</p>
                        <p className="text-gray-900">
                            {createdAt ? createdAt.toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" }) : "—"}
                        </p>
                        <p className="text-gray-500 text-xs">
                            {createdAt ? createdAt.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" }) : ""}
                        </p>
                    </div>
                </div>

                {order.address && (
                    <div className="text-sm mb-6">
                        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Delivered to</p>
                        <p className="text-gray-700">
                            {order.address.street}, {order.address.area}
                            {order.address.city ? `, ${order.address.city}` : ""}
                        </p>
                    </div>
                )}

                {/* Items */}
                <table className="w-full text-sm mb-6">
                    <thead>
                        <tr className="border-b border-gray-200 text-gray-400 text-xs uppercase tracking-wide">
                            <th className="text-left font-medium pb-2">Item</th>
                            <th className="text-center font-medium pb-2">Qty</th>
                            <th className="text-right font-medium pb-2">Price</th>
                            <th className="text-right font-medium pb-2">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {order.items?.map((item: any) => (
                            <tr key={item.id} className="border-b border-gray-100">
                                <td className="py-2.5 text-gray-800 pr-2">{item.product?.name ?? "Item"}</td>
                                <td className="py-2.5 text-center text-gray-600">{item.quantity}</td>
                                <td className="py-2.5 text-right text-gray-600">{fmt(item.unit_price_kes)}</td>
                                <td className="py-2.5 text-right font-medium text-gray-900">{fmt(item.total_price_kes)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Totals */}
                <div className="space-y-1.5 text-sm mb-6 ml-auto max-w-[220px]">
                    <div className="flex justify-between text-gray-500">
                        <span>Subtotal</span>
                        <span>{fmt(order.subtotal_kes)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                        <span>Delivery fee</span>
                        <span>{fmt(order.delivery_fee_kes)}</span>
                    </div>
                    {order.discount_kes > 0 && (
                        <div className="flex justify-between text-gray-500">
                            <span>Discount</span>
                            <span>-{fmt(order.discount_kes)}</span>
                        </div>
                    )}
                    {order.loyalty_discount_kes > 0 && (
                        <div className="flex justify-between text-gray-500">
                            <span>Loyalty points</span>
                            <span>-{fmt(order.loyalty_discount_kes)}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-gray-900 text-base pt-1.5 border-t border-gray-200">
                        <span>Total</span>
                        <span>{fmt(order.total_kes)}</span>
                    </div>
                </div>

                <div className="flex items-center justify-between text-xs bg-gray-50 rounded-xl px-4 py-3 mb-2">
                    <span className="text-gray-500">Payment method</span>
                    <span className="font-medium text-gray-800">
                        {order.payment_method ? (PAYMENT_LABELS[order.payment_method] ?? order.payment_method) : "—"}
                    </span>
                </div>
                <div className="flex items-center justify-between text-xs bg-gray-50 rounded-xl px-4 py-3">
                    <span className="text-gray-500">Payment status</span>
                    <span className="font-medium text-gray-800 capitalize">{order.payment_status}</span>
                </div>

                <p className="text-center text-xs text-gray-400 mt-8">
                    Thank you for choosing Printex Engineers 🔧 — keep this receipt for your records.
                </p>
            </div>
        </div>
    );
}
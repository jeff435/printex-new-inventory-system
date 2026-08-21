"use client";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCartStore, useAuthStore, usePreferredBranchStore } from "@/stores";
import { ordersApi, paymentsApi, authApi, loyaltyApi, api } from "@/lib/api";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Star, Wallet } from "lucide-react";
import LocationSearch from "@/components/ui/LocationSearch";


export default function CheckoutPage() {
    const router = useRouter();
    const { items, totalKes, clearCart } = useCartStore();
    const { user, isAuthenticated, _hasHydrated } = useAuthStore();

    const { data: branches } = useQuery({
        queryKey: ["checkout-branches"],
        queryFn: () => api.get("/branches").then((r) => r.data as { id: string; name: string; is_active: boolean }[]),
    });
    const { preferredBranchId, preferredBranchName } = usePreferredBranchStore();
    const branchStillValid = branches?.some((b) => b.id === preferredBranchId && b.is_active);
    const activeBranchId = branchStillValid ? preferredBranchId : branches?.find((b) => b.is_active)?.id;

    const [mounted, setMounted] = useState(false);
    const [phone, setPhone] = useState("");
    const [street, setStreet] = useState("");
    const [area, setArea] = useState("");
    const [fullName, setFullName] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("cash_on_delivery");
    const [slotDate, setSlotDate] = useState("");
    const [minDate, setMinDate] = useState("");
    const [loading, setLoading] = useState(false);
    const [polling, setPolling] = useState(false);
    const [usePoints, setUsePoints] = useState(false);
    const [pointsToRedeem, setPointsToRedeem] = useState(0);

    const { data: loyaltyAccount } = useQuery({
        queryKey: ["loyalty-account"],
        queryFn: () => loyaltyApi.account().then(r => r.data),
        enabled: isAuthenticated,
    });

    const { data: walletData } = useQuery({
        queryKey: ["wallet"],
        queryFn: () => api.get("/wallet/balance").then(r => r.data),
        enabled: isAuthenticated,
    });

    useEffect(() => {
        setMounted(true);
        setMinDate(new Date().toISOString().split("T")[0]);
    }, []);

    useEffect(() => {
        if (user?.full_name) setFullName(user.full_name);
        if (user?.phone) setPhone(user.phone.replace("+254", "0"));
    }, [user]);

    useEffect(() => {
        if (mounted && _hasHydrated && !isAuthenticated) router.push("/login");
    }, [mounted, _hasHydrated, isAuthenticated, router]);

    useEffect(() => {
        if (usePoints && loyaltyAccount) {
            const maxByBalance = loyaltyAccount.points_balance;
            const maxByOrder = Math.floor(totalKes() / 50);
            setPointsToRedeem(Math.min(maxByBalance, maxByOrder));
        } else {
            setPointsToRedeem(0);
        }
    }, [usePoints, loyaltyAccount]);

    const DELIVERY_FEE = 200;
    const subtotal = totalKes() / 100;
    const pointsDiscount = usePoints ? (pointsToRedeem * 50) / 100 : 0;
    const total = Math.max(0, subtotal + DELIVERY_FEE - pointsDiscount);
    const totalCents = Math.round(total * 100);
    const walletBalance = walletData?.balance_kes ?? 0;
    const walletSufficient = walletBalance >= totalCents;

    if (!mounted || !_hasHydrated) return null;
    if (!isAuthenticated) return null;

    if (items.length === 0) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-20 text-center">
                <p className="text-[#6b7078] text-lg mb-4">Your cart is empty.</p>
                <button onClick={() => router.push("/products")} className="glass-btn px-6 py-3 rounded-xl text-sm">
                    Browse Products
                </button>
            </div>
        );
    }

    const handlePlaceOrder = async () => {
        if (!street.trim() || !area.trim()) { toast.error("Please fill in your street and area"); return; }
        if (!fullName.trim()) { toast.error("Please enter your full name"); return; }
        if (!activeBranchId) { toast.error("No branch available to fulfil your order right now. Please try again shortly."); return; }
        if (paymentMethod === "wallet" && !walletSufficient) {
            toast.error(`Insufficient wallet balance. You have KES ${(walletBalance / 100).toLocaleString()}, need KES ${total.toLocaleString()}`);
            return;
        }
        setLoading(true);
        try {
            const addrRes = await authApi.addAddress({
                label: "Home", full_name: fullName, phone, street, area,
                city: "Nairobi", county: "Nairobi", is_default: true,
            });
            const addressId = addrRes.data.id;
            const orderRes = await ordersApi.create({
                branch_id: activeBranchId, address_id: addressId,
                items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
                delivery_type: "home_delivery", payment_method: paymentMethod,
                delivery_slot_date: slotDate || undefined,
                loyalty_points_to_use: usePoints ? pointsToRedeem : 0,
            });
            const order = orderRes.data;
            if (paymentMethod === "mpesa") {
                const mpesaPhone = phone.startsWith("0") ? "254" + phone.slice(1) : phone.replace("+", "");
                const payRes = await paymentsApi.mpesaStk(order.id, mpesaPhone);
                const checkoutId = payRes.data.checkout_request_id;
                toast.success("STK push sent! Enter your M-Pesa PIN.");
                setPolling(true); setLoading(false);
                let attempts = 0;
                const interval = setInterval(async () => {
                    attempts++;
                    try {
                        const statusRes = await paymentsApi.mpesaStatus(checkoutId);
                        if (statusRes.data.status === "success") {
                            clearInterval(interval); setPolling(false); clearCart();
                            toast.success("Payment confirmed!"); router.push("/account/orders");
                        } else if (statusRes.data.status === "failed") {
                            clearInterval(interval); setPolling(false); toast.error("Payment failed. Try again.");
                        }
                    } catch { }
                    if (attempts >= 12) { clearInterval(interval); setPolling(false); clearCart(); router.push("/account/orders"); }
                }, 5000);
            } else if (paymentMethod === "card") {
                const cardRes = await paymentsApi.cardInitiate(order.id, `${window.location.origin}/checkout/callback`);
                clearCart();
                window.location.href = cardRes.data.payment_link;
            } else if (paymentMethod === "wallet") {
                await api.post("/wallet/pay", { order_id: order.id, amount_kes: totalCents });
                clearCart(); toast.success("Paid with wallet. Order confirmed!"); router.push("/account/orders");
            } else {
                clearCart(); toast.success("Order placed! Pay on delivery."); router.push("/account/orders");
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to place order");
            setLoading(false);
        }
    };

    const paymentOptions = [
        { id: "mpesa", label: "M-Pesa", desc: "STK push to your phone" },
        { id: "card", label: "Card", desc: "Visa / Mastercard" },
        {
            id: "wallet", label: "Printex Wallet",
            desc: walletData ? `Balance: ${walletData.balance_display}${!walletSufficient ? " — insufficient" : ""}` : "Loading...",
            disabled: !walletSufficient,
        },
        { id: "cash_on_delivery", label: "Cash on Delivery", desc: "Pay when order arrives" },
    ];

    const inputClass = "w-full px-3 py-2 bg-[#f0f1f3] border border-[#e6e8eb] rounded-lg text-sm text-[#14151a] focus:outline-none focus:ring-2 focus:ring-[#2f8f4e]/20 focus:bg-[#f0f1f3] transition-all placeholder:text-[#9ca0a8]";
    const labelClass = "text-sm font-medium text-[#14151a]/85 block mb-1";

    return (
        <div className="max-w-5xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold text-[#14151a] mb-6 drop-shadow">Checkout</h1>
            <div className="grid md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-5">

                    {/* Delivery details */}
                    <div className="glass-panel rounded-2xl p-5">
                        <h2 className="font-bold text-[#14151a] mb-4">Delivery Details</h2>
                        {preferredBranchName && (
                            <div className="mb-4 flex items-center gap-2 text-xs text-[#6b7078] bg-[#f8f9fa] border border-[#e6e8eb] rounded-lg px-3 py-2">
                                <span>Fulfilled from <span className="text-[#14151a] font-medium">{preferredBranchName}</span> — change branch from the picker in the navbar above</span>
                            </div>
                        )}
                        <div className="space-y-3">
                            <div>
                                <label className={labelClass}>Full Name</label>
                                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} placeholder="Jane Wanjiku" />
                            </div>
                            <div>
                                <label className={labelClass}>Street / Building *</label>
                                <LocationSearch
                                    streetValue={street}
                                    areaValue={area}
                                    onSelect={(s, a) => { setStreet(s); setArea(a); }}
                                />
                            </div>
                            {area && (
                                <div>
                                    <label className={labelClass}>Area (auto-filled)</label>
                                    <input value={area} onChange={(e) => setArea(e.target.value)} className={inputClass} placeholder="e.g. Westlands" />
                                </div>
                            )}
                            {!area && (
                                <div>
                                    <label className={labelClass}>Area *</label>
                                    <input value={area} onChange={(e) => setArea(e.target.value)} className={inputClass} placeholder="e.g. Westlands" />
                                </div>
                            )}
                            <div>
                                <label className={labelClass}>Preferred Delivery Date</label>
                                {mounted ? (
                                    <input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} min={minDate} className={inputClass} />
                                ) : (
                                    <input type="date" disabled className={`${inputClass} opacity-0`} />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Payment method */}
                    <div className="glass-panel rounded-2xl p-5">
                        <h2 className="font-bold text-[#14151a] mb-4">Payment Method</h2>
                        <div className="space-y-3">
                            {paymentOptions.map((m) => (
                                <label
                                    key={m.id}
                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${m.disabled
                                        ? "opacity-50 cursor-not-allowed border-[#e6e8eb] bg-[#f8f9fa]"
                                        : paymentMethod === m.id
                                            ? "border-[#cce8d4]/60 bg-[#eaf6ee] shadow-sm"
                                            : "border-[#e6e8eb] bg-[#f8f9fa] hover:bg-[#f0f1f3]"
                                        }`}
                                >
                                    <input
                                        type="radio" name="payment" value={m.id}
                                        checked={paymentMethod === m.id}
                                        onChange={() => !m.disabled && setPaymentMethod(m.id)}
                                        disabled={m.disabled}
                                        className="accent-blue-400"
                                    />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-[#14151a] flex items-center gap-1.5">
                                            {m.id === "wallet" && <Wallet size={13} className="text-[#2f8f4e]" />}
                                            {m.label}
                                        </p>
                                        <p className={`text-xs ${m.disabled ? "text-red-400" : "text-[#9ca0a8]"}`}>{m.desc}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                        {paymentMethod === "mpesa" && (
                            <div className="mt-4">
                                <label className={labelClass}>M-Pesa Phone Number</label>
                                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="0712345678" />
                            </div>
                        )}
                    </div>

                    {/* Loyalty points */}
                    {loyaltyAccount && loyaltyAccount.points_balance >= 100 && (
                        <div className="glass-panel rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="font-bold text-[#14151a] flex items-center gap-2">
                                    <Star size={16} className="text-yellow-400" fill="currentColor" />
                                    Loyalty Points
                                </h2>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-[#9ca0a8]">{loyaltyAccount.points_balance.toLocaleString()} pts</span>
                                    <button
                                        onClick={() => setUsePoints(!usePoints)}
                                        className={`relative w-10 h-5 rounded-full transition-colors ${usePoints ? "bg-[#2f8f4e]" : "bg-white/20"}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${usePoints ? "translate-x-5" : ""}`} />
                                    </button>
                                </div>
                            </div>
                            {usePoints && pointsToRedeem >= 100 && (
                                <p className="text-sm text-green-400 font-medium">
                                    You save KES {pointsDiscount.toLocaleString()} with {pointsToRedeem.toLocaleString()} points
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Order summary */}
                <div>
                    <div className="glass-panel rounded-2xl p-5 sticky top-20">
                        <h2 className="font-bold text-[#14151a] mb-4">Order Summary</h2>
                        <div className="space-y-2 mb-4">
                            {items.map((item) => (
                                <div key={item.product_id} className="flex justify-between text-sm text-[#6b7078]">
                                    <span className="truncate mr-2">{item.name} ×{item.quantity}</span>
                                    <span className="flex-shrink-0">KES {(item.price_kes * item.quantity / 100).toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                        <div className="border-t border-[#e6e8eb] pt-3 space-y-2 text-sm">
                            <div className="flex justify-between text-[#6b7078]">
                                <span>Subtotal</span><span>KES {subtotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-[#6b7078]">
                                <span>Delivery</span><span>KES {DELIVERY_FEE}</span>
                            </div>
                            {pointsDiscount > 0 && (
                                <div className="flex justify-between text-green-400 font-medium">
                                    <span className="flex items-center gap-1"><Star size={12} fill="currentColor" />Points discount</span>
                                    <span>- KES {pointsDiscount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-[#14151a] text-base pt-2 border-t border-[#e6e8eb]">
                                <span>Total</span><span>KES {total.toLocaleString()}</span>
                            </div>
                        </div>
                        <button
                            onClick={handlePlaceOrder}
                            disabled={loading || polling}
                            className="w-full mt-5 glass-btn disabled:opacity-60 py-3 rounded-xl text-sm"
                        >
                            {polling ? "Waiting for M-Pesa..." : loading ? "Processing..." : `Place Order — KES ${total.toLocaleString()}`}
                        </button>
                        {polling && <p className="text-center text-xs text-[#9ca0a8] mt-3">Check your phone for the M-Pesa prompt.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}
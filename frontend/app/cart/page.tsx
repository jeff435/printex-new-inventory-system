"use client";
import { useCartStore, useAuthStore } from "@/stores";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CartPage() {
  const router = useRouter();
  const { items, updateQuantity, removeItem, totalKes } = useCartStore();
  const { isAuthenticated } = useAuthStore();

  const DELIVERY_FEE = 200;
  const subtotal = totalKes() / 100;
  const total = subtotal + DELIVERY_FEE;

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <ShoppingBag size={64} className="text-gray-300 mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-[#14151a] mb-2">Your cart is empty</h1>
        <p className="text-[#6b7078] mb-8">Add some products to get started.</p>
        <Link href="/products" className="inline-block glass-btn px-8 py-3 rounded-xl text-sm">
          Browse Products
        </Link>
      </div>
    );
  }

  const handleCheckout = () => {
    if (!isAuthenticated) {
      router.push("/login?next=/checkout");
      return;
    }
    router.push("/checkout");
  };

  return (
    <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold text-[#14151a] mb-7">Your Cart</h1>
      <div className="grid md:grid-cols-3 gap-8">
        {/* Items */}
        <div className="md:col-span-2 space-y-3">
          {items.map((item) => (
            <div key={item.product_id} className="v2-card rounded-2xl p-4 sm:p-5 flex gap-4 items-center">
              <div className="w-16 h-16 rounded-lg bg-[#f0f1f3] flex-shrink-0 overflow-hidden border border-[#e6e8eb]">
                {item.thumbnail_url ? (
                  <img src={item.thumbnail_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">🔧</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#14151a] line-clamp-2">{item.name}</p>
                {item.unit && <p className="text-xs text-[#9ca0a8]">{item.unit}</p>}
                <p className="text-sm font-bold text-[#14151a] mt-1">
                  KES {(item.price_kes * item.quantity / 100).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                  className="w-8 h-8 rounded-full bg-white/70 border border-[#e6e8eb] hover:bg-white flex items-center justify-center transition-colors shadow-sm"
                >
                  <Minus size={13} />
                </button>
                <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                  className="w-8 h-8 rounded-full bg-[#14151a] text-white flex items-center justify-center"
                >
                  <Plus size={13} />
                </button>
                <button
                  onClick={() => removeItem(item.product_id)}
                  className="ml-1 w-8 h-8 rounded-full hover:bg-red-50 flex items-center justify-center text-[#9ca0a8] hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div>
          <div className="v2-card rounded-2xl p-6 sticky top-24">
            <h2 className="font-bold text-[#14151a] mb-4">Order Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-[#6b7078]">
                <span>Subtotal ({items.length} items)</span>
                <span>KES {subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[#6b7078]">
                <span>Delivery fee</span>
                <span>KES {DELIVERY_FEE}</span>
              </div>
              <div className="border-t border-white/60 pt-2 mt-2 flex justify-between font-bold text-[#14151a]">
                <span>Total</span>
                <span>KES {total.toLocaleString()}</span>
              </div>
            </div>
            <button
              onClick={handleCheckout}
              className="w-full mt-6 v2-btn-primary py-3.5 rounded-xl text-sm"
            >
              Proceed to Checkout
            </button>
            <Link href="/products" className="block text-center text-sm text-[#2f8f4e] hover:underline mt-3">
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { paymentsApi } from "@/lib/api";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

function CallbackContent() {
    const params = useSearchParams();
    const [state, setState] = useState<"verifying" | "success" | "failed" | "cancelled">("verifying");
    const [orderId, setOrderId] = useState<string | null>(null);

    useEffect(() => {
        const status = params.get("status");
        const transactionId = params.get("transaction_id");

        if (status === "cancelled" || !transactionId) {
            setState("cancelled");
            return;
        }

        paymentsApi
            .cardVerify(transactionId)
            .then(({ data }) => {
                setOrderId(data.order_id);
                setState(data.status === "success" ? "success" : "failed");
            })
            .catch(() => setState("failed"));
    }, [params]);

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="glass-card p-8 max-w-sm w-full text-center">
                {state === "verifying" && (
                    <>
                        <Loader2 size={40} className="animate-spin text-white mx-auto mb-4" />
                        <h1 className="text-lg font-bold text-white mb-1">Confirming your payment...</h1>
                        <p className="text-sm text-white/60">This only takes a moment.</p>
                    </>
                )}
                {state === "success" && (
                    <>
                        <CheckCircle size={40} className="text-green-400 mx-auto mb-4" />
                        <h1 className="text-lg font-bold text-white mb-1">Payment successful!</h1>
                        <p className="text-sm text-white/60 mb-6">Your order is confirmed and being prepared.</p>
                        <Link
                            href={orderId ? `/account/orders/${orderId}` : "/account/orders"}
                            className="glass-btn w-full py-3 text-sm inline-block"
                        >
                            View order
                        </Link>
                    </>
                )}
                {state === "failed" && (
                    <>
                        <XCircle size={40} className="text-red-400 mx-auto mb-4" />
                        <h1 className="text-lg font-bold text-white mb-1">Payment failed</h1>
                        <p className="text-sm text-white/60 mb-6">
                            We couldn&apos;t confirm your card payment. No charge was completed on our side — please try again.
                        </p>
                        <Link href="/account/orders" className="glass-btn w-full py-3 text-sm inline-block">
                            Go to my orders
                        </Link>
                    </>
                )}
                {state === "cancelled" && (
                    <>
                        <XCircle size={40} className="text-white/50 mx-auto mb-4" />
                        <h1 className="text-lg font-bold text-white mb-1">Payment cancelled</h1>
                        <p className="text-sm text-white/60 mb-6">
                            You cancelled the checkout. Your order is still saved — you can pay again anytime.
                        </p>
                        <Link href="/account/orders" className="glass-btn w-full py-3 text-sm inline-block">
                            Go to my orders
                        </Link>
                    </>
                )}
            </div>
        </div>
    );
}

export default function CheckoutCallbackPage() {
    return (
        <Suspense>
            <CallbackContent />
        </Suspense>
    );
}
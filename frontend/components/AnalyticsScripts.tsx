"use client";
import { useEffect, useState } from "react";
import Script from "next/script";
import { getConsent, onConsentChange } from "@/lib/cookieConsent";

// Set these via env vars once you have real IDs.
// NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXX
// NEXT_PUBLIC_META_PIXEL_ID=XXXXXXXXXX
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export default function AnalyticsScripts() {
    const [analyticsAllowed, setAnalyticsAllowed] = useState(false);
    const [marketingAllowed, setMarketingAllowed] = useState(false);

    useEffect(() => {
        const consent = getConsent();
        if (consent) {
            setAnalyticsAllowed(consent.analytics);
            setMarketingAllowed(consent.marketing);
        }
        const unsubscribe = onConsentChange((c) => {
            setAnalyticsAllowed(c.analytics);
            setMarketingAllowed(c.marketing);
        });
        return unsubscribe;
    }, []);

    return (
        <>
            {analyticsAllowed && GA_ID && (
                <>
                    <Script
                        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
                        strategy="afterInteractive"
                    />
                    <Script id="ga-init" strategy="afterInteractive">
                        {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { anonymize_ip: true });
            `}
                    </Script>
                </>
            )}

            {marketingAllowed && META_PIXEL_ID && (
                <Script id="meta-pixel-init" strategy="afterInteractive">
                    {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
                </Script>
            )}
        </>
    );
}
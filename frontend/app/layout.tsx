import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import "./globals-v2.css";
import { Providers } from "@/components/Providers";
import ConditionalShell from "@/components/ConditionalShell";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import AnalyticsScripts from "@/components/AnalyticsScripts";
import ChatWidget from "@/components/chat/ChatWidget";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Printex Engineers — Printing Press Spare Parts",
  description: "Genuine printing press spare parts — valves, cylinders, bearings, grippers and more — in stock in Nairobi.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${fraunces.variable} ${inter.className} min-h-screen flex flex-col`}>
        <Providers>
          <ConditionalShell>{children}</ConditionalShell>
          <CookieConsentBanner />
          <AnalyticsScripts />
          <ChatWidget />
        </Providers>
      </body>
    </html>
  );
}
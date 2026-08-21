import Link from "next/link";
import { ArrowRight, ShieldCheck, Truck, Sparkles } from "lucide-react";

const VALUES = [
  { icon: Truck, title: "Fast turnaround", text: "Genuine spare parts dispatched quickly from our Nairobi workshop." },
  { icon: ShieldCheck, title: "Secure checkout", text: "A simple, secure checkout experience with trusted payment options." },
  { icon: Sparkles, title: "Parts you can trust", text: "134+ parts across valves, cylinders, grippers, bearings and more — accurately catalogued from our workshop register." },
];

export default function AboutPage() {
  return (
    <div className="v2-page">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-10 lg:py-16">
        <div className="v2-card overflow-hidden p-7 sm:p-10 lg:p-14">
          <span className="v2-badge-accent mb-5">About Printex</span>
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight mb-5">Printing press spare parts, sourced right.</h1>
            <p className="text-lg text-[#6b7078] leading-relaxed">Printex Engineers stocks genuine spare parts for offset printing presses — valves, cylinders, bellows, grippers, bearings, springs and more — from our Nairobi workshop, with an online catalogue built around the way our customers actually order.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-10">
            {VALUES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl bg-[#f5f6f8] border border-[#e6e8eb] p-5">
                <Icon size={20} className="text-[#2f8f4e] mb-4" />
                <h2 className="font-bold mb-1.5">{title}</h2>
                <p className="text-sm text-[#6b7078] leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
          <Link href="/products" className="v2-btn-primary mt-8">Start shopping <ArrowRight size={17} /></Link>
        </div>
      </div>
    </div>
  );
}

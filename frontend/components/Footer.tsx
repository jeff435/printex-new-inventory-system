"use client";
import Link from "next/link";
import { MapPin, Phone, Mail } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-12 border-t border-[#e6e8eb] bg-white text-[#6b7078]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pb-8">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="text-2xl font-extrabold tracking-tight text-[#14151a] block mb-3">PRINTEX</Link>
            <p className="text-sm leading-relaxed max-w-xs">Genuine printing press spare parts — valves, cylinders, bearings, grippers and more — supplied from our Nairobi workshop.</p>
          </div>
          <div>
            <h4 className="text-sm font-bold text-[#14151a] mb-4">Parts</h4>
            <ul className="space-y-2.5 text-sm"><li><Link href="/products" className="hover:text-[#14151a]">All Parts</Link></li><li><Link href="/products?is_online_exclusive=true" className="hover:text-[#14151a]">Deals</Link></li><li><Link href="/cart" className="hover:text-[#14151a]">My Cart</Link></li></ul>
          </div>
          <div>
            <h4 className="text-sm font-bold text-[#14151a] mb-4">Account</h4>
            <ul className="space-y-2.5 text-sm"><li><Link href="/account/orders" className="hover:text-[#14151a]">My Orders</Link></li><li><Link href="/account/loyalty" className="hover:text-[#14151a]">Loyalty</Link></li><li><Link href="/account/wallet" className="hover:text-[#14151a]">Wallet</Link></li><li><Link href="/login" className="hover:text-[#14151a]">Sign In</Link></li></ul>
          </div>
          <div>
            <h4 className="text-sm font-bold text-[#14151a] mb-4">Contact</h4>
            <ul className="space-y-3 text-sm"><li className="flex gap-2"><MapPin size={15} className="mt-0.5 text-[#2f8f4e]" /><span>Nairobi, Kenya</span></li><li className="flex gap-2"><Phone size={15} className="text-[#2f8f4e]" /><a href="tel:+254700000000">+254 700 000 000</a></li><li className="flex gap-2"><Mail size={15} className="text-[#2f8f4e]" /><a href="mailto:hello@printexengineers.co.ke">hello@printexengineers.co.ke</a></li></ul>
          </div>
        </div>
        <div className="border-t border-[#e6e8eb] pt-5 flex flex-col sm:flex-row justify-between gap-3 text-xs">
          <p>© {new Date().getFullYear()} Printex Engineers. All rights reserved.</p>
          <div className="flex gap-4"><a href="#" className="hover:text-[#14151a]">Privacy Policy</a><a href="#" className="hover:text-[#14151a]">Terms</a><a href="#" className="hover:text-[#14151a]">About Us</a></div>
        </div>
      </div>
    </footer>
  );
}

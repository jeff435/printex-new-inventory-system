"use client";
import Link from "next/link";
import { ArrowRight, Truck, ShieldCheck, Package, ChevronLeft, ChevronRight, Settings2, Grip, Gauge } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Slides map to the real register categories in printex_parts.json (columns
// A–F). No stock photography is used here — the source Soko skeleton shipped
// with grocery product photos only, none of which fit a parts catalogue, so
// each slide gets an icon-based composition instead of a mismatched image.
const SLIDES = [
    {
        category: "Valves, Cylinders & Pistons",
        badge: "Column A · In Stock",
        headline: "Genuine press parts,",
        accent: "sourced right.",
        sub: "Control, vibrator, solenoid and pneumatic valves, cylinders and pistons for offset presses.",
        tag: "GENUINE",
        icon: Gauge,
    },
    {
        category: "Grippers, Pins & Blanket Hooks",
        badge: "Column E · In Stock",
        headline: "Grippers, pins",
        accent: "and blanket hooks.",
        sub: "Gripper tips, tapered pins, guide pins and blanket hooks — catalogued straight from our workshop register.",
        tag: "IN STOCK",
        icon: Grip,
    },
    {
        category: "Cam Followers & Bearings",
        badge: "Column D · In Stock",
        headline: "Cam followers,",
        accent: "bearings & more.",
        sub: "Cam followers, one-way bearings and needle roller bearings for printing press maintenance.",
        tag: "134 PARTS",
        icon: Settings2,
    },
];

const PERKS = [
    { icon: Truck, label: "Fast Dispatch", sub: "From our Nairobi workshop" },
    { icon: ShieldCheck, label: "Secure Payments", sub: "100% secure checkout" },
    { icon: Package, label: "Genuine Parts", sub: "Sourced and verified" },
];

const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 24 : -24, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -24 : 24, opacity: 0 }),
};

export function HeroCarouselV2() {
    const [current, setCurrent] = useState(0);
    const [direction, setDirection] = useState(1);
    const [paused, setPaused] = useState(false);

    const go = useCallback((idx: number, dir: number) => {
        setDirection(dir);
        setCurrent(idx);
    }, []);
    const next = useCallback(() => go((current + 1) % SLIDES.length, 1), [current, go]);
    const prev = useCallback(() => go((current - 1 + SLIDES.length) % SLIDES.length, -1), [current, go]);

    useEffect(() => {
        if (paused) return;
        const t = setInterval(next, 5000);
        return () => clearInterval(t);
    }, [next, paused]);

    const slide = SLIDES[current];

    return (
        <div className="v2-hero" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
            <div className="relative grid lg:grid-cols-[52%_48%] lg:min-h-[400px]">
                <div className="relative z-10 flex flex-col justify-center px-8 sm:px-10 lg:px-12 py-8">
                    <AnimatePresence mode="wait" custom={direction}>
                        <motion.div
                            key={current}
                            custom={direction}
                            variants={slideVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.3, ease: "easeOut" }}
                        >
                            <span className="v2-badge-accent mb-5 inline-flex text-xs sm:text-sm px-3 py-1.5 shadow-[0_5px_18px_rgba(47,143,78,.08)]">
                                <span aria-hidden>⚙️</span> {slide.badge}
                            </span>
                            <h1 className="text-3xl sm:text-4xl xl:text-[2.55rem] font-extrabold leading-[1.12] tracking-[-0.035em] text-[var(--v2-text)] mb-4">
                                <span className="whitespace-nowrap">{slide.headline}</span><br />
                                <span className="text-[var(--v2-accent)] whitespace-nowrap">{slide.accent}</span>
                            </h1>
                            <p className="text-[var(--v2-text-muted)] text-sm sm:text-base mb-6 max-w-[400px] leading-relaxed">
                                {slide.sub}
                            </p>
                        </motion.div>
                    </AnimatePresence>

                    <div className="flex flex-wrap gap-3 mb-7">
                        <Link href="/products" className="v2-btn-primary text-sm sm:text-base pl-6 pr-3 py-3 shadow-[0_8px_22px_rgba(20,21,26,.15)]">
                            Shop Parts
                            <span className="v2-cta-arrow">
                                <ArrowRight size={15} />
                            </span>
                        </Link>
                        <Link href="/products?is_online_exclusive=true" className="v2-btn-secondary text-sm sm:text-base px-6 py-3">
                            Browse Catalogue
                        </Link>
                    </div>

                    <div className="flex items-center flex-wrap gap-y-3">
                        {PERKS.map(({ icon: Icon, label, sub }, i) => (
                            <div key={label} className="flex items-center">
                                {i > 0 && <span aria-hidden className="w-px h-9 bg-[var(--v2-border)] mx-3.5 xl:mx-4" />}
                                <div className="flex items-center gap-2.5">
                                    <Icon size={20} strokeWidth={1.75} className="text-[var(--v2-text)]" />
                                    <div className="leading-tight">
                                        <p className="text-xs sm:text-sm font-semibold text-[var(--v2-text)]">{label}</p>
                                        <p className="text-[10px] sm:text-xs text-[var(--v2-text-faint)]">{sub}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="relative overflow-hidden h-56 sm:h-72 lg:h-auto lg:min-h-0 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`icon-${current}`}
                            initial={{ opacity: 0, scale: 0.94 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.94 }}
                            transition={{ duration: 0.45, ease: "easeOut" }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <div
                                className="w-40 h-40 sm:w-56 sm:h-56 lg:w-64 lg:h-64 rounded-full flex items-center justify-center"
                                style={{ background: "radial-gradient(circle at 35% 28%, var(--v2-accent-bg) 0%, transparent 70%)" }}
                            >
                                <slide.icon size={96} strokeWidth={1.1} className="text-[var(--v2-accent)] opacity-80" />
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/40 to-transparent w-1/4" />
                        </motion.div>
                    </AnimatePresence>

                    <div className="absolute bottom-5 right-5 sm:bottom-12 sm:right-12 lg:right-14 w-16 h-16 sm:w-24 sm:h-24 lg:w-[104px] lg:h-[104px] rounded-full text-white flex flex-col items-center justify-center text-center shadow-[0_10px_28px_rgba(31,107,57,.35)] z-20 leading-none border-[3px] border-white p-2" style={{ background: "radial-gradient(circle at 35% 28%, #7fc08f 0%, var(--v2-accent) 55%, #1f6b39 100%)" }}>
                        <span className="text-[9px] sm:text-xs lg:text-sm font-extrabold tracking-wide">{slide.tag}</span>
                    </div>

                </div>
            </div>

            {/* Arrows belong to the hero, not the image column — nested inside the
                right-hand column they landed in the middle of the hero instead of
                on its outer edges. */}
            <button onClick={prev} aria-label="Previous slide" className="v2-carousel-arrow left-3 top-1/2 -translate-y-1/2">
                <ChevronLeft size={18} />
            </button>
            <button onClick={next} aria-label="Next slide" className="v2-carousel-arrow right-3 top-1/2 -translate-y-1/2">
                <ChevronRight size={18} />
            </button>

            <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-30 flex justify-center gap-1.5">
                {SLIDES.map((_, i) => (
                    <button key={i} onClick={() => go(i, i > current ? 1 : -1)} aria-label={`Go to slide ${i + 1}`} className={`transition-all duration-300 rounded-full ${i === current ? "w-5 h-1.5 bg-[var(--v2-text)]" : "w-1.5 h-1.5 bg-[#cbd0d6]"}`} />
                ))}
            </div>
        </div>
    );
}
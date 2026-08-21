"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOnClickOutside } from "usehooks-ts";
import { api } from "@/lib/api";
import { usePreferredBranchStore } from "@/stores";
import { MapPin, Check, ChevronDown } from "lucide-react";

type Branch = { id: string; name: string; area: string | null; is_active: boolean };

/**
 * Light-themed "Deliver to" branch picker for NavbarV2.
 * Same data source and persisted store as the original BranchSelector —
 * only the visual treatment changes (dark dropdown -> white card).
 */
export default function BranchSelectorV2() {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const { preferredBranchId, preferredBranchName, setPreferredBranch } = usePreferredBranchStore();

    const { data: branches, isLoading } = useQuery({
        queryKey: ["storefront-branches"],
        queryFn: () => api.get("/branches").then((r) => r.data as Branch[]),
    });

    const activeBranches = (branches ?? []).filter((b) => b.is_active);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (isLoading || activeBranches.length === 0) return;
        const stillValid = activeBranches.some((b) => b.id === preferredBranchId);
        if (!stillValid) {
            setPreferredBranch(activeBranches[0].id, activeBranches[0].name);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, branches]);

    useOnClickOutside(ref as React.RefObject<HTMLElement>, () => setOpen(false));

    if (!mounted || isLoading) {
        return (
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-[var(--v2-text-faint)]">
                <MapPin size={14} />
                <span>Loading...</span>
            </div>
        );
    }

    if (activeBranches.length === 0) {
        return (
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-[var(--v2-text-faint)]">
                <MapPin size={14} />
                <span>No branches available</span>
            </div>
        );
    }

    return (
        <div className="relative hidden lg:block" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1 text-left hover:bg-[var(--v2-surface-muted)] rounded-lg px-2 py-1 transition-colors"
            >
                <MapPin size={14} className="text-[var(--v2-text-faint)]" />
                <span className="flex flex-col leading-tight">
                    <span className="text-[10px] text-[var(--v2-text-faint)]">Deliver to</span>
                    <span className="text-xs font-semibold text-[var(--v2-text)] max-w-[110px] truncate">
                        {preferredBranchName ?? "Select branch"}
                    </span>
                </span>
                <ChevronDown size={12} className={`text-[var(--v2-text-faint)] transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="absolute left-0 top-full mt-2 w-60 v2-card py-1 z-50">
                    <div className="px-4 py-2 border-b border-[var(--v2-border)]">
                        <p className="text-xs font-semibold text-[var(--v2-text-faint)] uppercase tracking-wide">Order from</p>
                    </div>
                    {activeBranches.map((b) => (
                        <button
                            key={b.id}
                            onClick={() => {
                                setPreferredBranch(b.id, b.name);
                                setOpen(false);
                            }}
                            className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-[var(--v2-text)] hover:bg-[var(--v2-surface-muted)] transition-colors text-left"
                        >
                            <span>
                                {b.name}
                                {b.area && <span className="text-[var(--v2-text-faint)] text-xs ml-1.5">— {b.area}</span>}
                            </span>
                            {b.id === preferredBranchId && <Check size={14} className="text-[var(--v2-accent)] flex-shrink-0" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
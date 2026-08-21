"use client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAdminBranchStore, useAuthStore } from "@/stores";
import { GitBranch } from "lucide-react";

type Branch = { id: string; name: string; is_active: boolean };

const FULL_VISIBILITY_ROLES = ["super_admin", "director"];

/**
 * Lets an admin pick which branch the dashboard/orders/inventory pages should
 * show data for. Replaces the old hardcoded fake branch ID.
 * Persists the choice across sessions via useAdminBranchStore.
 *
 * super_admin and director additionally get an "All branches" option, since
 * they need a full-system view rather than one branch at a time.
 */
export default function BranchSelector() {
    const { selectedBranchId, setSelectedBranchId } = useAdminBranchStore();
    const { user } = useAuthStore();
    const canSeeAllBranches = FULL_VISIBILITY_ROLES.includes(user?.role ?? "");

    const { data: branches, isLoading } = useQuery({
        queryKey: ["admin-branches-selector"],
        queryFn: () => api.get("/branches").then((r) => r.data as Branch[]),
    });

    const activeBranches = (branches ?? []).filter((b) => b.is_active);

    // Default to "All branches" for full-visibility roles, or the first
    // active branch otherwise — but only if nothing valid is selected yet.
    useEffect(() => {
        if (isLoading) return;
        if (selectedBranchId === "" && canSeeAllBranches) return; // explicit "all", keep it
        if (activeBranches.length === 0) return;
        const stillValid = activeBranches.some((b) => b.id === selectedBranchId);
        if (!stillValid) {
            setSelectedBranchId(canSeeAllBranches ? "" : activeBranches[0].id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, branches, canSeeAllBranches]);

    if (isLoading) {
        return <div className="h-8 w-36 bg-gray-100 animate-pulse rounded-lg" />;
    }

    if (activeBranches.length === 0 && !canSeeAllBranches) {
        return (
            <a href="/admin/branches" className="text-xs font-medium text-red-600 hover:underline flex items-center gap-1.5">
                <GitBranch size={13} />
                No branches yet — create one
            </a>
        );
    }

    return (
        <div className="admin-header-control flex items-center gap-1.5">
            <GitBranch size={13} className="text-gray-400 flex-shrink-0" />
            <select
                value={selectedBranchId ?? ""}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="text-xs font-medium bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
                {canSeeAllBranches && <option value="">All branches</option>}
                {activeBranches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                ))}
            </select>
        </div>
    );
}
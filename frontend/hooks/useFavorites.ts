"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { favoritesApi } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

/**
 * Shared favorites state. Any component that calls this hook reads from and
 * writes to the same react-query cache (key: ["favorite-ids"]), so toggling
 * a heart anywhere in the app — a deal card, the navbar, the favorites page
 * itself — stays in sync everywhere else without prop drilling.
 */
export function useFavorites() {
    const { isAuthenticated, _hasHydrated } = useAuthStore();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: favoriteIds = [], isLoading } = useQuery({
        queryKey: ["favorite-ids"],
        queryFn: () => favoritesApi.ids().then((r) => r.data as string[]),
        enabled: _hasHydrated && isAuthenticated,
        staleTime: 60_000,
    });

    const isFavorited = (productId: string) => favoriteIds.includes(productId);

    const toggle = useMutation({
        mutationFn: async (productId: string) => {
            if (isFavorited(productId)) {
                await favoritesApi.remove(productId);
                return { productId, nowFavorited: false };
            }
            await favoritesApi.add(productId);
            return { productId, nowFavorited: true };
        },
        onMutate: async (productId: string) => {
            await queryClient.cancelQueries({ queryKey: ["favorite-ids"] });
            const previous = queryClient.getQueryData<string[]>(["favorite-ids"]) ?? [];
            const nowFavorited = !previous.includes(productId);
            queryClient.setQueryData<string[]>(
                ["favorite-ids"],
                nowFavorited ? [...previous, productId] : previous.filter((id) => id !== productId)
            );
            return { previous };
        },
        onError: (_err, _productId, context) => {
            if (context?.previous) {
                queryClient.setQueryData(["favorite-ids"], context.previous);
            }
            toast.error("Couldn't update favorites");
        },
        onSuccess: ({ nowFavorited }) => {
            toast.success(nowFavorited ? "Added to favorites" : "Removed from favorites");
        },
    });

    const toggleFavorite = (productId: string) => {
        if (!_hasHydrated) return;
        if (!isAuthenticated) {
            router.push("/login?next=/account/favorites");
            return;
        }
        toggle.mutate(productId);
    };

    return {
        favoriteIds,
        isFavorited,
        toggleFavorite,
        isLoading: isAuthenticated && isLoading,
    };
}
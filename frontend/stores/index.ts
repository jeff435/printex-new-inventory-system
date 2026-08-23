import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: string;
  is_phone_verified: boolean;
  is_email_verified: boolean;
}

interface AdminBranchState {
  // null = nothing chosen yet (still loading/defaulting).
  // ""   = "All branches" — an explicit choice, only offered to roles with
  //        full-system visibility (super_admin, director).
  // any other string = a specific branch id.
  selectedBranchId: string | null;
  setSelectedBranchId: (id: string | null) => void;
}

export const useAdminBranchStore = create<AdminBranchState>()(
  persist(
    (set) => ({
      selectedBranchId: null,
      setSelectedBranchId: (id) => set({ selectedBranchId: id }),
    }),
    { name: "printex-admin-branch" }
  )
);

interface PreferredBranchState {
  preferredBranchId: string | null;
  preferredBranchName: string | null;
  setPreferredBranch: (id: string, name: string) => void;
}

export const usePreferredBranchStore = create<PreferredBranchState>()(
  persist(
    (set) => ({
      preferredBranchId: null,
      preferredBranchName: null,
      setPreferredBranch: (id, name) => set({ preferredBranchId: id, preferredBranchName: name }),
    }),
    { name: "printex-preferred-branch" }
  )
);

interface CartItem {
  product_id: string;
  name: string;
  slug: string;
  price_kes: number;
  thumbnail_url: string | null;
  unit: string | null;
  quantity: number;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;
  setHasHydrated: (val: boolean) => void;
  setUser: (user: User, accessToken: string, refreshToken: string) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      _hasHydrated: false,
      setHasHydrated: (val) => set({ _hasHydrated: val }),
      setUser: (user, accessToken, refreshToken) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("access_token", accessToken);
          localStorage.setItem("refresh_token", refreshToken);
        }
        set({ user, isAuthenticated: true });
      },
      clearUser: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
        }
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: "printex-auth",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (product_id: string) => void;
  updateQuantity: (product_id: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: () => number;
  totalKes: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => {
        const existing = get().items.find((i) => i.product_id === item.product_id);
        if (existing) {
          set((s) => ({
            items: s.items.map((i) =>
              i.product_id === item.product_id
                ? { ...i, quantity: i.quantity + 1 }
                : i
            ),
          }));
        } else {
          set((s) => ({ items: [...s.items, { ...item, quantity: 1 }] }));
        }
      },
      removeItem: (product_id) =>
        set((s) => ({ items: s.items.filter((i) => i.product_id !== product_id) })),
      updateQuantity: (product_id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(product_id);
          return;
        }
        set((s) => ({
          items: s.items.map((i) =>
            i.product_id === product_id ? { ...i, quantity } : i
          ),
        }));
      },
      clearCart: () => set({ items: [] }),
      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
      totalKes: () => get().items.reduce((sum, i) => sum + i.price_kes * i.quantity, 0),
    }),
    { name: "printex-cart" }
  )
);
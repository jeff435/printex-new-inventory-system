import axios, { AxiosError, AxiosRequestConfig } from "axios";

// Resolve where the browser should reach the API.
//
// NEXT_PUBLIC_API_URL is baked into the JS bundle at BUILD time, so a
// hardcoded "http://localhost:8000/api/v1" only ever works on the one
// laptop that built the container — every other laptop or phone opening
// the site over the network has its own "localhost", which isn't running
// anything, so every single API call (every button) silently fails there.
//
// Fix: if the env var isn't explicitly set to something other than
// localhost, derive the API host from whatever host the browser actually
// used to load the page. A phone that opened http://192.168.1.50:3000
// will then correctly call http://192.168.1.50:8000/api/v1 — no per-device
// config needed. This only runs in the browser; on the server it falls
// back to the env var (or localhost) since there's no window there.
// Only ever derive the API host when the page itself was opened from a
// localhost / private-LAN address. The previous version derived it whenever
// NEXT_PUBLIC_API_URL was unset — which on Vercel meant the browser called
// https://your-app.vercel.app:8000/api/v1. Nothing listens on port 8000 there,
// so every request (login included) failed with a connection error and no
// server log to explain it. On a public host we now fall back to the
// configured value and warn loudly instead of guessing.
const PRIVATE_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function resolveApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  const isLocalhostDefault =
    !configured || /^https?:\/\/localhost(:|\/|$)/.test(configured);

  if (typeof window !== "undefined" && isLocalhostDefault) {
    if (PRIVATE_HOST.test(window.location.hostname)) {
      return `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;
    }
    console.error(
      "NEXT_PUBLIC_API_URL is not set for this deployment. Set it to your " +
        "Render backend URL (e.g. https://<service>.onrender.com/api/v1) in " +
        "the Vercel project's Environment Variables and redeploy — API calls " +
        "will fail until you do."
    );
  }
  return configured || "http://localhost:8000/api/v1";
}

const API_URL = resolveApiUrl();

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getToken(key: "access_token" | "refresh_token"): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

function setTokens(access: string, refresh: string): void {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}

function clearTokens(): void {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

async function clearSessionAndRedirect(): Promise<void> {
  clearTokens();
  try {
    const { useAuthStore } = await import("@/stores");
    useAuthStore.getState().clearUser();
  } catch {
    // store import failed — tokens already cleared, redirect is enough
  }
  window.location.href = "/login";
}

// ── Request interceptor — attach access token ─────────────────────────────────

api.interceptors.request.use(
  (config) => {
    const token = getToken("access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// ── Response interceptor — auto-refresh on 401 ────────────────────────────────

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };

    // The auth endpoints must never go through the refresh-and-redirect path.
    //
    // /auth/login legitimately answers 401 for a wrong password. This
    // interceptor treated that like an expired session: with no refresh token
    // in localStorage it called clearSessionAndRedirect(), which does a full
    // `window.location.href = "/login"` page load. The form reset and the
    // "Invalid credentials" toast was destroyed before it could paint — so a
    // mistyped password looked exactly like "the login button does nothing".
    // /auth/refresh is excluded for the obvious reason: refreshing a failed
    // refresh is an infinite loop.
    const url = original?.url ?? "";
    const isAuthEndpoint =
      url.includes("/auth/login") ||
      url.includes("/auth/refresh") ||
      url.includes("/auth/register") ||
      url.includes("/auth/forgot-password") ||
      url.includes("/auth/reset-password");

    // Only attempt refresh once, and only on 401
    if (error.response?.status !== 401 || original._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    original._retry = true;

    const refresh = getToken("refresh_token");

    if (!refresh) {
      await clearSessionAndRedirect();
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post(`${API_URL}/auth/refresh`, {
        refresh_token: refresh,
      });

      setTokens(data.access_token, data.refresh_token);

      if (original.headers) {
        original.headers.Authorization = `Bearer ${data.access_token}`;
      }

      return api(original);
    } catch (refreshError: unknown) {
      // Refresh failed — session is dead, boot the user
      await clearSessionAndRedirect();
      return Promise.reject(refreshError);
    }
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: unknown) => api.post("/auth/register", data),
  login: (data: unknown) => api.post("/auth/login", data),
  loginVerify: (data: unknown) => api.post("/auth/login/verify", data),
  google: (idToken: string) => api.post("/auth/google", { id_token: idToken }),
  me: () => api.get("/auth/me"),
  verifyOtp: (data: unknown) => api.post("/auth/verify-otp", data),
  resendOtp: (channel: "phone" | "email") =>
    api.post("/auth/resend-otp", { channel }),
  forgotPassword: (identifier: string) =>
    api.post("/auth/forgot-password", { identifier }),
  resetPassword: (data: unknown) => api.post("/auth/reset-password", data),
  addresses: () => api.get("/auth/addresses"),
  addAddress: (data: unknown) => api.post("/auth/addresses", data),
  deleteAddress: (id: string) => api.delete(`/auth/addresses/${id}`),
};

// ── Staff (directors & secretaries) ─────────────────────────────────────────

// User management — admin manages anyone, a director manages secretaries.
// The list response includes `manageable_ids` so the UI can grey out rows the
// signed-in user isn't allowed to touch rather than offering an action that
// would come back 403.
export const usersApi = {
  list: (params?: Record<string, unknown>) => api.get("/auth/users", { params }),
  updateRole: (id: string, role: string) => api.patch(`/auth/users/${id}`, { role }),
  updateProfile: (id: string, data: { full_name?: string; phone?: string | null; email?: string | null }) =>
    api.patch(`/auth/users/${id}/profile`, data),
  updateStatus: (id: string, status: "active" | "inactive" | "suspended") =>
    api.patch(`/auth/users/${id}/status`, { status }),
  resetPassword: (id: string, new_password: string) =>
    api.post(`/auth/users/${id}/reset-password`, { new_password }),
  remove: (id: string) => api.delete(`/auth/users/${id}`),
};

export const staffApi = {
  // super_admin only
  listDirectors: () => api.get("/auth/staff/directors"),
  createDirector: (data: unknown) => api.post("/auth/staff/directors", data),
  // director (or super_admin)
  listSecretaries: () => api.get("/auth/staff/secretaries"),
  createSecretary: (data: unknown) => api.post("/auth/staff/secretaries", data),
};

// ── Proforma Invoices (secretary / director / admin) ────────────────────────

export const proformaApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/proforma-invoices", { params }),
  get: (id: string) => api.get(`/proforma-invoices/${id}`),
  create: (data: unknown) => api.post("/proforma-invoices", data),
  update: (id: string, data: unknown) =>
    api.patch(`/proforma-invoices/${id}`, data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/proforma-invoices/${id}/status`, { status }),
  remove: (id: string) => api.delete(`/proforma-invoices/${id}`),
  // Blobs — used for download / print / "open in new tab" buttons.
  pdfBlob: (id: string) =>
    api.get(`/proforma-invoices/${id}/pdf`, { responseType: "blob" }),
  excelBlob: (id: string) =>
    api.get(`/proforma-invoices/${id}/export/excel`, { responseType: "blob" }),
};

// ── Analytics (director / admin full view, secretary: stock-status only) ──

export const analyticsApi = {
  summary: (params?: Record<string, unknown>) =>
    api.get("/analytics/summary", { params }),
  stockStatus: (params?: Record<string, unknown>) =>
    api.get("/analytics/stock-status", { params }),
  customerPurchases: (params?: Record<string, unknown>) =>
    api.get("/analytics/customer-purchases", { params }),
  topParts: (params?: Record<string, unknown>) =>
    api.get("/analytics/top-parts", { params }),
  goodsReceived: (params?: Record<string, unknown>) =>
    api.get("/analytics/goods-received", { params }),
  goodsReceivedExcelBlob: (params?: Record<string, unknown>) =>
    api.get("/analytics/goods-received/export/excel", { params, responseType: "blob" }),
  goodsReceivedPdfBlob: (params?: Record<string, unknown>) =>
    api.get("/analytics/goods-received/pdf", { params, responseType: "blob" }),
  stockValueByCategory: () =>
    api.get("/analytics/stock-value"),
  stockValueExcelBlob: () =>
    api.get("/analytics/stock-value/export/excel", { responseType: "blob" }),
  stockValuePdfBlob: () =>
    api.get("/analytics/stock-value/pdf", { responseType: "blob" }),
  stockMovements: (params?: Record<string, unknown>) =>
    api.get("/analytics/stock-movements", { params }),
  stockStatusPdfBlob: (params?: Record<string, unknown>) =>
    api.get("/analytics/stock-status/pdf", { params, responseType: "blob" }),
  stockStatusExcelBlob: (params?: Record<string, unknown>) =>
    api.get("/analytics/stock-status/export/excel", { params, responseType: "blob" }),
  customerPurchasesPdfBlob: (params?: Record<string, unknown>) =>
    api.get("/analytics/customer-purchases/pdf", { params, responseType: "blob" }),
  customerPurchasesExcelBlob: (params?: Record<string, unknown>) =>
    api.get("/analytics/customer-purchases/export/excel", { params, responseType: "blob" }),
  summaryExcelBlob: (params?: Record<string, unknown>) =>
    api.get("/analytics/export/excel", { params, responseType: "blob" }),
  summaryPdfBlob: (params?: Record<string, unknown>) =>
    api.get("/analytics/summary/pdf", { params, responseType: "blob" }),
};

// ── Purchases, Suppliers & Expenses (admin / director) ──────────────────────

export const purchasesApi = {
  list: (params?: Record<string, unknown>) => api.get("/purchases", { params }),
  get: (id: string) => api.get(`/purchases/${id}`),
  create: (data: unknown) => api.post("/purchases", data),
  receive: (id: string) => api.post(`/purchases/${id}/receive`),
  cancel: (id: string) => api.post(`/purchases/${id}/cancel`),
};

export const suppliersApi = {
  list: (params?: Record<string, unknown>) => api.get("/suppliers", { params }),
  create: (data: unknown) => api.post("/suppliers", data),
  update: (id: string, data: unknown) => api.patch(`/suppliers/${id}`, data),
};

export const expensesApi = {
  list: (params?: Record<string, unknown>) => api.get("/expenses", { params }),
  create: (data: unknown) => api.post("/expenses", data),
};

// ── Products ──────────────────────────────────────────────────────────────────

export const productsApi = {
  list: (params?: Record<string, unknown>) => api.get("/products", { params }),
  get: (slugOrId: string) => api.get(`/products/${slugOrId}`),
  categories: () => api.get("/categories"),
};

// ── Uploads ───────────────────────────────────────────────────────────────────

export const uploadsApi = {
  image: (file: File, folder: "products" | "categories" | "brands" = "products") => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ url: string; key: string }>(
      `/uploads/image?folder=${folder}`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },
};

// ── Orders ────────────────────────────────────────────────────────────────────

export const ordersApi = {
  create: (data: unknown) => api.post("/orders", data),
  list: (params?: Record<string, unknown>) => api.get("/orders", { params }),
  get: (id: string) => api.get(`/orders/${id}`),
  updateStatus: (id: string, data: unknown) =>
    api.patch(`/orders/${id}/status`, data),
};

// ── Payments ──────────────────────────────────────────────────────────────────

export const paymentsApi = {
  mpesaStk: (orderId: string, phone: string) =>
    api.post("/payments/mpesa/stk-push", null, {
      params: { order_id: orderId, phone },
    }),
  mpesaStatus: (checkoutId: string) =>
    api.get(`/payments/mpesa/status/${checkoutId}`),
  cardInitiate: (orderId: string, redirectUrl: string) =>
    api.post("/payments/card/initiate", null, {
      params: { order_id: orderId, redirect_url: redirectUrl },
    }),
  cardVerify: (transactionId: string) =>
    api.get("/payments/card/verify", {
      params: { transaction_id: transactionId },
    }),
};
// ── Loyalty ───────────────────────────────────────────────────────────────────

export const loyaltyApi = {
  account: () => api.get("/loyalty/account"),
  transactions: (page = 1) => api.get(`/loyalty/transactions?page=${page}&limit=20`),
  redeemPreview: (points: number) => api.get(`/loyalty/redeem-preview?points=${points}`),
};

// ── Favorites ─────────────────────────────────────────────────────────────────

export const favoritesApi = {
  list: () => api.get("/favorites"),
  ids: () => api.get("/favorites/ids"),
  add: (productId: string) => api.post(`/favorites/${productId}`),
  remove: (productId: string) => api.delete(`/favorites/${productId}`),
};

// ── Ratings ───────────────────────────────────────────────────────────────────

export const ratingsApi = {
  // Every rating the signed-in user has left, for hydrating star widgets.
  mine: () => api.get("/ratings/mine"),
  summary: (productId: string) => api.get(`/ratings/${productId}`),
  // PUT, not POST — rating the same product again replaces the value.
  rate: (productId: string, stars: number) =>
    api.put(`/ratings/${productId}`, { stars }),
  remove: (productId: string) => api.delete(`/ratings/${productId}`),
};

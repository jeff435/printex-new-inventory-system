"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, productsApi, uploadsApi } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, Upload, X, Loader2 } from "lucide-react";

const emptyForm = {
    name: "", sku: "", part_number: "", slug: "", description: "", short_description: "",
    price_kes: "", category_id: "", brand_id: "",
    unit: "pieces", unit_value: "", thumbnail_url: "", status: "ACTIVE",
};

const inp = "w-full px-3.5 py-2.5 text-sm bg-white/70 backdrop-blur-sm border border-white/70 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder-gray-400";
const inpDisabled = "w-full px-3.5 py-2.5 text-sm bg-gray-100 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed";

// Defined at module scope (not inside ProductFormContent) so React sees the
// same component type across renders instead of a brand-new one on every
// keystroke. Redefining it inline was remounting every input on each
// render, which dropped focus after each character and made typing feel
// like it only accepted one letter at a time.
function FormField({
    label, k, type = "text", ph = "", disabled = false, value, onChange,
}: {
    label: string; k: string; type?: string; ph?: string; disabled?: boolean;
    value: string; onChange: (k: string, value: string) => void;
}) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
            <input
                type={type}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(k, e.target.value)}
                placeholder={ph}
                className={disabled ? inpDisabled : inp}
            />
        </div>
    );
}

function ProductFormContent() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const searchParams = useSearchParams();
    const editId = searchParams.get("edit");
    const isEditing = Boolean(editId);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [slugTouched, setSlugTouched] = useState(false);

    const { data: categoriesData } = useQuery({ queryKey: ["categories"], queryFn: () => api.get("/categories").then((r) => r.data) });
    const { data: brandsData } = useQuery({ queryKey: ["brands"], queryFn: () => api.get("/brands").then((r) => r.data) });

    const { data: existingProduct, isLoading: loadingProduct } = useQuery({
        queryKey: ["admin-product", editId],
        queryFn: () => productsApi.get(editId as string).then((r) => r.data),
        enabled: isEditing,
    });

    // Pre-fill the form once the existing product loads
    useEffect(() => {
        if (!existingProduct) return;
        setForm({
            name: existingProduct.name ?? "",
            sku: existingProduct.sku ?? "",
            part_number: existingProduct.part_number ?? "",
            slug: existingProduct.slug ?? "",
            description: existingProduct.description ?? "",
            short_description: existingProduct.short_description ?? "",
            price_kes: existingProduct.price_kes ? (existingProduct.price_kes / 100).toString() : "",
            category_id: existingProduct.category?.id ?? "",
            brand_id: existingProduct.brand?.id ?? "",
            unit: "pieces",
            unit_value: existingProduct.unit_value?.toString() ?? "",
            thumbnail_url: existingProduct.thumbnail_url ?? "",
            status: (existingProduct.status ?? "active").toUpperCase(),
        });
        setSlugTouched(true); // don't clobber the loaded slug from the name auto-slugify effect
    }, [existingProduct]);

    // Auto-slugify from name — only while creating, and only until the user (or the
    // prefill above) has touched the slug, so editing an existing product never
    // silently rewrites its slug (which would break any links already pointing to it).
    useEffect(() => {
        if (isEditing || slugTouched) return;
        if (form.name) {
            setForm((f) => ({ ...f, slug: form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }));
        }
    }, [form.name, isEditing, slugTouched]);

    const createMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) => api.post("/products", payload),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-products"] }); toast.success("Product created!"); router.push("/admin/products"); },
        onError: (err: any) => toast.error((err.response?.data?.detail || err.response?.data?.message) || "Failed to create product"),
    });

    const updateMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) => api.patch(`/products/${editId}`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-products"] });
            queryClient.invalidateQueries({ queryKey: ["admin-product", editId] });
            toast.success("Product updated!");
            router.push("/admin/products");
        },
        onError: (err: any) => toast.error((err.response?.data?.detail || err.response?.data?.message) || "Failed to update product"),
    });

    const saving = createMutation.isPending || updateMutation.isPending;

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow re-selecting the same file later
        if (!file) return;

        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            toast.error("Please choose a JPEG, PNG or WEBP image");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error("Image must be smaller than 5MB");
            return;
        }

        setUploading(true);
        try {
            const { data } = await uploadsApi.image(file, "products");
            setForm((f) => ({ ...f, thumbnail_url: data.url }));
            toast.success("Image uploaded");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to upload image");
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = () => {
        if (!form.name || !form.sku || !form.price_kes) { toast.error("Name, SKU and price are required"); return; }

        if (isEditing) {
            // SKU and slug are immutable once created, so they're excluded here
            updateMutation.mutate({
                name: form.name,
                part_number: form.part_number || null,
                description: form.description || null,
                short_description: form.short_description || null,
                price_kes: Math.round(parseFloat(form.price_kes) * 100),
                category_id: form.category_id || null,
                brand_id: form.brand_id || null,
                unit: "pieces",
                unit_value: form.unit_value ? parseFloat(form.unit_value) : null,
                thumbnail_url: form.thumbnail_url || "",
                status: form.status,
            });
        } else {
            createMutation.mutate({
                name: form.name, sku: form.sku, part_number: form.part_number || null, slug: form.slug,
                description: form.description || null,
                short_description: form.short_description || null,
                price_kes: Math.round(parseFloat(form.price_kes) * 100),
                category_id: form.category_id || null,
                brand_id: form.brand_id || null,
                unit: "pieces",
                unit_value: form.unit_value ? parseFloat(form.unit_value) : null,
                thumbnail_url: form.thumbnail_url || null,
                status: form.status,
            });
        }
    };

    const setField = (k: string, value: string) => setForm((f) => ({ ...f, [k]: value }));

    if (isEditing && loadingProduct) {
        return (
            <div className="max-w-2xl flex items-center gap-2 text-gray-500 text-sm py-12">
                <Loader2 size={16} className="animate-spin" /> Loading product...
            </div>
        );
    }

    return (
        <div className="max-w-2xl space-y-5">
            <div className="flex items-center gap-3">
                <button onClick={() => router.back()} className="glass-icon-btn w-9 h-9"><ArrowLeft size={15} /></button>
                <h1 className="text-xl font-bold text-gray-900">{isEditing ? "Edit Product" : "Add New Product"}</h1>
            </div>

            <div className="glass-card p-6 space-y-4">
                <h2 className="font-semibold text-gray-800">Basic Info</h2>
                <FormField label="Product Name *" k="name" ph="e.g. Brookside Milk 500ml" value={form.name} onChange={setField} />
                <FormField label="Part Number" k="part_number" ph="e.g. F4.020.292" value={form.part_number} onChange={setField} />
                <FormField label="SKU *" k="sku" ph="e.g. MILK-BS-500" disabled={isEditing} value={form.sku} onChange={setField} />
                <FormField label="Slug" k="slug" ph="e.g. brookside-milk-500ml" disabled={isEditing} value={form.slug} onChange={setField} />
                {isEditing && <p className="text-xs text-gray-400 -mt-2">SKU and slug can't be changed after a product is created.</p>}
                <FormField label="Short Description" k="short_description" ph="One-line summary" value={form.short_description} onChange={setField} />
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                    <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Full product description..." rows={3} className={`${inp} resize-none`} />
                </div>
            </div>

            <div className="glass-card p-6 space-y-4">
                <h2 className="font-semibold text-gray-800">Pricing</h2>
                <FormField label="Price (KES) *" k="price_kes" type="number" ph="e.g. 65" value={form.price_kes} onChange={setField} />
                <p className="text-xs text-gray-400">Enter prices in KES (e.g. 65 for KES 65.00).</p>
            </div>

            <div className="glass-card p-6 space-y-4">
                <h2 className="font-semibold text-gray-800">Classification</h2>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                    <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))} className={inp}>
                        <option value="">Select category</option>
                        {(categoriesData || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Brand</label>
                    <select value={form.brand_id} onChange={(e) => setForm((f) => ({ ...f, brand_id: e.target.value }))} className={inp}>
                        <option value="">Select brand</option>
                        {(brandsData || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Unit</label>
                        <div className={inpDisabled}>Pieces</div>
                    </div>
                    <FormField label="Unit Value" k="unit_value" type="number" ph="e.g. 500" value={form.unit_value} onChange={setField} />
                </div>
            </div>

            <div className="glass-card p-6 space-y-4">
                <h2 className="font-semibold text-gray-800">Media & Status</h2>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Product Image</label>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleFileSelect}
                    />
                    {form.thumbnail_url ? (
                        <div className="flex items-center gap-3">
                            <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 border border-white/70 flex-shrink-0">
                                <img src={form.thumbnail_url} alt="Product preview" className="w-full h-full object-cover" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="glass-btn-ghost px-4 py-2 text-xs disabled:opacity-50"
                                >
                                    Replace image
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, thumbnail_url: "" }))}
                                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
                                >
                                    <X size={12} /> Remove
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/40 transition-colors disabled:opacity-60"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 size={20} className="animate-spin text-blue-500" />
                                    <span className="text-xs text-gray-500">Uploading...</span>
                                </>
                            ) : (
                                <>
                                    <Upload size={20} className="text-gray-400" />
                                    <span className="text-xs text-gray-500">Click to upload JPEG, PNG or WEBP (max 5MB)</span>
                                </>
                            )}
                        </button>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                    <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={inp}>
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                        <option value="DISCONTINUED">Discontinued</option>
                    </select>
                </div>
            </div>

            <div className="flex gap-3 pb-8">
                <button onClick={handleSubmit} disabled={saving || uploading} className="glass-btn px-8 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                    {saving ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save Changes" : "Create Product")}
                </button>
                <button onClick={() => router.back()} className="glass-btn-ghost px-6 py-3 text-sm">Cancel</button>
            </div>
        </div>
    );
}

export default function ProductFormPage() {
    return (
        <Suspense>
            <ProductFormContent />
        </Suspense>
    );
}
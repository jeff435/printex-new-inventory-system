import { CategorySidebarV2 } from "@/components/v2/CategorySidebarV2";
import { HeroCarouselV2 } from "@/components/v2/HeroCarouselV2";
import { CategoryQuickGridV2 } from "@/components/v2/CategoryQuickGridV2";
import { DealsSectionV2 } from "@/components/v2/DealsSectionV2";
import { PromoCardV2 } from "@/components/v2/PromoCardV2";
import Link from "next/link";
import { BarChart3, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <div className="v2-page">
      <div className="px-shell py-5 lg:py-6 space-y-6">
        {/* Director Analytics Quick Access Banner */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-blue-900 text-white p-6 rounded-2xl shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center md:text-left">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-400 text-amber-950 uppercase tracking-wider">
              <Sparkles size={12} /> Executive Preview
            </span>
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">
              Director Analytics & Oversight Dashboard
            </h2>
            <p className="text-sm text-indigo-200 max-w-2xl">
              Inspect the newly designed analytical dashboard with multi-branch metrics, financial growth trajectories, and interactive drill-down components without logging in.
            </p>
          </div>
          <Link
            href="/director-preview"
            className="flex items-center gap-2 bg-white text-indigo-900 hover:bg-indigo-50 px-6 py-3 rounded-xl font-bold text-sm shadow-lg transition-all transform hover:scale-105 flex-shrink-0"
          >
            <BarChart3 size={18} /> View Director Dashboard
          </Link>
        </div>

        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">
          <div className="hidden lg:block space-y-5">
            <CategorySidebarV2 />
            <PromoCardV2 />
          </div>

          <div className="min-w-0 space-y-5">
            <HeroCarouselV2 />
            <CategoryQuickGridV2 />
            <DealsSectionV2 />
          </div>
        </div>

      </div>
    </div>
  );
}
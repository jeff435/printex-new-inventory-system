import { CategorySidebarV2 } from "@/components/v2/CategorySidebarV2";
import { HeroCarouselV2 } from "@/components/v2/HeroCarouselV2";
import { CategoryQuickGridV2 } from "@/components/v2/CategoryQuickGridV2";
import { DealsSectionV2 } from "@/components/v2/DealsSectionV2";
import { PromoCardV2 } from "@/components/v2/PromoCardV2";

export default function HomePage() {
  return (
    <div className="v2-page">
      <div className="px-shell py-5 lg:py-6">
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
import { ArrowLeft, Truck } from "lucide-react";
import Link from "next/link";

import MobileTruckInventory from "@/features/parts/mobile/MobileTruckInventory";

export const dynamic = "force-dynamic";

export default function MobileTruckInventoryPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-3 px-3 py-3 sm:px-4">
      <Link
        href="/mobile/parts"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 text-sm font-bold text-[color:var(--theme-text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to parts
      </Link>

      <section className="mobile-dashboard-hero">
        <div className="flex items-start gap-3">
          <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
            <Truck aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="mobile-dashboard-hero__eyebrow">Field Service</div>
            <h1 className="mobile-dashboard-hero__title">Truck inventory</h1>
            <p className="mobile-dashboard-hero__subtitle">
              See the canonical on-hand, reserved and available stock on the service vehicle assigned to your current call.
            </p>
          </div>
        </div>
      </section>

      <MobileTruckInventory />
    </main>
  );
}

// app/mobile/inspections/maintenance-50/page.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MobileShell } from "components/layout/MobileShell";

export default function MobileMaintenance50RunnerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const qs = searchParams.toString();
  const extra = qs ? `&${qs}` : "";

  // Assumes desktop route is /inspections/maintenance-50
  const src = `/inspections/maintenance-50?view=mobile&embed=1${extra}`;

  return (
    <MobileShell>
      <div className="flex h-full flex-col bg-neutral-950 text-foreground">
        <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
          >
            ← Back
          </button>

          <div className="flex-1 px-2 text-center">
            <h1 className="truncate text-xs font-blackops uppercase tracking-[0.18em] text-neutral-200">
              Maint. 50 (Hydraulic)
            </h1>
          </div>

          <Link
            href={`/inspections/maintenance-50${qs ? `?${qs}` : ""}`}
            className="rounded-full border border-orange-500/70 bg-orange-500 px-3 py-1 text-[0.7rem] font-semibold text-black hover:bg-orange-400"
          >
            Desktop
          </Link>
        </header>

        <main className="flex-1 overflow-hidden">
          <iframe
            src={src}
            title="Maintenance 50 Inspection"
            className="h-full w-full border-0 bg-black"
          />
        </main>
      </div>
    </MobileShell>
  );
}
"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function MobileMaintenance50AirRunnerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const extra = query ? `&${query}` : "";

  // The inspection runtime is embedded with its mobile controls enabled. The
  // technician never navigates to the desktop inspection route directly.
  const src = `/inspections/maintenance-50-air?view=mobile&embed=1${extra}`;

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--theme-surface-page)] text-foreground">
      <header className="flex items-center justify-between gap-2 border-b border-[color:var(--theme-border-soft)] px-3 py-2">
        <button
          type="button"
          onClick={() => router.push("/mobile/inspections")}
          className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-1 text-xs text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-panel)]"
        >
          ← Inspections
        </button>

        <div className="flex-1 px-2 text-center">
          <h1 className="truncate text-xs font-blackops uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)]">
            Maint. 50 (Air Brake)
          </h1>
        </div>

        <div className="w-20" aria-hidden="true" />
      </header>

      <main className="flex-1 overflow-hidden">
        <iframe
          src={src}
          title="Maintenance 50 Air Inspection"
          className="h-full w-full border-0 bg-[color:var(--theme-surface-page)]"
        />
      </main>
    </div>
  );
}

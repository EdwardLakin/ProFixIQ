"use client";

import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { MobileShell } from "components/layout/MobileShell";

export default function MobileInspectionRunnerPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  // Re-use the existing desktop inspection route.
  // You can add any query params you want for mobile-specific behavior.
  const src = `/inspections/${id}?view=mobile`;

  return (
    <MobileShell>
      <div className="flex h-full flex-col bg-neutral-950 text-foreground">
        {/* Top bar */}
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
              Run Inspection
            </h1>
          </div>

          <Link
            href={`/inspections/${id}`}
            className="rounded-full border border-orange-500/70 bg-orange-500 px-3 py-1 text-[0.7rem] font-semibold text-black hover:bg-orange-400"
          >
            Desktop
          </Link>
        </header>

        {/* Runner */}
        <main className="flex-1 overflow-hidden">
          <iframe
            src={src}
            title="Inspection"
            className="h-full w-full border-0 bg-black"
          />
        </main>
      </div>
    </MobileShell>
  );
}
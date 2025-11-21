"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MobileShell } from "components/layout/MobileShell";

export default function MobilePlannerPage() {
  const router = useRouter();

  // Re-use the existing desktop AI planner route.
  // Note: this *targets* /agent/planner internally, but the mobile route is /mobile/planner
  const src = "/agent/planner?view=mobile";

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
              AI Planner
            </h1>
          </div>

          <Link
            href="/agent/planner"
            className="rounded-full border border-orange-500/70 bg-orange-500 px-3 py-1 text-[0.7rem] font-semibold text-black hover:bg-orange-400"
          >
            Desktop
          </Link>
        </header>

        {/* Planner iframe */}
        <main className="flex-1 overflow-hidden">
          <iframe
            src={src}
            title="AI Planner"
            className="h-full w-full border-0 bg-black"
          />
        </main>
      </div>
    </MobileShell>
  );
}
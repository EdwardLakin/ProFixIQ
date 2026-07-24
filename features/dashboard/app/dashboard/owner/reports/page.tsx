"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, DatabaseZap } from "lucide-react";
import { useSearchParams } from "next/navigation";

import OwnerIntelligenceClient from "@/features/owner/reports/OwnerIntelligenceClient";
import ReportsShopHealthPanel from "@/features/owner/reports/ReportsShopHealthPanel";
import PageShell from "@/features/shared/components/PageShell";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const healthMode = searchParams.get("tab") === "health";
  const requestedSection = searchParams.get("section");
  const initialSection =
    requestedSection === "financial" ||
    requestedSection === "workflow" ||
    requestedSection === "workforce" ||
    requestedSection === "quality"
      ? requestedSection
      : "executive";
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [shopId, setShopId] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    if (!healthMode) return;
    let active = true;

    void (async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (!active) return;
      if (userError || !user) {
        setHealthError("You must be signed in to view data health.");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;
      if (error || !data?.shop_id) {
        setHealthError(error?.message ?? "No shop is linked to this profile.");
        return;
      }
      setShopId(data.shop_id);
    })();

    return () => {
      active = false;
    };
  }, [healthMode, supabase]);

  if (!healthMode) {
    return (
      <PageShell
        title="Owner Intelligence"
        description="Verified financial, workflow, workforce, and quality reporting."
      >
        <OwnerIntelligenceClient initialSection={initialSection} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Setup & Data Health"
      description="Import readiness, record integrity, and setup diagnostics—not shop operating performance."
    >
      <div className="mx-auto w-full max-w-[1800px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300/80">
              <DatabaseZap className="h-4 w-4" />
              Administration
            </div>
            <h1 className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">
              Setup & Data Health
            </h1>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
              This surface evaluates imported and configured data. It is intentionally separated from executive performance.
            </p>
          </div>
          <Link
            href="/dashboard/owner/reports"
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-orange-300/40 bg-orange-400/10 px-4 text-xs font-semibold text-orange-200 hover:bg-orange-400/20"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to intelligence
          </Link>
        </div>

        {healthError ? (
          <div className="rounded-2xl border border-red-400/40 bg-red-950/30 p-4 text-sm text-red-100">
            {healthError}
          </div>
        ) : (
          <ReportsShopHealthPanel shopId={shopId} />
        )}
      </div>
    </PageShell>
  );
}

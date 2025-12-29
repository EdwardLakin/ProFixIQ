"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import toast from "react-hot-toast";

import { prepareSectionsWithCornerGrid } from "@inspections/lib/inspection/prepareSectionsWithCornerGrid";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type SectionItem = { item: string; unit?: string | null };
type Section = { title: string; items: SectionItem[] };

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function RunTemplateLoader() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  const templateId = sp.get("templateId");
  const gridOverride = sp.get("grid"); // 'air' | 'hyd' | 'none' | null

  useEffect(() => {
    (async () => {
      if (!templateId) {
        toast.error("Missing templateId");
        router.replace("/inspections/templates");
        return;
      }

      const { data, error } = await supabase
        .from("inspection_templates")
        .select("template_name, sections, vehicle_type")
        .eq("id", templateId)
        .maybeSingle();

      if (error || !data) {
        toast.error("Template not found.");
        router.replace("/inspections/templates");
        return;
      }

      const rawSections = (data.sections ?? []) as Section[];
      const title = data.template_name ?? "Inspection";
      const vehicleType = String(data.vehicle_type ?? "");

      const sections = prepareSectionsWithCornerGrid(
        rawSections,
        vehicleType,
        gridOverride,
      );

      // Stage for the generic runtime
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "inspection:sections",
          JSON.stringify(sections),
        );
        sessionStorage.setItem("inspection:title", title);
        sessionStorage.setItem("inspection:vehicleType", vehicleType);
        sessionStorage.setItem("inspection:template", "generic");
        sessionStorage.setItem(
          "inspection:params",
          JSON.stringify(Object.fromEntries(sp)),
        );

        // Legacy keys, still used by some flows
        sessionStorage.setItem(
          "customInspection:sections",
          JSON.stringify(sections),
        );
        sessionStorage.setItem("customInspection:title", title);
        sessionStorage.setItem(
          "customInspection:includeOil",
          JSON.stringify(false),
        );
      }

      // Forward to fill and *force* template=generic
      const next = new URLSearchParams(sp.toString());
      next.delete("templateId");
      next.set("template", "generic");
      router.replace(`/inspections/fill?${next.toString()}`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // Match the glass / metallic theme from fill page
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background px-3 py-4 text-foreground sm:px-6 lg:px-10 xl:px-16">
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-700/70 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.10),rgba(15,23,42,0.98))] shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl px-4 py-3 text-sm text-muted-foreground">
        <div className="rounded-xl border border-slate-700/60 bg-slate-950/80 px-4 py-3 text-sm">
          Preparing inspection…
        </div>
      </div>
    </div>
  );
}
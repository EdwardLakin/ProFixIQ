// features/inspections/app/inspection/run/page.tsx
"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { prepareSectionsWithCornerGrid } from "@inspections/lib/inspection/prepareSectionsWithCornerGrid";

type DB = Database;
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"];

type SectionItem = { item: string; unit?: string | null };
type Section = { title: string; items: SectionItem[] };

export default function RunInspectionPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const supabase = createClientComponentClient<DB>();

  useEffect(() => {
    const templateId = sp.get("templateId");
    const gridOverride = sp.get("grid"); // 'air' | 'hyd' | 'none' | null

    // ------------------- MODE 1: Staged (no templateId) -------------------
    if (!templateId) {
      if (typeof window === "undefined") {
        router.replace("/inspections/templates");
        return;
      }

      const stagedSectionsRaw =
        sessionStorage.getItem("inspection:sections") ??
        sessionStorage.getItem("customInspection:sections");
      const stagedTitle =
        sessionStorage.getItem("inspection:title") ??
        sessionStorage.getItem("customInspection:title");

      if (!stagedSectionsRaw || !stagedTitle) {
        router.replace("/inspections/templates");
        return;
      }

      let sections: Section[] = [];
      try {
        sections = JSON.parse(stagedSectionsRaw) as Section[];
      } catch {
        router.replace("/inspections/templates");
        return;
      }

      const title = stagedTitle || "Inspection";

      const currentParams: Record<string, string> = {};
      sp.forEach((value, key) => {
        currentParams[key] = value;
      });

      const stagedParamsRaw = sessionStorage.getItem("inspection:params");
      const stagedParams: Record<string, string> = stagedParamsRaw
        ? (JSON.parse(stagedParamsRaw) as Record<string, string>)
        : {};

      const mergedParams: Record<string, string> = {
        ...stagedParams,
        ...currentParams,
      };

      mergedParams.template = mergedParams.template || "generic";
      mergedParams.mode = mergedParams.mode || "run";

      const vt =
        mergedParams.vehicleType ||
        sessionStorage.getItem("inspection:vehicleType") ||
        "";

      const grid =
        mergedParams.grid ||
        gridOverride ||
        sessionStorage.getItem("customInspection:gridMode");

      // ✅ Single canonical normalizer (shared with other flows)
      const normalizedSections = prepareSectionsWithCornerGrid(
        sections,
        vt,
        grid || null,
      ) as unknown as Section[];

      sessionStorage.setItem(
        "inspection:sections",
        JSON.stringify(normalizedSections),
      );
      sessionStorage.setItem("inspection:title", title);
      sessionStorage.setItem("inspection:template", mergedParams.template);
      sessionStorage.setItem("inspection:params", JSON.stringify(mergedParams));

      // Legacy keys
      sessionStorage.setItem(
        "customInspection:sections",
        JSON.stringify(normalizedSections),
      );
      sessionStorage.setItem("customInspection:title", title);

      const next = new URLSearchParams(mergedParams);
      router.replace(`/inspections/fill?${next.toString()}`);
      return;
    }

    // ------------------- MODE 2: DB template (with templateId) -------------------
    (async () => {
      const { data, error } = await supabase
        .from("inspection_templates")
        .select("id, template_name, sections, vehicle_type")
        .eq("id", templateId)
        .maybeSingle<TemplateRow>();

      if (error || !data) {
        // eslint-disable-next-line no-console
        console.error("Failed to load inspection template:", error);
        router.replace("/inspections/templates");
        return;
      }

      const rawSections = (data.sections ?? []) as Section[];
      const title = data.template_name ?? "Inspection";
      const vehicleType = String(data.vehicle_type ?? "");

      // ✅ Single canonical normalizer (shared with other flows)
      const sections = prepareSectionsWithCornerGrid(
        rawSections,
        vehicleType,
        gridOverride,
      ) as unknown as Section[];

      if (typeof window !== "undefined") {
        const params: Record<string, string> = {};
        sp.forEach((value, key) => {
          params[key] = value;
        });

        params.templateId = data.id;
        params.template = params.template || "generic";
        params.vehicleType = vehicleType;
        params.mode = params.mode || "run";

        sessionStorage.setItem("inspection:sections", JSON.stringify(sections));
        sessionStorage.setItem("inspection:title", title);
        sessionStorage.setItem("inspection:vehicleType", vehicleType);
        sessionStorage.setItem("inspection:template", params.template);
        sessionStorage.setItem("inspection:params", JSON.stringify(params));

        // Legacy keys
        sessionStorage.setItem("customInspection:sections", JSON.stringify(sections));
        sessionStorage.setItem("customInspection:title", title);
        sessionStorage.setItem("customInspection:includeOil", JSON.stringify(false));

        const next = new URLSearchParams(params);
        next.delete("templateId");
        router.replace(`/inspections/fill?${next.toString()}`);
      }
    })();
  }, [sp, router, supabase]);

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
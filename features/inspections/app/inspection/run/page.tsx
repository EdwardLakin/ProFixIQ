// features/inspections/app/inspection/run/page.tsx
"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

import type { Database } from "@shared/types/types/supabase";
import { prepareSectionsWithCornerGrid } from "@inspections/lib/inspection/prepareSectionsWithCornerGrid";
import PageShell from "@/features/shared/components/PageShell";
import Card from "@/features/shared/components/ui/Card";

type DB = Database;
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"];

type SectionItem = {
  item: string;
  unit?: string | null;
  fieldType?: string | null;
};
type Section = { title: string; items: SectionItem[] };

function isImportedFleetForm(sections: Section[]): boolean {
  return sections.some((section) =>
    (section.items ?? []).some((item) => Boolean(item.fieldType)),
  );
}

export default function RunInspectionPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const supabase = createBrowserSupabase();

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
      const importedFleetForm = isImportedFleetForm(sections);

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

      const grid = importedFleetForm
        ? "none"
        : mergedParams.grid ||
          gridOverride ||
          sessionStorage.getItem("customInspection:gridMode");

      if (importedFleetForm) {
        // Fleet form imports describe the customer's source form. Never inject
        // ProFixIQ's generic brake/corner grid unless it was actually imported.
        mergedParams.grid = "none";
      }

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
      const importedFleetForm = isImportedFleetForm(rawSections);
      const resolvedGridOverride = importedFleetForm ? "none" : gridOverride;

      // ✅ Single canonical normalizer (shared with other flows)
      const sections = prepareSectionsWithCornerGrid(
        rawSections,
        vehicleType,
        resolvedGridOverride,
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
        if (importedFleetForm) params.grid = "none";

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
    <PageShell
      eyebrow="Inspection"
      title="Preparing inspection"
      description="Normalizing template sections and launching run mode."
    >
      <Card className="mx-auto w-full max-w-3xl px-4 py-4 text-sm text-[var(--theme-text-secondary,var(--theme-text-muted))]">
        Preparing inspection…
      </Card>
    </PageShell>
  );
}

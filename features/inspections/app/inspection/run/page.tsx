// features/inspections/app/inspection/run/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

import type { Database } from "@shared/types/types/supabase";
import { inspectionSectionsRequireEquipment } from "@/features/equipment/lib/equipmentInspectionContent";
import {
  isInspectionFormContextEmpty,
  normalizeInspectionFormContext,
} from "@inspections/lib/form-import";
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

type EquipmentPreparationError = {
  message: string;
  retryable: boolean;
};

function isImportedFleetForm(sections: Section[]): boolean {
  return sections.some((section) =>
    (section.items ?? []).some((item) => Boolean(item.fieldType)),
  );
}

async function verifyEquipmentAccess(sections: Section[]): Promise<"allowed" | "denied" | "error"> {
  if (!inspectionSectionsRequireEquipment(sections)) return "allowed";

  try {
    const response = await fetch("/api/equipment/entitlement", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return "error";
    const payload = (await response.json()) as { enabled?: boolean };
    return payload.enabled === true ? "allowed" : "denied";
  } catch {
    return "error";
  }
}

export default function RunInspectionPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [equipmentPreparationError, setEquipmentPreparationError] =
    useState<EquipmentPreparationError | null>(null);
  const [equipmentVerificationAttempt, setEquipmentVerificationAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setEquipmentPreparationError(null);

    const authorizeEquipment = async (sections: Section[]) => {
      const result = await verifyEquipmentAccess(sections);
      if (!active) return false;
      if (result === "allowed") return true;
      if (result === "denied") {
        setEquipmentPreparationError({
          message:
            "An active Equipment subscription is required to run this inspection.",
          retryable: false,
        });
        return false;
      }
      setEquipmentPreparationError({
        message:
          "Equipment access could not be verified. Retry before starting this inspection.",
        retryable: true,
      });
      return false;
    };

    const prepare = async () => {
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

        if (!(await authorizeEquipment(sections))) return;

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
      const { data, error } = await supabase
        .from("inspection_templates")
        .select("id, template_name, sections, vehicle_type, form_context")
        .eq("id", templateId)
        .maybeSingle<TemplateRow>();

      if (!active) return;
      if (error || !data) {
        // eslint-disable-next-line no-console
        console.error("Failed to load inspection template:", error);
        router.replace("/inspections/templates");
        return;
      }

      const rawSections = (data.sections ?? []) as Section[];
      if (!(await authorizeEquipment(rawSections))) return;

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

        // An imported customer form carries the parts of the paper document
        // that are not checklist rows: its trip header, printed statements,
        // free-text boxes and completion block. Stage them alongside the
        // sections so the run and the report stay the customer's form.
        const formContext = normalizeInspectionFormContext(
          (data as TemplateRow & { form_context?: unknown }).form_context,
        );
        // Stamp the template this context belongs to. sessionStorage outlives a
        // single inspection, and every other launcher stages
        // inspection:sections without knowing this key exists, so an unstamped
        // value would follow the tab onto the next, unrelated inspection and
        // print one customer's trip header and signatures on another's report.
        if (isInspectionFormContextEmpty(formContext)) {
          sessionStorage.removeItem("inspection:formContext");
        } else {
          sessionStorage.setItem(
            "inspection:formContext",
            JSON.stringify({ templateId: data.id, context: formContext }),
          );
        }

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
    };

    void prepare();
    return () => {
      active = false;
    };
  }, [sp, router, supabase, equipmentVerificationAttempt]);

  return (
    <PageShell
      eyebrow="Inspection"
      title="Preparing inspection"
      description="Normalizing template sections and launching run mode."
    >
      <Card className="mx-auto w-full max-w-3xl px-4 py-4 text-sm text-[var(--theme-text-secondary,var(--theme-text-muted))]">
        {equipmentPreparationError ? (
          <div className="space-y-3">
            <p>{equipmentPreparationError.message}</p>
            <div className="flex flex-wrap gap-2">
              {equipmentPreparationError.retryable ? (
                <button
                  type="button"
                  onClick={() =>
                    setEquipmentVerificationAttempt((current) => current + 1)
                  }
                  className="rounded-full border border-[var(--theme-border-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-text-primary)]"
                >
                  Retry verification
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => router.replace("/inspections/templates")}
                className="rounded-full border border-[var(--theme-border-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-text-primary)]"
              >
                Return to templates
              </button>
            </div>
          </div>
        ) : (
          "Preparing inspection…"
        )}
      </Card>
    </PageShell>
  );
}

"use client";

// Shared with app/work-orders/[id]/Client.tsx's openInspectionForLine, which
// fetches the same inspection_templates row, stages the same sessionStorage
// keys, and builds the same /inspections/fill URL — but opens it in an
// in-page modal/iframe with embed=1, since that flow always runs from
// within the work order page itself.
//
// This version exists for callers with no such page context — right now
// only the Technician CoPilot, whose persistent shell (AppShell/MobileShell)
// can be showing any page when it resolves inspection.start — so it does a
// full-page navigation instead (no embed=1) and skips customer/vehicle
// prefill, which the inspection form treats as optional display-only data
// (see GenericInspectionScreen's customer/vehicle useMemos): the technician
// just won't see those fields pre-filled, but the work order/line linkage
// via workOrderId/workOrderLineId is unaffected.
//
// GenericInspectionScreen sources its sections from
// sessionStorage["inspection:sections"] only, falling back to a generic
// two-item template if that key is empty — it does NOT re-fetch by
// templateId itself. So staging sessionStorage here (in the same tab the
// CoPilot's shell is mounted in) before navigating is not an optimization;
// skipping it would silently open the wrong, generic inspection instead of
// the real template.
import type { SupabaseClient } from "@supabase/supabase-js";

import { prepareSectionsWithCornerGrid } from "@inspections/lib/inspection/prepareSectionsWithCornerGrid";

type TemplateSectionItem = { item: string; unit?: string | null };
type TemplateSection = { title: string; items: TemplateSectionItem[] };

export type StartInspectionNavigationInput = {
  supabase: SupabaseClient;
  workOrderId: string;
  workOrderLineId: string;
  templateId: string;
};

export type StartInspectionNavigationResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

export async function prepareInspectionNavigation(
  input: StartInspectionNavigationInput,
): Promise<StartInspectionNavigationResult> {
  const { data, error } = await input.supabase
    .from("inspection_templates")
    .select("template_name, sections, vehicle_type")
    .eq("id", input.templateId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, reason: "Unable to load inspection template." };
  }

  const rawSections = (data.sections ?? []) as TemplateSection[];
  const vehicleType = String(data.vehicle_type ?? "");
  const sections = prepareSectionsWithCornerGrid(rawSections, vehicleType, null);
  const templateName = (data.template_name as string | null) ?? null;
  const title = templateName ?? "Inspection";

  if (typeof window !== "undefined") {
    const paramsObj: Record<string, string> = {
      workOrderId: input.workOrderId,
      work_order_id: input.workOrderId,
      workOrderLineId: input.workOrderLineId,
      work_order_line_id: input.workOrderLineId,
      lineId: input.workOrderLineId,
      templateId: input.templateId,
      template_id: input.templateId,
    };
    if (templateName) {
      paramsObj.templateName = templateName;
      paramsObj.template_name = templateName;
    }

    sessionStorage.setItem("inspection:sections", JSON.stringify(sections));
    sessionStorage.setItem("inspection:title", title);
    sessionStorage.setItem("inspection:vehicleType", vehicleType);
    sessionStorage.setItem("inspection:template", "generic");
    sessionStorage.setItem("inspection:params", JSON.stringify(paramsObj));
  }

  const sp = new URLSearchParams();
  sp.set("template", "generic");
  sp.set("workOrderId", input.workOrderId);
  sp.set("work_order_id", input.workOrderId);
  sp.set("workOrderLineId", input.workOrderLineId);
  sp.set("work_order_line_id", input.workOrderLineId);
  sp.set("lineId", input.workOrderLineId);
  sp.set("templateId", input.templateId);
  sp.set("template_id", input.templateId);
  if (templateName) {
    sp.set("templateName", templateName);
    sp.set("template_name", templateName);
  }

  return { ok: true, url: `/inspections/fill?${sp.toString()}` };
}

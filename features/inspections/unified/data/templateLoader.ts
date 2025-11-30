"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type {
  InspectionTemplate,
  InspectionSection,
} from "@inspections/lib/inspection/types";

type DB = Database;
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"];

function mapRowToInspectionTemplate(row: TemplateRow): InspectionTemplate {
  return {
    id: row.id,
    templateName: row.template_name ?? "Untitled Template",
    description: row.description ?? null,
    tags: (row.tags as string[] | null) ?? null,
    vehicleType: row.vehicle_type ?? null,
    isPublic: row.is_public ?? null,
    laborHours: row.labor_hours ?? null,
    sections: ((row.sections as unknown) as InspectionSection[]) ?? [],
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * Load an inspection template from Supabase and map it to unified shape.
 */
export async function loadInspectionTemplateUnified(
  templateId: string,
): Promise<InspectionTemplate | null> {
  const supabase = createClientComponentClient<DB>();

  const { data, error } = await supabase
    .from("inspection_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.debug("loadInspectionTemplateUnified error", error);
    return null;
  }

  return mapRowToInspectionTemplate(data);
}

/**
 * Helper: extract sections from a loaded template.
 */
export function templateToSectionsUnified(
  template: InspectionTemplate,
): InspectionSection[] {
  return (template.sections as InspectionSection[]) ?? [];
}

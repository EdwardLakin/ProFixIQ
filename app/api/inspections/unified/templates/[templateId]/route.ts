// app/api/inspections/unified/templates/[templateId]/route.ts
import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import type {
  InspectionTemplate,
  InspectionSection,
} from "@inspections/lib/inspection/types";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type DB = Database;
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"];

function mapRowToInspectionTemplate(row: TemplateRow): InspectionTemplate {
  // Labor hours – some schemas have this as an optional column
  const laborHours =
    (row as TemplateRow & { labor_hours?: number | null }).labor_hours ?? null;

  // Sections come from a JSONB column; normalise to InspectionSection[]
  const sectionsRaw = (row.sections ?? []) as unknown;
  const sections: InspectionSection[] = Array.isArray(sectionsRaw)
    ? (sectionsRaw as InspectionSection[])
    : [];

  return {
    id: String(row.id),
    templateName: row.template_name ?? "Untitled Template",
    description: row.description ?? null,
    tags: (row.tags as string[] | null) ?? null,
    vehicleType: row.vehicle_type ?? null,
    isPublic: row.is_public ?? null,
    laborHours,
    sections,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: { templateId: string } },
) {
  const supabase = createAdminSupabase();
  const id = params.templateId;

  const { data, error } = await supabase
    .from("inspection_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle<TemplateRow>();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.debug("unified template load error", error);
    return NextResponse.json(
      { ok: false, error: "Template not found", template: null },
      { status: 404 },
    );
  }

  const template = mapRowToInspectionTemplate(data);

  return NextResponse.json({ ok: true, template });
}
import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import type {
  InspectionTemplate,
  InspectionSection,
} from "@inspections/lib/inspection/types";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type DB = Database;
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"];

/**
 * Helper: extract templateId from URL path so we don't depend
 * on Next.js RouteContext typing (which Vercel's worker dislikes).
 *
 * Path shape:
 *   /api/inspections/unified/templates/[templateId]
 * Segments:
 *   ["api","inspections","unified","templates","123"]
 */
function extractTemplateId(req: Request): string | null {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const idx = segments.indexOf("templates");

  if (idx !== -1 && segments.length > idx + 1) {
    return segments[idx + 1];
  }

  return null;
}

function mapRowToInspectionTemplate(row: TemplateRow): InspectionTemplate {
  // Labor hours – optional column on some schemas
  const rowWithLabor = row as TemplateRow & {
    labor_hours?: number | null;
  };
  const laborHours = rowWithLabor.labor_hours ?? null;

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

export async function GET(req: Request) {
  const templateId = extractTemplateId(req);

  if (!templateId) {
    return NextResponse.json(
      { ok: false, error: "Missing templateId in route path", template: null },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("inspection_templates")
    .select("*")
    .eq("id", templateId)
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
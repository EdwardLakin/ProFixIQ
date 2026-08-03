import { NextResponse } from "next/server";

import { normalizeInspectionFormSections } from "@/features/inspections/lib/form-import";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type Context = { params: Promise<{ jobId: string }> };

export async function POST(req: Request, context: Context) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin", "manager", "advisor", "service"],
  });
  if (!access.ok) return access.response;

  const { jobId } = await context.params;
  const body = (await req.json().catch(() => null)) as
    | { title?: unknown; sections?: unknown }
    | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 160) : "";
  const sections = normalizeInspectionFormSections(body?.sections);
  if (!title || !sections.length) {
    return NextResponse.json(
      { error: "A title and at least one section are required." },
      { status: 400 },
    );
  }

  const { data: templateId, error } = await access.supabase.rpc(
    "approve_inspection_form_import",
    {
      p_job_id: jobId,
      p_title: title,
      p_sections: sections,
    },
  );
  if (error || !templateId) {
    return NextResponse.json(
      { error: error?.message || "Unable to approve the inspection template." },
      { status: error?.code === "P0001" ? 409 : 500 },
    );
  }

  return NextResponse.json({ ok: true, templateId });
}

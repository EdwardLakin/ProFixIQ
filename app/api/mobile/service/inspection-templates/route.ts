import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";

import {
  isInspectionTemplateId,
  validateInspectionTemplateMutation,
} from "@/features/inspections/server/inspectionTemplateMutation";
import { requireMobileServiceOperatorApiAccess } from "@/features/mobile/service/server/access";

type TemplateInsert =
  Database["public"]["Tables"]["inspection_templates"]["Insert"];
type TemplateUpdate =
  Database["public"]["Tables"]["inspection_templates"]["Update"];

function databaseFailure(
  method: string,
  error: { code?: string | null; message: string },
) {
  console.error(`[field-inspection-templates] ${method} failed`, {
    code: error.code ?? null,
    message: error.message,
  });
  if (method === "delete" && error.code === "23503") {
    return NextResponse.json(
      { error: "This inspection template is in use and cannot be deleted." },
      { status: 409 },
    );
  }
  if (method === "delete" && error.code === "40P01") {
    return NextResponse.json(
      { error: "The inspection template changed concurrently. Try again." },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { error: "The inspection template could not be saved." },
    { status: 500 },
  );
}

async function requireManager() {
  const access = await requireMobileServiceOperatorApiAccess();
  if (!access.ok) return access;
  if (!access.managementRole) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return access;
}

async function readMutation(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  return { body, validation: validateInspectionTemplateMutation(body) };
}

function hasOwnField(body: unknown, field: string) {
  return (
    typeof body === "object" &&
    body !== null &&
    Object.prototype.hasOwnProperty.call(body, field)
  );
}

export async function POST(request: Request) {
  const access = await requireManager();
  if (!access.ok) return access.response;

  const { validation } = await readMutation(request);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const input = validation.value;
  const payload: TemplateInsert = {
    template_name: input.templateName,
    sections: input.sections,
    description: input.description,
    vehicle_type: input.vehicleType,
    tags: input.tags,
    labor_hours: input.laborHours,
    is_public: false,
    shop_id: access.profile.shop_id,
    user_id: access.authUserId,
  };
  const { data, error } = await access.supabase
    .from("inspection_templates")
    .insert(payload)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return databaseFailure("create", error);
  if (!data?.id) {
    return NextResponse.json(
      { error: "The inspection template was not created." },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await requireManager();
  if (!access.ok) return access.response;

  const { body, validation } = await readMutation(request);
  const templateId =
    typeof body === "object" && body !== null && "templateId" in body
      ? (body as { templateId?: unknown }).templateId
      : null;
  if (!isInspectionTemplateId(templateId)) {
    return NextResponse.json(
      { error: "A valid template id is required." },
      { status: 400 },
    );
  }
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const input = validation.value;
  const payload: TemplateUpdate = {
    template_name: input.templateName,
    sections: input.sections,
  };
  if (hasOwnField(body, "description")) payload.description = input.description;
  if (hasOwnField(body, "vehicleType"))
    payload.vehicle_type = input.vehicleType;
  if (hasOwnField(body, "tags")) payload.tags = input.tags;
  if (hasOwnField(body, "laborHours")) payload.labor_hours = input.laborHours;
  const { data, error } = await access.supabase
    .from("inspection_templates")
    .update(payload)
    .eq("id", templateId.trim())
    .eq("shop_id", access.profile.shop_id)
    .eq("user_id", access.authUserId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return databaseFailure("update", error);
  if (!data?.id) {
    return NextResponse.json(
      { error: "Inspection template not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ id: data.id });
}

export async function DELETE(request: Request) {
  const access = await requireManager();
  if (!access.ok) return access.response;

  const templateId = new URL(request.url).searchParams.get("templateId");
  if (!isInspectionTemplateId(templateId)) {
    return NextResponse.json(
      { error: "A valid template id is required." },
      { status: 400 },
    );
  }

  const { data, error } = await access.supabase
    .from("inspection_templates")
    .delete()
    .eq("id", templateId.trim())
    .eq("shop_id", access.profile.shop_id)
    .eq("user_id", access.authUserId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return databaseFailure("delete", error);
  if (!data?.id) {
    return NextResponse.json(
      { error: "Inspection template not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ id: data.id });
}

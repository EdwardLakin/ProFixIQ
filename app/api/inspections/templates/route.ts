import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";

import { shopCanMutateInspectionSections } from "@/features/equipment/server/equipmentInspectionEntitlement";
import {
  isInspectionTemplateId,
  validateInspectionTemplateMutation,
} from "@/features/inspections/server/inspectionTemplateMutation";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type TemplateInsert =
  Database["public"]["Tables"]["inspection_templates"]["Insert"];
type TemplateUpdate =
  Database["public"]["Tables"]["inspection_templates"]["Update"];

function databaseFailure(error: { message: string }) {
  console.error("[shop-inspection-templates] mutation failed", error);
  return NextResponse.json(
    { error: "The inspection template could not be saved." },
    { status: 500 },
  );
}

function hasOwnField(body: unknown, field: string) {
  return (
    typeof body === "object" &&
    body !== null &&
    Object.prototype.hasOwnProperty.call(body, field)
  );
}

async function readMutation(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  return { body, validation: validateInspectionTemplateMutation(body) };
}

async function equipmentMutationFailure(shopId: string, sections: unknown) {
  try {
    const allowed = await shopCanMutateInspectionSections(shopId, sections);
    if (allowed) return null;
    return NextResponse.json(
      { error: "An active Equipment subscription is required for this inspection template." },
      { status: 403 },
    );
  } catch (error) {
    console.error("[shop-inspection-templates] Equipment entitlement failed", {
      shopId,
      error,
    });
    return NextResponse.json(
      { error: "Equipment entitlement could not be verified. Try again." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const { validation } = await readMutation(request);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const input = validation.value;
  const equipmentFailure = await equipmentMutationFailure(
    access.profile.shop_id,
    input.sections,
  );
  if (equipmentFailure) return equipmentFailure;

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

  if (error) return databaseFailure(error);
  if (!data?.id) {
    return NextResponse.json(
      { error: "The inspection template was not created." },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await requireShopScopedApiAccess();
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
  const equipmentFailure = await equipmentMutationFailure(
    access.profile.shop_id,
    input.sections,
  );
  if (equipmentFailure) return equipmentFailure;

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

  if (error) return databaseFailure(error);
  if (!data?.id) {
    return NextResponse.json(
      { error: "Inspection template not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ id: data.id });
}

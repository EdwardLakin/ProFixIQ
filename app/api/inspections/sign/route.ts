// app/api/inspections/sign/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type SignInspectionArgs = {
  p_inspection_id: string;
  p_role: "technician" | "customer" | "advisor";
  p_signed_name: string;
  p_signature_image_path: string | null;
  p_signature_hash: string | null;
};

type Role = SignInspectionArgs["p_role"];
type InspectionInsert = Database["public"]["Tables"]["inspections"]["Insert"];

type SignRequestBody = {
  inspectionId?: string;
  workOrderLineId?: string;
  role: Role;
  signedName: string;
  signatureImagePath?: string | null;
  signatureHash?: string | null;
};

const ALLOWED_ROLES: Role[] = ["technician", "customer", "advisor"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return UUID_RE.test(normalized) ? normalized : null;
}

function isSignRequestBody(value: unknown): value is SignRequestBody {
  if (!isRecord(value)) return false;
  if (!cleanUuid(value.inspectionId) && !cleanUuid(value.workOrderLineId)) {
    return false;
  }
  if (typeof value.signedName !== "string") return false;
  if (typeof value.role !== "string") return false;
  return ALLOWED_ROLES.includes(value.role as Role);
}

type Supabase = ReturnType<typeof createServerSupabaseRoute>;
type RpcReturn = { data: unknown; error: { message: string } | null };
type ResolveInspectionResult =
  | { ok: true; inspectionId: string }
  | { ok: false; error: string; status: number };

async function callSignInspectionRpc(
  client: Supabase,
  args: SignInspectionArgs,
): Promise<RpcReturn> {
  return (client as unknown as {
    rpc: (fn: string, args: SignInspectionArgs) => Promise<RpcReturn>;
  }).rpc("sign_inspection", args);
}

/**
 * Resolve the canonical, shop-scoped inspection row.
 *
 * Mobile inspections begin with a local UUID. Creating a bare row with only
 * that ID and shop violates `inspections_anchor_chk`, so a missing mobile row
 * is created only after its work-order line and work-order anchors have been
 * validated. Existing desktop callers that provide only an inspection ID must
 * already have a persisted row.
 */
async function resolveInspectionForSigning(args: {
  supabase: Supabase;
  requestedInspectionId: string | null;
  workOrderLineId: string | null;
  shopId: string;
  actorUserId: string;
}): Promise<ResolveInspectionResult> {
  const {
    supabase,
    requestedInspectionId,
    workOrderLineId,
    shopId,
    actorUserId,
  } = args;

  if (!workOrderLineId) {
    if (!requestedInspectionId) {
      return {
        ok: false,
        error: "A persisted inspection or work-order line is required.",
        status: 400,
      };
    }

    const existing = await supabase
      .from("inspections")
      .select("id")
      .eq("id", requestedInspectionId)
      .eq("shop_id", shopId)
      .maybeSingle<{ id: string }>();

    if (existing.error) {
      return { ok: false, error: existing.error.message, status: 400 };
    }
    if (!existing.data?.id) {
      return {
        ok: false,
        error: "Save the inspection before signing it.",
        status: 409,
      };
    }
    return { ok: true, inspectionId: existing.data.id };
  }

  const lineResult = await supabase
    .from("work_order_lines")
    .select("id, work_order_id")
    .eq("id", workOrderLineId)
    .eq("shop_id", shopId)
    .maybeSingle<{ id: string; work_order_id: string | null }>();

  if (lineResult.error) {
    return { ok: false, error: lineResult.error.message, status: 400 };
  }

  const line = lineResult.data;
  if (!line?.id || !line.work_order_id) {
    return {
      ok: false,
      error: "Work-order line was not found for this shop.",
      status: 404,
    };
  }

  const canonicalLineId = line.id;
  const canonicalWorkOrderId = line.work_order_id;
  const findCanonical = async () =>
    supabase
      .from("inspections")
      .select("id")
      .eq("shop_id", shopId)
      .eq("work_order_line_id", canonicalLineId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

  const existing = await findCanonical();
  if (existing.error) {
    return { ok: false, error: existing.error.message, status: 400 };
  }
  if (existing.data?.id) {
    return { ok: true, inspectionId: existing.data.id };
  }

  const insertPayload: InspectionInsert = {
    ...(requestedInspectionId ? { id: requestedInspectionId } : {}),
    work_order_id: canonicalWorkOrderId,
    work_order_line_id: canonicalLineId,
    shop_id: shopId,
    user_id: actorUserId,
    summary: {},
    is_draft: true,
    completed: false,
    locked: false,
    status: "draft",
  };

  const inserted = await supabase
    .from("inspections")
    .insert(insertPayload)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (!inserted.error && inserted.data?.id) {
    return { ok: true, inspectionId: inserted.data.id };
  }

  // A concurrent first save/sign may have inserted the canonical row. Re-read
  // before surfacing the insert error so retries remain harmless.
  const raced = await findCanonical();
  if (!raced.error && raced.data?.id) {
    return { ok: true, inspectionId: raced.data.id };
  }

  return {
    ok: false,
    error:
      inserted.error?.message ||
      raced.error?.message ||
      "Unable to create an anchored inspection.",
    status: 400,
  };
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const userResult = await supabase.auth.getUser();
  const user = userResult.data.user;
  if (userResult.error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyUnknown = (await req.json().catch(() => null)) as unknown;
  if (!isSignRequestBody(bodyUnknown)) {
    return NextResponse.json(
      {
        error:
          "A valid inspectionId or workOrderLineId, role, and signedName are required.",
      },
      { status: 400 },
    );
  }

  const {
    role,
    signedName,
    signatureImagePath,
    signatureHash,
  } = bodyUnknown;
  const requestedInspectionId = cleanUuid(bodyUnknown.inspectionId);
  const workOrderLineId = cleanUuid(bodyUnknown.workOrderLineId);

  const profileResult = await supabase
    .from("profiles")
    .select(
      "shop_id, full_name, tech_signature_path, tech_signature_hash",
    )
    .eq("id", user.id)
    .maybeSingle<{
      shop_id: string | null;
      full_name: string | null;
      tech_signature_path: string | null;
      tech_signature_hash: string | null;
    }>();

  if (profileResult.error) {
    return NextResponse.json(
      { error: `Unable to read profile: ${profileResult.error.message}` },
      { status: 400 },
    );
  }

  const profile = profileResult.data;
  const shopId = profile?.shop_id ?? null;
  if (!shopId) {
    return NextResponse.json(
      { error: "Your profile is missing shop_id; cannot sign inspection." },
      { status: 403 },
    );
  }

  const authMetadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name.trim()
        : "";
  const profileName = (profile?.full_name ?? "").trim() || authMetadataName;
  const effectiveSignedName =
    role === "technician" ? profileName : signedName.trim();

  if (!effectiveSignedName) {
    return NextResponse.json(
      {
        error:
          role === "technician"
            ? "Add your full name to your profile before signing."
            : "Signed name is required.",
      },
      { status: 400 },
    );
  }

  const effectiveSignatureImagePath =
    role === "technician"
      ? profile?.tech_signature_path ?? null
      : signatureImagePath ?? null;
  const effectiveSignatureHash =
    role === "technician"
      ? profile?.tech_signature_hash ?? null
      : signatureHash ?? null;

  if (role === "technician" && !effectiveSignatureImagePath) {
    return NextResponse.json(
      { error: "No saved technician signature. Add one in Tech Settings." },
      { status: 409 },
    );
  }

  const resolved = await resolveInspectionForSigning({
    supabase,
    requestedInspectionId,
    workOrderLineId,
    shopId,
    actorUserId: user.id,
  });
  if (resolved.ok === false) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const { data, error } = await callSignInspectionRpc(supabase, {
    p_inspection_id: resolved.inspectionId,
    p_role: role,
    p_signed_name: effectiveSignedName,
    p_signature_image_path: effectiveSignatureImagePath,
    p_signature_hash: effectiveSignatureHash,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    data,
    inspectionId: resolved.inspectionId,
    signedName: effectiveSignedName,
  });
}

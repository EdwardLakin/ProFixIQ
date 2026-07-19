// app/api/inspections/sign/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

/**
 * SQL function:
 * public.sign_inspection(
 *   p_inspection_id uuid,
 *   p_role text,
 *   p_signed_name text,
 *   p_signature_image_path text default null,
 *   p_signature_hash text default null
 * )
 */
type SignInspectionArgs = {
  p_inspection_id: string;
  p_role: "technician" | "customer" | "advisor";
  p_signed_name: string;
  p_signature_image_path: string | null;
  p_signature_hash: string | null;
};

type Role = SignInspectionArgs["p_role"];

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

  const inspectionId = cleanUuid(value.inspectionId);
  const workOrderLineId = cleanUuid(value.workOrderLineId);
  const role = value.role;
  const signedName = value.signedName;

  if (!inspectionId && !workOrderLineId) return false;
  if (typeof signedName !== "string") return false;
  if (typeof role !== "string") return false;

  return ALLOWED_ROLES.includes(role as Role);
}

type Supabase = ReturnType<typeof createServerSupabaseRoute>;

type RpcReturn = {
  data: unknown;
  error: { message: string } | null;
};

type ResolveInspectionResult =
  | { ok: true; inspectionId: string }
  | { ok: false; error: string; status: number };

/**
 * Call RPC WITHOUT detaching `client.rpc` (it relies on `this.rest`).
 */
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
 * Mobile inspection screens start with a local UUID before the first database
 * save. A bare `{ id, shop_id }` insert violates `inspections_anchor_chk`, so a
 * missing mobile row is created only after its work-order line and work-order
 * anchors have been validated. Existing desktop callers that provide only an
 * inspection ID must already have a persisted inspection.
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

  const line = await supabase
    .from("work_order_lines")
    .select("id, work_order_id")
    .eq("id", workOrderLineId)
    .eq("shop_id", shopId)
    .maybeSingle<{ id: string; work_order_id: string | null }>();

  if (line.error) {
    return { ok: false, error: line.error.message, status: 400 };
  }
  if (!line.data?.id || !line.data.work_order_id) {
    return {
      ok: false,
      error: "Work-order line was not found for this shop.",
      status: 404,
    };
  }

  const findCanonical = async () =>
    supabase
      .from("inspections")
      .select("id")
      .eq("shop_id", shopId)
      .eq("work_order_line_id", line.data.id)
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

  const insertPayload = {
    ...(requestedInspectionId ? { id: requestedInspectionId } : {}),
    work_order_id: line.data.work_order_id,
    work_order_line_id: line.data.id,
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

  const userRes = await supabase.auth.getUser();
  const user = userRes.data.user;
  if (userRes.error || !user) {
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

  let effectiveSignedName = signedName.trim();
  if (!effectiveSignedName && role === "technician") {
    const profileNameRes = await supabase
      .from("profiles")
      .select("full_name, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle<{
        full_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
      }>();

    if (!profileNameRes.error) {
      const full = (profileNameRes.data?.full_name ?? "").trim();
      const joined = `${profileNameRes.data?.first_name ?? ""} ${
        profileNameRes.data?.last_name ?? ""
      }`.trim();
      effectiveSignedName = full || joined;
    }
  }

  if (!effectiveSignedName) {
    return NextResponse.json(
      { error: "Signed name is required." },
      { status: 400 },
    );
  }

  const profile = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  if (profile.error) {
    return NextResponse.json(
      { error: `Unable to read profile: ${profile.error.message}` },
      { status: 400 },
    );
  }

  const shopId = profile.data?.shop_id ?? null;
  if (!shopId) {
    return NextResponse.json(
      { error: "Your profile is missing shop_id; cannot sign inspection." },
      { status: 403 },
    );
  }

  const resolved = await resolveInspectionForSigning({
    supabase,
    requestedInspectionId,
    workOrderLineId,
    shopId,
    actorUserId: user.id,
  });

  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const rpcArgs: SignInspectionArgs = {
    p_inspection_id: resolved.inspectionId,
    p_role: role,
    p_signed_name: effectiveSignedName,
    p_signature_image_path: signatureImagePath ?? null,
    p_signature_hash: signatureHash ?? null,
  };

  const { data, error } = await callSignInspectionRpc(supabase, rpcArgs);
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

// app/api/inspections/sign/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

type Role = "technician" | "customer" | "advisor";

type SignInspectionArgs = {
  p_inspection_id: string;
  p_role: Role;
  p_signed_name: string;
  p_signature_image_path: string | null;
  p_signature_hash: string | null;
  p_expected_sync_revision: number;
};

type SignRequestBody = {
  inspectionId?: string;
  workOrderLineId?: string;
  role: Role;
  signedName: string;
  signatureImagePath?: string | null;
  signatureHash?: string | null;
  expectedSyncRevision: number;
};

type ProfileRow = {
  shop_id: string | null;
  role: string | null;
  full_name: string | null;
  tech_signature_path: string | null;
  tech_signature_hash: string | null;
};

const ALLOWED_ROLES: Role[] = ["technician", "customer", "advisor"];
const ADVISOR_PROFILE_ROLES = new Set([
  "advisor",
  "service_advisor",
  "service advisor",
  "owner",
  "admin",
  "manager",
]);
const TECHNICIAN_PROFILE_ROLES = new Set([
  "technician",
  "tech",
  "mechanic",
  "owner",
  "admin",
  "manager",
  "foreman",
  "lead_hand",
  "lead hand",
]);
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

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function profileName(profile: ProfileRow): string | null {
  return cleanText(profile.full_name);
}

function isSignRequestBody(value: unknown): value is SignRequestBody {
  if (!isRecord(value)) return false;
  if (!cleanUuid(value.inspectionId) && !cleanUuid(value.workOrderLineId)) {
    return false;
  }
  if (typeof value.signedName !== "string") return false;
  if (typeof value.role !== "string") return false;
  if (
    !Number.isSafeInteger(value.expectedSyncRevision) ||
    Number(value.expectedSyncRevision) < 1
  ) {
    return false;
  }
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
  return (
    client as unknown as {
      rpc: (fn: string, args: SignInspectionArgs) => Promise<RpcReturn>;
    }
  ).rpc("sign_inspection", args);
}

async function resolveInspectionForSigning(args: {
  supabase: Supabase;
  requestedInspectionId: string | null;
  workOrderLineId: string | null;
  shopId: string;
}): Promise<ResolveInspectionResult> {
  const { supabase, requestedInspectionId, workOrderLineId, shopId } = args;

  if (workOrderLineId) {
    const lineResult = await supabase
      .from("work_order_lines")
      .select("id")
      .eq("id", workOrderLineId)
      .eq("shop_id", shopId)
      .maybeSingle<{ id: string }>();

    if (lineResult.error) {
      return { ok: false, error: lineResult.error.message, status: 400 };
    }
    if (!lineResult.data?.id) {
      return {
        ok: false,
        error: "Work-order line was not found for this shop.",
        status: 404,
      };
    }

    const canonical = await supabase
      .from("inspections")
      .select("id")
      .eq("shop_id", shopId)
      .eq("work_order_line_id", lineResult.data.id)
      .eq("is_canonical", true)
      .maybeSingle<{ id: string }>();

    if (canonical.error) {
      return { ok: false, error: canonical.error.message, status: 400 };
    }
    if (canonical.data?.id) {
      return { ok: true, inspectionId: canonical.data.id };
    }

    return {
      ok: false,
      error:
        "Inspection has not finished autosaving. Wait a moment and sign again.",
      status: 409,
    };
  }

  if (!requestedInspectionId) {
    return {
      ok: false,
      error: "A saved inspection is required before signing.",
      status: 400,
    };
  }

  const existing = await supabase
    .from("inspections")
    .select("id")
    .eq("id", requestedInspectionId)
    .eq("shop_id", shopId)
    .eq("is_canonical", true)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existing.error) {
    return { ok: false, error: existing.error.message, status: 400 };
  }
  if (!existing.data?.id) {
    return {
      ok: false,
      error:
        "Inspection has not finished autosaving. Wait a moment and sign again.",
      status: 409,
    };
  }
  return { ok: true, inspectionId: existing.data.id };
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
          "A saved inspection revision, valid inspection context, role, and signedName are required.",
      },
      { status: 400 },
    );
  }

  const requestedInspectionId = cleanUuid(bodyUnknown.inspectionId);
  const workOrderLineId = cleanUuid(bodyUnknown.workOrderLineId);

  const profileColumns =
    "shop_id, full_name, tech_signature_path, tech_signature_hash, role";
  let profileResult = await supabase
    .from("profiles")
    .select(profileColumns)
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  // Older and imported staff profiles can keep the auth identity in user_id
  // while id remains the employee/profile identity. Both are valid in ProFixIQ.
  if (!profileResult.data && !profileResult.error) {
    profileResult = await supabase
      .from("profiles")
      .select(profileColumns)
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle<ProfileRow>();
  }

  const profile = profileResult.data;
  const profileError = profileResult.error;
  if (profileError) {
    return NextResponse.json(
      { error: `Unable to read profile: ${profileError.message}` },
      { status: 400 },
    );
  }
  if (!profile?.shop_id) {
    return NextResponse.json(
      { error: "Your profile is missing shop_id; cannot sign inspection." },
      { status: 403 },
    );
  }

  const authMetadataName =
    typeof user.user_metadata?.full_name === "string"
      ? cleanText(user.user_metadata.full_name)
      : typeof user.user_metadata?.name === "string"
        ? cleanText(user.user_metadata.name)
        : null;

  let effectiveSignedName = cleanText(bodyUnknown.signedName);
  let effectiveSignaturePath = cleanText(bodyUnknown.signatureImagePath);
  let effectiveSignatureHash = cleanText(bodyUnknown.signatureHash);

  if (bodyUnknown.role === "technician") {
    if (
      !TECHNICIAN_PROFILE_ROLES.has(
        String(profile.role ?? "")
          .trim()
          .toLowerCase(),
      )
    ) {
      return NextResponse.json(
        { error: "Your profile cannot sign as a technician." },
        { status: 403 },
      );
    }

    // Technician identity and evidence are always server-owned; client-sent
    // signature fields cannot replace the saved profile signature.
    effectiveSignedName = profileName(profile) ?? authMetadataName;
    effectiveSignaturePath = cleanText(profile.tech_signature_path);
    effectiveSignatureHash = cleanText(profile.tech_signature_hash);

    if (!effectiveSignedName) {
      return NextResponse.json(
        { error: "Add your full name to your profile before signing." },
        { status: 409 },
      );
    }
    if (!effectiveSignaturePath || !effectiveSignatureHash) {
      return NextResponse.json(
        {
          error:
            "No valid saved technician signature exists. Add one in Tech Settings.",
        },
        { status: 409 },
      );
    }
  }

  if (bodyUnknown.role === "advisor") {
    if (
      !ADVISOR_PROFILE_ROLES.has(
        String(profile.role ?? "")
          .trim()
          .toLowerCase(),
      )
    ) {
      return NextResponse.json(
        { error: "Your profile cannot sign as a service advisor." },
        { status: 403 },
      );
    }
    effectiveSignedName = profileName(profile) ?? authMetadataName;
  }

  if (!effectiveSignedName) {
    return NextResponse.json(
      { error: "Signed name is required." },
      { status: 400 },
    );
  }

  const resolved = await resolveInspectionForSigning({
    supabase,
    requestedInspectionId,
    workOrderLineId,
    shopId: profile.shop_id,
  });
  if (resolved.ok === false) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const { data, error } = await callSignInspectionRpc(supabase, {
    p_inspection_id: resolved.inspectionId,
    p_role: bodyUnknown.role,
    p_signed_name: effectiveSignedName,
    p_signature_image_path: effectiveSignaturePath,
    p_signature_hash: effectiveSignatureHash,
    p_expected_sync_revision: bodyUnknown.expectedSyncRevision,
  });

  if (error) {
    const lower = error.message.toLowerCase();
    const status =
      lower.includes("not found") ||
      lower.includes("no saved") ||
      lower.includes("no valid saved") ||
      lower.includes("does not belong") ||
      lower.includes("changed on another device") ||
      lower.includes("finalized") ||
      lower.includes("locked") ||
      lower.includes("already signed") ||
      lower.includes("saved inspection revision")
        ? 409
        : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({
    success: true,
    data,
    inspectionId: resolved.inspectionId,
    signedName: effectiveSignedName,
  });
}


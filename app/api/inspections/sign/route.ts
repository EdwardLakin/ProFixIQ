// app/api/inspections/sign/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database as BaseDatabase } from "@shared/types/types/supabase";

/**
 * SQL function shape:
 * public.sign_inspection(p_inspection_id uuid, p_role text, p_signed_name text, p_signature_image_path text default null, p_signature_hash text default null)
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
  inspectionId: string;
  role: Role;
  signedName: string;
  signatureImagePath?: string | null;
  signatureHash?: string | null;
};

const ALLOWED_ROLES: Role[] = ["technician", "customer", "advisor"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isSignRequestBody(value: unknown): value is SignRequestBody {
  if (!isRecord(value)) return false;

  const inspectionId = value.inspectionId;
  const role = value.role;
  const signedName = value.signedName;

  if (typeof inspectionId !== "string" || inspectionId.trim().length < 8)
    return false;
  if (typeof signedName !== "string" || signedName.trim().length === 0)
    return false;
  if (typeof role !== "string") return false;

  return ALLOWED_ROLES.includes(role as Role);
}

type Supabase = ReturnType<typeof createRouteHandlerClient<BaseDatabase>>;

type RpcReturn = {
  data: unknown;
  error: { message: string } | null;
};

/**
 * Call RPC WITHOUT detaching `client.rpc` (it relies on `this.rest`)
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
 * Ensure the inspection row exists BEFORE signing.
 *
 * Use UPSERT (no SELECT) to avoid RLS read issues.
 * Since only `inspections.id` is NOT NULL, `{ id }` is sufficient.
 */
async function ensureInspectionExists(
  supabase: Supabase,
  inspectionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await supabase.from("inspections").upsert(
    { id: inspectionId },
    {
      onConflict: "id",
      ignoreDuplicates: true, // if it already exists, no-op
    },
  );

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<BaseDatabase>({ cookies });

  const userRes = await supabase.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isSignRequestBody(bodyUnknown)) {
    return NextResponse.json(
      { error: "inspectionId, role and signedName are required" },
      { status: 400 },
    );
  }

  const { inspectionId, role, signedName, signatureImagePath, signatureHash } =
    bodyUnknown;

  // ✅ Auto-create (or no-op if it already exists)
  const ensured = await ensureInspectionExists(supabase, inspectionId);
  if (!ensured.ok) {
    return NextResponse.json(
      {
        error:
          `Unable to auto-create inspection before signing: ${ensured.error}. ` +
          `This is usually an RLS INSERT/UPSERT policy issue on public.inspections.`,
      },
      { status: 400 },
    );
  }

  const rpcArgs: SignInspectionArgs = {
    p_inspection_id: inspectionId,
    p_role: role,
    p_signed_name: signedName.trim(),
    p_signature_image_path: signatureImagePath ?? null,
    p_signature_hash: signatureHash ?? null,
  };

  const { data, error } = await callSignInspectionRpc(supabase, rpcArgs);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, data });
}
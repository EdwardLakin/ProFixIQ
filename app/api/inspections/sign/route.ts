// app/api/inspections/sign/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database as BaseDatabase } from "@shared/types/types/supabase";

/**
 * Shape that matches the SQL function:
 *
 * create or replace function public.sign_inspection(
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
  inspectionId: string;
  role: Role;
  signedName: string;
  signatureImagePath?: string | null;
  signatureHash?: string | null;
};

const ALLOWED_ROLES: Role[] = ["technician", "customer", "advisor"];

function isSignRequestBody(value: unknown): value is SignRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  const inspectionId = v.inspectionId;
  const role = v.role;
  const signedName = v.signedName;

  if (typeof inspectionId !== "string") return false;
  if (typeof signedName !== "string") return false;
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
  // We keep the method call form: client.rpc(...)
  const res = (client as unknown as {
    rpc: (fn: string, args: SignInspectionArgs) => Promise<RpcReturn>;
  }).rpc("sign_inspection", args);

  return res;
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<BaseDatabase>({ cookies });

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

  // ✅ FIX: Ensure the parent inspection row exists before signing.
  // The UI can generate an inspection UUID and autosave locally; signing can happen
  // before the inspection is persisted to `public.inspections`, which triggers the FK:
  // inspection_signatures_inspection_id_fkey
  const { data: parent, error: parentErr } = await supabase
    .from("inspections")
    .select("id")
    .eq("id", inspectionId)
    .maybeSingle();

  if (parentErr) {
    return NextResponse.json({ error: parentErr.message }, { status: 400 });
  }

  if (!parent) {
    return NextResponse.json(
      {
        error:
          "Inspection not found in database. Click “Save Progress” first, then sign.",
      },
      { status: 409 },
    );
  }

  const rpcArgs: SignInspectionArgs = {
    p_inspection_id: inspectionId,
    p_role: role,
    p_signed_name: signedName,
    p_signature_image_path: signatureImagePath ?? null,
    p_signature_hash: signatureHash ?? null,
  };

  const { data, error } = await callSignInspectionRpc(supabase, rpcArgs);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, data });
}
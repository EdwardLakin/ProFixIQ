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

  /**
   * OPTIONAL snapshot to allow the API to auto-create the inspection row
   * when the inspection only exists locally (draft autosave).
   *
   * If you don't send this, the route will still attempt a minimal insert
   * (id-only) and rely on DB defaults. If your inspections table requires
   * additional NOT NULL fields without defaults, you'll need to send snapshot
   * (or update DB defaults).
   */
  snapshot?: Record<string, unknown> | null;
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

  if (typeof inspectionId !== "string" || inspectionId.length < 8) return false;
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

type DbError = { message?: string } | null;

/**
 * Call RPC WITHOUT detaching `client.rpc` (it relies on `this.rest`)
 */
async function callSignInspectionRpc(
  client: Supabase,
  args: SignInspectionArgs,
): Promise<RpcReturn> {
  const res = (client as unknown as {
    rpc: (fn: string, args: SignInspectionArgs) => Promise<RpcReturn>;
  }).rpc("sign_inspection", args);

  return res;
}

/**
 * Ensure the inspection row exists BEFORE signing.
 *
 * Strategy:
 *  1) SELECT inspections.id
 *  2) If missing: attempt INSERT
 *     - Prefer inserting a provided snapshot into a jsonb column if you have one.
 *     - Otherwise attempt minimal { id } insert and rely on DB defaults.
 *
 * IMPORTANT:
 *  - If your `inspections` table has required NOT NULL columns without defaults,
 *    the id-only insert will fail. In that case, send `snapshot` from the client
 *    (or add defaults on the DB side).
 */
async function ensureInspectionExists(args: {
  supabase: Supabase;
  inspectionId: string;
  snapshot?: Record<string, unknown> | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, inspectionId, snapshot } = args;

  // 1) check existence
  const existsRes = await supabase
    .from("inspections")
    .select("id")
    .eq("id", inspectionId)
    .maybeSingle();

  if (existsRes.error) {
    return {
      ok: false,
      error: `DB read failed: ${existsRes.error.message}`,
    };
  }

  if (existsRes.data?.id) {
    return { ok: true };
  }

  // 2) insert
  // We try to be conservative: always include id, optionally include a snapshot
  // under a common column name if your schema supports it.
  //
  // If your table does NOT have these columns, remove them OR switch to a DB RPC
  // like `upsert_inspection_snapshot(...)`.
  const baseInsert: Record<string, unknown> = {
    id: inspectionId,
  };

  // Try a few common snapshot column names (only ONE will succeed if it exists).
  // If none exist, we'll fall back to id-only.
  const candidatePayloads: Record<string, unknown>[] = [];

  if (snapshot && isRecord(snapshot)) {
    candidatePayloads.push({ ...baseInsert, snapshot }); // if you have `snapshot jsonb`
    candidatePayloads.push({ ...baseInsert, session: snapshot }); // if you have `session jsonb`
    candidatePayloads.push({ ...baseInsert, data: snapshot }); // if you have `data jsonb`
    candidatePayloads.push({ ...baseInsert, payload: snapshot }); // if you have `payload jsonb`
  }

  candidatePayloads.push(baseInsert); // id-only fallback

  let lastErr: DbError = null;

  for (const payload of candidatePayloads) {
    const insRes = await supabase.from("inspections").insert(payload).select("id").maybeSingle();

    if (!insRes.error) {
      return { ok: true };
    }

    lastErr = insRes.error;
    // keep trying next candidate
  }

  return {
    ok: false,
    error:
      lastErr?.message ||
      "Inspection not found and could not be auto-created (missing defaults or blocked by RLS).",
  };
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<BaseDatabase>({ cookies });

  // Optional but helpful: ensure the request is authenticated
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

  const { inspectionId, role, signedName, signatureImagePath, signatureHash, snapshot } =
    bodyUnknown;

  // ✅ Ensure inspection exists before signing (prevents FK errors + “not found”)
  const ensured = await ensureInspectionExists({
    supabase,
    inspectionId,
    snapshot: snapshot ?? null,
  });

  if (!ensured.ok) {
    return NextResponse.json(
      {
        error:
          `Inspection not found in database and auto-create failed. ` +
          `Reason: ${ensured.error}. ` +
          `If your inspections table requires NOT NULL fields, send a snapshot in the sign request ` +
          `or ensure DB defaults exist.`,
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
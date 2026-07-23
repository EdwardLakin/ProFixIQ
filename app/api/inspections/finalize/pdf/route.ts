// app/api/inspections/finalize/pdf/route.ts ✅ FULL FILE REPLACEMENT
import "server-only";

export const runtime = "nodejs";

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { createAdminClient } from "@/features/integrations/shopreel/server/createAdminClient";
import type { Database } from "@shared/types/types/supabase";
import { generateInspectionPDF } from "@/features/inspections/lib/inspection/pdf";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

type DB = Database;

type Body = {
  workOrderLineId?: string;
  expectedSyncRevision?: number;
};

type FinalizeInspectionArgs = {
  p_inspection_id: string;
  p_work_order_line_id: string;
  p_actor_user_id: string;
  p_expected_sync_revision: number;
  p_pdf_storage_path: string;
  p_pdf_sha256: string;
  p_pdf_url: string | null;
};

type RpcError = {
  message: string;
  details?: string | null;
  hint?: string | null;
};
type FinalizeRpcClient = {
  rpc: (
    name: "finalize_inspection_pdf_atomic",
    args: FinalizeInspectionArgs,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isStorageAlreadyExistsError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const status = Number(error.statusCode ?? error.status);
  const message = [error.message, error.error]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return status === 409 || /already exists|duplicate/i.test(message);
}

function asString(x: unknown): string | null {
  return typeof x === "string" && x.trim().length ? x.trim() : null;
}

function safeFilePart(x: string): string {
  return x.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();

  // 1) Parse body
  const raw = (await req.json().catch(() => null)) as unknown;
  if (!isRecord(raw)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const workOrderLineId = asString((raw as Body).workOrderLineId);
  const expectedSyncRevision = (raw as Body).expectedSyncRevision;
  if (!workOrderLineId) {
    return NextResponse.json(
      { error: "Missing workOrderLineId" },
      { status: 400 },
    );
  }
  if (
    typeof expectedSyncRevision !== "number" ||
    !Number.isSafeInteger(expectedSyncRevision) ||
    expectedSyncRevision < 1
  ) {
    return NextResponse.json(
      { error: "Missing or invalid expectedSyncRevision" },
      { status: 400 },
    );
  }

  // 2) Auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3) Resolve WO + shop from the line
  const { data: line, error: lineErr } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id, work_orders!inner(shop_id)")
    .eq("id", workOrderLineId)
    .maybeSingle<{
      id: string;
      work_order_id: string | null;
      work_orders: { shop_id: string | null };
    }>();

  if (lineErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] line lookup failed", lineErr);
    return NextResponse.json(
      { error: "Failed to look up work order line" },
      { status: 500 },
    );
  }

  const workOrderId = asString(line?.work_order_id);
  const shopId = asString(line?.work_orders?.shop_id);

  if (!workOrderId) {
    return NextResponse.json(
      { error: "Work order line missing work_order_id" },
      { status: 400 },
    );
  }
  if (!shopId) {
    return NextResponse.json(
      { error: "Work order line missing shop_id" },
      { status: 400 },
    );
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  if (profileErr || profile?.shop_id !== shopId) {
    return NextResponse.json(
      { error: profileErr?.message ?? "Forbidden" },
      { status: 403 },
    );
  }

  // Storage requests run in a separate transaction, so a transaction-local
  // shop GUC cannot authorize them. Scope is verified above; the admin client
  // is used only for this exact tenant-derived object path.
  const storageSupabase = createAdminClient();

  // 4) Autosave creates the canonical draft. Finalization reads the newest
  // deterministic row and never relies on a production uniqueness constraint.
  const { data: insp, error: inspErr } = await supabase
    .from("inspections")
    .select(
      "id, work_order_id, work_order_line_id, summary, sync_revision, pdf_storage_path, updated_at, locked, completed, is_draft",
    )
    .eq("work_order_line_id", workOrderLineId)
    .eq("shop_id", shopId)
    .eq("is_canonical", true)
    .maybeSingle<
      Pick<
        DB["public"]["Tables"]["inspections"]["Row"],
        | "id"
        | "work_order_id"
        | "work_order_line_id"
        | "summary"
        | "pdf_storage_path"
        | "updated_at"
        | "locked"
        | "completed"
        | "is_draft"
      >
      & { sync_revision: number | null }
    >();

  if (inspErr) {
    // eslint-disable-next-line no-console
    console.error(
      "[inspections/finalize/pdf] inspections lookup failed",
      inspErr,
    );
    return NextResponse.json(
      { error: "Failed to load inspection" },
      { status: 500 },
    );
  }

  if (!insp?.id) {
    return NextResponse.json(
      { error: "Inspection has not finished autosaving yet. Try again." },
      { status: 409 },
    );
  }
  if (insp.locked || insp.completed || insp.is_draft === false) {
    return NextResponse.json(
      { error: "Inspection is already finalized and locked." },
      { status: 409 },
    );
  }

  const summary = (insp.summary ?? null) as unknown as InspectionSession | null;

  if (!summary || typeof summary !== "object") {
    return NextResponse.json(
      { error: "Inspection summary missing/invalid" },
      { status: 400 },
    );
  }

  const summaryRevision = Math.max(0, Math.trunc(insp.sync_revision ?? 0));
  if (summaryRevision !== expectedSyncRevision) {
    return NextResponse.json(
      {
        error:
          "Inspection changed on another device. Review the latest version and finalize again.",
      },
      { status: 409 },
    );
  }

  const inspectionId = insp.id;
  const brand = await getActiveBrandForRender(shopId);

  // 5) Generate PDF
  const pdfBytes = await generateInspectionPDF(summary, {
    logoUrl: brand.logoUrl,
    shopName: null,
    colors: brand.colors,
  });
  const pdfBuffer = Buffer.from(pdfBytes);
  const pdfHash = createHash("sha256").update(pdfBuffer).digest("hex");

  // 6) Upload to storage (Policy-based: path includes shop id)
  const bucket = "inspection_pdfs";
  const shopPart = safeFilePart(shopId);
  const woPart = safeFilePart(workOrderId);
  const inspPart = safeFilePart(String(inspectionId));
  const linePart = safeFilePart(workOrderLineId);

  const path = `shops/${shopPart}/work_orders/${woPart}/inspections/${inspPart}/line_${linePart}_r${summaryRevision}_${pdfHash}.pdf`;

  const { error: uploadErr } = await storageSupabase.storage
    .from(bucket)
    .upload(path, pdfBuffer, { contentType: "application/pdf", upsert: false });

  if (uploadErr && !isStorageAlreadyExistsError(uploadErr)) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] upload failed", {
      message: uploadErr.message,
      name: uploadErr.name,
      cause: (uploadErr as unknown as { cause?: unknown })?.cause,
      path,
      bucket,
      shopId,
      workOrderId,
      workOrderLineId,
    });
    return NextResponse.json(
      {
        error: uploadErr.message,
        detail: {
          bucket,
          path,
          hint: "Storage RLS likely blocked upload. Confirm policy matches shops/<shop_id>/... and current_shop_id() is set.",
        },
      },
      { status: 500 },
    );
  }

  // Optional: signed URL for quick-open in UI
  const { data: signed, error: signedErr } = await storageSupabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 30);

  if (signedErr) {
    // eslint-disable-next-line no-console
    console.warn(
      "[inspections/finalize/pdf] createSignedUrl failed",
      signedErr,
    );
  }

  // 7) Publish the immutable object only if the persisted summary revision is
  // still the one used to generate it. The RPC locks and rechecks the row.
  const finalizeRpc = storageSupabase as unknown as FinalizeRpcClient;
  const { error: finalizeErr } = await finalizeRpc.rpc(
    "finalize_inspection_pdf_atomic",
    {
      p_inspection_id: inspectionId,
      p_work_order_line_id: workOrderLineId,
      p_actor_user_id: user.id,
      p_expected_sync_revision: expectedSyncRevision,
      p_pdf_storage_path: path,
      p_pdf_sha256: pdfHash,
      p_pdf_url: signed?.signedUrl ?? null,
    },
  );

  if (finalizeErr) {
    // eslint-disable-next-line no-console
    console.error(
      "[inspections/finalize/pdf] atomic finalization failed",
      finalizeErr,
    );
    const message = [finalizeErr.message, finalizeErr.details, finalizeErr.hint]
      .filter(Boolean)
      .join(" — ");
    const lower = message.toLowerCase();
    const status =
      lower.includes("changed on another device") ||
      lower.includes("saved inspection revision") ||
      lower.includes("already finalized") ||
      lower.includes("locked") ||
      lower.includes("not found")
        ? 409
        : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    ok: true,
    inspectionId,
    workOrderId,
    workOrderLineId,
    bucket,
    pdf_storage_path: path,
    pdf_url: signed?.signedUrl ?? null,
  });
}

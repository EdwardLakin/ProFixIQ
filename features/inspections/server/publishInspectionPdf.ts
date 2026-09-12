import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";
import {
  generateInspectionPDF,
  type InspectionPdfSignature,
} from "@/features/inspections/lib/inspection/pdf";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

const BUCKET = "inspection_pdfs";
const SIGNATURE_BUCKET = "signatures";

// Technician first: it is the signature that locks and certifies the report.
const SIGNATURE_ROLE_ORDER = ["technician", "advisor", "customer"];

function alreadyExists(error: unknown): boolean {
  const candidate = error as { status?: number; statusCode?: number; message?: string };
  return (
    Number(candidate?.status ?? candidate?.statusCode) === 409 ||
    /already exists|duplicate/i.test(candidate?.message ?? "")
  );
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The report is customer-facing, so it must carry the shop's own name rather
 * than falling back to the platform name.
 */
async function resolveShopName(
  admin: SupabaseClient<Database>,
  shopId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("shops")
    .select("business_name,shop_name,name")
    .eq("id", shopId)
    .maybeSingle<{
      business_name: string | null;
      shop_name: string | null;
      name: string | null;
    }>();
  return (
    cleanText(data?.business_name) ??
    cleanText(data?.shop_name) ??
    cleanText(data?.name)
  );
}

/**
 * Loads the signatures for the inspection's current signing cycle, newest per
 * role, with the signature image resolved to bytes. Signature images are read
 * through the admin client so the rendered report never depends on a signed
 * URL that can expire after publication.
 */
async function loadSignatures(
  admin: SupabaseClient<Database>,
  inspectionId: string,
): Promise<InspectionPdfSignature[]> {
  const { data: inspection } = await admin
    .from("inspections")
    .select("signing_cycle")
    .eq("id", inspectionId)
    .maybeSingle<{ signing_cycle: number | null }>();

  const { data: rows, error } = await admin
    .from("inspection_signatures")
    .select("role,signed_name,signed_at,signature_hash,signature_image_path")
    .eq("inspection_id", inspectionId)
    .eq("signing_cycle", Math.max(0, Math.trunc(inspection?.signing_cycle ?? 0)))
    .order("signed_at", { ascending: false });
  if (error || !rows?.length) return [];

  const latestByRole = new Map<
    string,
    {
      role: string;
      signed_name: string | null;
      signed_at: string | null;
      signature_hash: string | null;
      signature_image_path: string | null;
    }
  >();
  for (const row of rows) {
    const role = cleanText(row.role)?.toLowerCase();
    if (!role || latestByRole.has(role)) continue;
    latestByRole.set(role, { ...row, role });
  }

  const ordered = [...latestByRole.values()].sort((a, b) => {
    const aRank = SIGNATURE_ROLE_ORDER.indexOf(a.role);
    const bRank = SIGNATURE_ROLE_ORDER.indexOf(b.role);
    return (
      (aRank === -1 ? SIGNATURE_ROLE_ORDER.length : aRank) -
      (bRank === -1 ? SIGNATURE_ROLE_ORDER.length : bRank)
    );
  });

  return Promise.all(
    ordered.map(async (row) => {
      const path = cleanText(row.signature_image_path);
      let imageBytes: Uint8Array | null = null;
      if (path) {
        const downloaded = await admin.storage
          .from(SIGNATURE_BUCKET)
          .download(path);
        if (downloaded.data) {
          imageBytes = new Uint8Array(await downloaded.data.arrayBuffer());
        }
      }
      return {
        role: row.role,
        signedName: cleanText(row.signed_name),
        signedAt: cleanText(row.signed_at),
        signatureHash: cleanText(row.signature_hash),
        imageBytes,
      } satisfies InspectionPdfSignature;
    }),
  );
}

export async function publishInspectionPdf(args: {
  admin: SupabaseClient<Database>;
  shopId: string;
  workOrderId: string;
  workOrderLineId: string;
  inspectionId: string;
  summary: InspectionSession;
  syncRevision: number;
}) {
  const [brand, shopName, signatures] = await Promise.all([
    getActiveBrandForRender(args.shopId),
    resolveShopName(args.admin, args.shopId),
    loadSignatures(args.admin, args.inspectionId),
  ]);
  const bytes = await generateInspectionPDF(args.summary, {
    logoUrl: brand.logoUrl,
    shopName,
    colors: brand.colors,
    signatures,
  });
  const body = Buffer.from(bytes);
  const sha256 = createHash("sha256").update(body).digest("hex");
  const path =
    `shops/${args.shopId}/work_orders/${args.workOrderId}/inspections/` +
    `${args.inspectionId}/line_${args.workOrderLineId}_r${args.syncRevision}_${sha256}.pdf`;
  const { error } = await args.admin.storage.from(BUCKET).upload(path, body, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error && !alreadyExists(error)) throw new Error(error.message);
  return {
    bucket: BUCKET,
    path,
    sha256,
    reportUrl: `/api/inspections/${args.inspectionId}/report/pdf`,
  };
}

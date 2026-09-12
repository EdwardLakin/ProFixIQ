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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanUuid(value: unknown): string | null {
  const normalized = cleanText(value);
  return normalized && UUID_RE.test(normalized) ? normalized : null;
}

/**
 * The report is customer-facing, so it must carry the shop's own name rather
 * than falling back to the platform name.
 */
async function resolveShopName(
  admin: SupabaseClient<Database>,
  shopId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("shops")
    .select("business_name,shop_name,name")
    .eq("id", shopId)
    .maybeSingle<{
      business_name: string | null;
      shop_name: string | null;
      name: string | null;
    }>();
  // A failed read must not be mistaken for a shop with no name: the platform
  // fallback would then be published as immutable customer-facing branding.
  if (error) throw new Error(`Unable to resolve shop name: ${error.message}`);
  return (
    cleanText(data?.business_name) ??
    cleanText(data?.shop_name) ??
    cleanText(data?.name)
  );
}

/**
 * Confirms a stored signature image path is one the server itself owns.
 *
 * sign_inspection only hardens the image path for the technician role, where
 * it overwrites the path from the signer's profile and checks it against the
 * canonical tech-signature naming. Customer and advisor rows keep whatever
 * path the client sent, so reading one back with the service-role key would
 * turn caller-controlled input into a privileged, RLS-bypassing read of any
 * object in the bucket. Only a path that still matches the signing profile's
 * own saved signature is embedded; anything else renders as no image.
 */
async function isServerOwnedSignaturePath(
  admin: SupabaseClient<Database>,
  signedBy: string | null,
  path: string,
): Promise<boolean> {
  const actor = cleanUuid(signedBy);
  if (!actor) return false;
  const { data, error } = await admin
    .from("profiles")
    .select("tech_signature_path")
    .or(`id.eq.${actor},user_id.eq.${actor}`)
    .limit(1)
    .maybeSingle<{ tech_signature_path: string | null }>();
  if (error) {
    throw new Error(`Unable to verify signature evidence: ${error.message}`);
  }
  return cleanText(data?.tech_signature_path) === path;
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
  const { data: inspection, error: inspectionError } = await admin
    .from("inspections")
    .select("signing_cycle")
    .eq("id", inspectionId)
    .maybeSingle<{ signing_cycle: number | null }>();
  // Publication is one-shot and the attached path is immutable, so a failed
  // read here must abort rather than fall through to cycle 0 and certify a
  // report that contradicts the durable signature evidence.
  if (inspectionError) {
    throw new Error(
      `Unable to resolve inspection signing cycle: ${inspectionError.message}`,
    );
  }

  const { data: rows, error } = await admin
    .from("inspection_signatures")
    .select(
      "role,signed_name,signed_at,signature_hash,signature_image_path,signed_by",
    )
    .eq("inspection_id", inspectionId)
    .eq("signing_cycle", Math.max(0, Math.trunc(inspection?.signing_cycle ?? 0)))
    .order("signed_at", { ascending: false });
  if (error) {
    throw new Error(`Unable to load inspection signatures: ${error.message}`);
  }
  if (!rows?.length) return [];

  const latestByRole = new Map<
    string,
    {
      role: string;
      signed_name: string | null;
      signed_at: string | null;
      signature_hash: string | null;
      signature_image_path: string | null;
      signed_by: string | null;
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
      if (path && (await isServerOwnedSignaturePath(admin, row.signed_by, path))) {
        const downloaded = await admin.storage
          .from(SIGNATURE_BUCKET)
          .download(path);
        // A missing object is reported on the page as an unavailable image,
        // which is honest; failing here instead would strand a signed
        // inspection that can never publish its report.
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

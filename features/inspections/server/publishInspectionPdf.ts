import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";
import { generateInspectionPDF } from "@/features/inspections/lib/inspection/pdf";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

const BUCKET = "inspection_pdfs";

function alreadyExists(error: unknown): boolean {
  const candidate = error as { status?: number; statusCode?: number; message?: string };
  return (
    Number(candidate?.status ?? candidate?.statusCode) === 409 ||
    /already exists|duplicate/i.test(candidate?.message ?? "")
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
  const brand = await getActiveBrandForRender(args.shopId);
  const bytes = await generateInspectionPDF(args.summary, {
    logoUrl: brand.logoUrl,
    shopName: null,
    colors: brand.colors,
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

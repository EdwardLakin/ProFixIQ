import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";
import { generateInspectionPDF } from "@/features/inspections/lib/inspection/pdf";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";
import { signCanonicalWorkOrderPhotoUrls } from "@/features/inspections/server/signCanonicalWorkOrderPhotoUrls";

const BUCKET = "inspection_pdfs";

function alreadyExists(error: unknown): boolean {
  const candidate = error as {
    status?: number;
    statusCode?: number;
    message?: string;
  };
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
  const photoUrls = (args.summary.sections ?? []).flatMap((section) =>
    (section.items ?? []).flatMap((item) => item.photoUrls ?? []),
  );
  const signedUrls = await signCanonicalWorkOrderPhotoUrls({
    admin: args.admin,
    shopId: args.shopId,
    workOrderId: args.workOrderId,
    urls: photoUrls,
  });
  let photoIndex = 0;
  const presentationSummary: InspectionSession = {
    ...args.summary,
    sections: (args.summary.sections ?? []).map((section) => ({
      ...section,
      items: (section.items ?? []).map((item) => {
        const nextUrls = (item.photoUrls ?? [])
          .map(() => signedUrls[photoIndex++] ?? null)
          .filter((url): url is string => Boolean(url));
        return { ...item, photoUrls: nextUrls };
      }),
    })),
  };
  const bytes = await generateInspectionPDF(presentationSummary, {
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

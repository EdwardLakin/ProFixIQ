import "server-only";

import { PDFDocument } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const MAX_INSPECTION_REPORTS = 10;
const MAX_REPORT_BYTES = 20 * 1024 * 1024;
const MAX_COMBINED_INPUT_BYTES = 40 * 1024 * 1024;
const MAX_COMBINED_OUTPUT_BYTES = 50 * 1024 * 1024;

export async function attachInspectionReportToInvoice(args: {
  supabase: SupabaseClient<Database>;
  invoiceId: string;
  workOrderId: string;
  shopId: string;
  actorUserId: string;
}) {
  const { data, error } = await args.supabase
    .from("inspections")
    .select("id,pdf_storage_path,finalized_at")
    .eq("shop_id", args.shopId)
    .eq("work_order_id", args.workOrderId)
    .eq("is_canonical", true)
    .not("pdf_storage_path", "is", null)
    .order("finalized_at", { ascending: true });
  if (error) throw new Error(error.message);
  const inspections = (data ?? []).filter(
    (row): row is typeof row & { pdf_storage_path: string } =>
      typeof row.pdf_storage_path === "string" && !!row.pdf_storage_path,
  );
  if (!inspections.length) return { attached: false, count: 0 };
  if (inspections.length > MAX_INSPECTION_REPORTS) {
    throw new Error(
      `Invoice has ${inspections.length} inspection reports; the safe limit is ${MAX_INSPECTION_REPORTS}.`,
    );
  }

  const combined = await PDFDocument.create();
  let combinedInputBytes = 0;
  for (const inspection of inspections) {
    const downloaded = await args.supabase.storage
      .from("inspection_pdfs")
      .download(inspection.pdf_storage_path);
    if (downloaded.error || !downloaded.data) {
      throw new Error(
        downloaded.error?.message ?? `Unable to load inspection ${inspection.id}`,
      );
    }
    const reportBytes = downloaded.data.size;
    if (reportBytes > MAX_REPORT_BYTES) {
      throw new Error(`Inspection report ${inspection.id} exceeds the safe size limit.`);
    }
    combinedInputBytes += reportBytes;
    if (combinedInputBytes > MAX_COMBINED_INPUT_BYTES) {
      throw new Error("Inspection reports exceed the safe combined size limit.");
    }
    const source = await PDFDocument.load(await downloaded.data.arrayBuffer());
    const pages = await combined.copyPages(source, source.getPageIndices());
    pages.forEach((page) => combined.addPage(page));
  }

  const body = Buffer.from(await combined.save());
  if (body.byteLength > MAX_COMBINED_OUTPUT_BYTES) {
    throw new Error("Combined inspection report exceeds the safe output size limit.");
  }

  const path =
    `shops/${args.shopId}/invoices/${args.invoiceId}/inspection-report.pdf`;
  const upload = await args.supabase.storage
    .from("inspection_pdfs")
    .upload(path, body, { contentType: "application/pdf", upsert: true });
  if (upload.error) throw new Error(upload.error.message);

  const persisted = await args.supabase.from("invoice_documents").upsert(
    {
      invoice_id: args.invoiceId,
      shop_id: args.shopId,
      kind: "inspection_report",
      storage_bucket: "inspection_pdfs",
      storage_path: path,
      mime_type: "application/pdf",
      created_by: args.actorUserId,
    },
    { onConflict: "invoice_id,kind" },
  );
  if (persisted.error) throw new Error(persisted.error.message);
  return { attached: true, count: inspections.length, path };
}

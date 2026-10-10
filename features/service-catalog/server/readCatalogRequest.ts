import "server-only";

import { createHash } from "node:crypto";
import {
  SERVICE_CATALOG_MAX_CSV_BYTES,
  SERVICE_CATALOG_MAX_ROWS,
  buildCatalogPlan,
  type CatalogPlan,
} from "@/features/service-catalog/lib/parseServiceCatalog";

export const SERVICE_CATALOG_ROLES = ["owner", "admin", "manager"] as const;

export type CatalogRequestResult =
  | { ok: true; plan: CatalogPlan; csvHash: string }
  | { ok: false; status: number; detail: string };

/**
 * Both the preview and the import re-derive the plan from the CSV text on the
 * server. The client never supplies the plan that gets written.
 */
export async function readCatalogRequest(req: Request): Promise<CatalogRequestResult> {
  const body = (await req.json().catch(() => null)) as { csv?: unknown } | null;
  const csv = typeof body?.csv === "string" ? body.csv : "";

  if (!csv.trim()) return { ok: false, status: 400, detail: "Upload a CSV file to continue." };
  if (Buffer.byteLength(csv, "utf8") > SERVICE_CATALOG_MAX_CSV_BYTES) {
    return { ok: false, status: 413, detail: "That CSV is larger than 2 MB. Split it and import in parts." };
  }

  const plan = buildCatalogPlan(csv);
  if (plan.summary.rowCount === 0) {
    return { ok: false, status: 400, detail: "No rows found. The first line must be a header row." };
  }
  if (plan.summary.rowCount > SERVICE_CATALOG_MAX_ROWS) {
    return { ok: false, status: 413, detail: `That CSV has more than ${SERVICE_CATALOG_MAX_ROWS} rows.` };
  }
  if (plan.services.length === 0) {
    return {
      ok: false,
      status: 422,
      detail: "No services found. Include a service_name column (and optionally service_code, labor hours, price).",
    };
  }

  return { ok: true, plan, csvHash: createHash("sha256").update(csv, "utf8").digest("hex").slice(0, 16) };
}

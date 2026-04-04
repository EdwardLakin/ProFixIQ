import type { SupabaseClient } from "@supabase/supabase-js";
import type { DB } from "./types";

type BackfillResult = {
  scanned: number;
  updated: number;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreLabelPair(aRaw: string, bRaw: string): number {
  const a = normalize(aRaw);
  const b = normalize(bRaw);

  if (!a || !b) return 0;
  if (a === b) return 1;

  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  const total = new Set([...aTokens, ...bTokens]).size || 1;

  return overlap / total;
}

function isCompletedLike(status: string | null | undefined): boolean {
  const value = (status ?? "").toLowerCase();
  return value === "completed" || value === "invoiced" || value === "ready_to_invoice";
}

export async function backfillMaintenanceHistorySignals(opts: {
  supabase: SupabaseClient<DB>;
  shopId: string;
}): Promise<BackfillResult> {
  const { supabase, shopId } = opts;

  const { data: servicesData, error: servicesError } = await supabase
    .from("maintenance_services")
    .select("code, label");

  if (servicesError) throw servicesError;

  const services = (servicesData ?? []) as Array<{ code: string; label: string }>;

  const { data: linesData, error: linesError } = await supabase
    .from("work_order_lines")
    .select("id, description, service_code, line_status, status, shop_id")
    .eq("shop_id", shopId)
    .is("service_code", null)
    .limit(1000);

  if (linesError) throw linesError;

  const lines = (linesData ?? []) as Array<{
    id: string;
    description: string | null;
    service_code: string | null;
    line_status: string | null;
    status: string | null;
    shop_id: string | null;
  }>;

  let updated = 0;

  for (const line of lines) {
    if (!isCompletedLike(line.line_status ?? line.status)) continue;
    const description = line.description ?? "";
    if (!description.trim()) continue;

    let best: { code: string | null; score: number } = { code: null, score: 0 };

    for (const service of services) {
      const score = scoreLabelPair(service.label, description);
      if (score > best.score) {
        best = { code: service.code, score };
      }
    }

    if (!best.code || best.score < 0.6) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("work_order_lines")
      .update({ service_code: best.code })
      .eq("id", line.id)
      .eq("shop_id", shopId);

    if (updateError) throw updateError;
    updated += 1;
  }

  return {
    scanned: lines.length,
    updated,
  };
}

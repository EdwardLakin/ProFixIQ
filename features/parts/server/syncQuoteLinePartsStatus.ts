import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type SyncResult = {
  ok: boolean;
  quoteLineId: string;
  shopId: string;
  itemCount: number;
  quotedCount: number;
  pendingCount: number;
  partsTotal: number;
  laborRate?: number;
  laborTotal?: number;
  status: string;
  stage: string | null;
  requestId?: string | null;
  skipped?: string;
  error?: string;
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function syncQuoteLinePartsStatus(
  supabase: SupabaseClient<DB>,
  input: { shopId: string; quoteLineId: string },
): Promise<SyncResult> {
  const shopId = safeString(input.shopId);
  const quoteLineId = safeString(input.quoteLineId);

  if (!shopId || !quoteLineId) {
    return {
      ok: false,
      quoteLineId,
      shopId,
      itemCount: 0,
      quotedCount: 0,
      pendingCount: 0,
      partsTotal: 0,
      status: "",
      stage: null,
      error: "shopId and quoteLineId are required",
    };
  }

  const { data, error } = await supabase.rpc(
    "sync_quote_line_pricing_from_parts" as never,
    {
      p_shop_id: shopId,
      p_quote_line_id: quoteLineId,
    } as never,
  );

  if (error) {
    return {
      ok: false,
      quoteLineId,
      shopId,
      itemCount: 0,
      quotedCount: 0,
      pendingCount: 0,
      partsTotal: 0,
      status: "",
      stage: null,
      error: error.message,
    };
  }

  const result = asRecord(data);
  if (!result) {
    return {
      ok: false,
      quoteLineId,
      shopId,
      itemCount: 0,
      quotedCount: 0,
      pendingCount: 0,
      partsTotal: 0,
      status: "",
      stage: null,
      error: "Canonical quote pricing sync returned an invalid result.",
    };
  }

  return {
    ok: result.ok === true,
    quoteLineId: safeString(result.quoteLineId) || quoteLineId,
    shopId: safeString(result.shopId) || shopId,
    requestId: safeString(result.requestId) || null,
    itemCount: asNumber(result.itemCount),
    quotedCount: asNumber(result.quotedCount),
    pendingCount: asNumber(result.pendingCount),
    partsTotal: asNumber(result.partsTotal),
    laborRate: asNumber(result.laborRate),
    laborTotal: asNumber(result.laborTotal),
    status: safeString(result.status),
    stage: safeString(result.stage) || null,
    skipped: safeString(result.skipped) || undefined,
    error: safeString(result.error) || undefined,
  };
}

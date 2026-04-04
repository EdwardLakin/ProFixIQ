import type { SupabaseClient } from "@supabase/supabase-js";
import type { DB } from "./types";

export type SuggestedMaintenanceMenuMatch = {
  menuItemId: string | null;
  menuItemName: string | null;
  confidence: number | null;
  reason: string;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreLabelPair(serviceLabel: string, menuName: string): number {
  const a = normalize(serviceLabel);
  const b = normalize(menuName);

  if (!a || !b) return 0;
  if (a === b) return 1;

  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  const total = new Set([...aTokens, ...bTokens]).size || 1;

  return overlap / total;
}

export async function suggestMaintenanceMenuMatch(opts: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  serviceCode: string;
  label: string;
}): Promise<SuggestedMaintenanceMenuMatch> {
  const { supabase, shopId, label } = opts;

  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name")
    .eq("shop_id", shopId)
    .limit(300);

  if (error) throw error;

  const rows = (data ?? []) as Array<{ id: string; name: string | null }>;

  let best: { id: string | null; name: string | null; score: number } = {
    id: null,
    name: null,
    score: 0,
  };

  for (const row of rows) {
    const score = scoreLabelPair(label, row.name ?? "");
    if (score > best.score) {
      best = {
        id: row.id,
        name: row.name ?? null,
        score,
      };
    }
  }

  if (!best.id || best.score < 0.34) {
    return {
      menuItemId: null,
      menuItemName: null,
      confidence: null,
      reason: "No strong menu_item match found",
    };
  }

  return {
    menuItemId: best.id,
    menuItemName: best.name,
    confidence: Number(best.score.toFixed(4)),
    reason: best.score === 1 ? "Exact normalized label match" : "Best normalized token overlap match",
  };
}

import "server-only";

import type { CatalogPlan } from "@/features/service-catalog/lib/parseServiceCatalog";

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type ResolvedCatalogPart = {
  partId: string | null;
  name: string | null;
  unitCost: number | null;
  matchCount: number;
};

/**
 * Read-only inventory match for every part in the importable services. Uses the
 * same database resolver the import uses, so the preview cannot disagree with
 * what gets attached.
 */
export async function resolvePlanParts(
  supabase: unknown,
  shopId: string,
  plan: CatalogPlan,
): Promise<{ ok: true; byKey: Map<string, ResolvedCatalogPart> } | { ok: false }> {
  const keys = Array.from(
    new Set(plan.services.filter((s) => !s.needsReview).flatMap((s) => s.parts.map((p) => p.partKey))),
  );
  const byKey = new Map<string, ResolvedCatalogPart>();
  if (keys.length === 0) return { ok: true, byKey };

  const { data, error } = await (supabase as RpcClient).rpc("resolve_catalog_parts", {
    p_shop_id: shopId,
    p_part_keys: keys,
  });
  if (error || !Array.isArray(data)) return { ok: false };

  for (const row of data as Array<Record<string, unknown>>) {
    byKey.set(String(row.part_key), {
      partId: typeof row.part_id === "string" ? row.part_id : null,
      name: typeof row.part_name === "string" ? row.part_name : null,
      unitCost: typeof row.unit_cost === "number" ? row.unit_cost : row.unit_cost == null ? null : Number(row.unit_cost),
      matchCount: typeof row.match_count === "number" ? row.match_count : 0,
    });
  }
  return { ok: true, byKey };
}

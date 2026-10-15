import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import type { EquipmentDirectoryRow } from "@/features/equipment/lib/equipmentDirectory";
import {
  EVIDENCE_SCAN_MAX_ASSETS,
  applyEvidenceFilters,
  applyIdentityFilters,
  directoryFiltersNeedEvidence,
  identityFacets,
  paginate,
  type EquipmentDirectoryFilters,
  type EquipmentIdentityRow,
  type PageInfo,
} from "@/features/equipment/lib/equipmentDirectoryQuery";
import {
  EQUIPMENT_DIRECTORY_LIMIT,
  loadEquipmentDirectory,
} from "@/features/equipment/server/loadEquipmentDirectory";
import { loadEquipmentAssetList } from "@/features/equipment/server/loadEquipmentAssetList";
import type { CanonicalRole } from "@/features/shared/lib/rbac";

type DB = Database;

type Reader = {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  now?: Date;
};

/**
 * Score exactly these assets with the directory's own row builder (PM,
 * inspections, open work, meters, actions), in windows the builder is sized
 * for, and return rows in the order the ids were given. Assets the caller
 * cannot see simply produce no row.
 */
export async function loadScoredRows(input: Reader & { assetIds: string[] }): Promise<EquipmentDirectoryRow[]> {
  const byId = new Map<string, EquipmentDirectoryRow>();
  for (let offset = 0; offset < input.assetIds.length; offset += EQUIPMENT_DIRECTORY_LIMIT) {
    const { rows } = await loadEquipmentDirectory({
      supabase: input.supabase,
      admin: input.admin,
      shopId: input.shopId,
      role: input.role,
      now: input.now,
      assetIds: input.assetIds.slice(offset, offset + EQUIPMENT_DIRECTORY_LIMIT),
    });
    for (const row of rows) byId.set(row.assetId, row);
  }
  return input.assetIds.map((id) => byId.get(id)).filter((row): row is EquipmentDirectoryRow => Boolean(row));
}

export type EquipmentDirectoryPage = {
  rows: EquipmentDirectoryRow[];
  info: PageInfo;
  /** Every asset the caller can see, before filters. */
  totalAssets: number;
  facets: { classes: Array<[string, string]>; customers: Array<[string, string]> };
  /** The shop has more assets than the identity index reads. */
  indexCapped: boolean;
  /** PM / attention filters were scored on the first N matches only. */
  evidencePartial: boolean;
};

/**
 * One page of the Assets list.
 *
 * Search, class, status and customer are answered from the identity index of
 * the whole shop. Only the assets on the page are scored with PM / inspection /
 * work-order evidence — unless a PM-state or needs-attention filter is active,
 * which can only be answered from evidence: then the matching assets (newest
 * first, up to `EVIDENCE_SCAN_MAX_ASSETS`) are scored, filtered and paged.
 */
export async function loadEquipmentDirectoryPage(
  input: Reader & { filters: EquipmentDirectoryFilters },
): Promise<EquipmentDirectoryPage> {
  const index = await loadEquipmentAssetList({
    supabase: input.supabase,
    admin: input.admin,
    shopId: input.shopId,
  });
  const facets = identityFacets(index.rows);
  const candidates = applyIdentityFilters(index.rows, input.filters);
  const base = {
    totalAssets: index.rows.length,
    facets,
    indexCapped: index.capped,
  };

  if (directoryFiltersNeedEvidence(input.filters)) {
    const scanned = candidates.slice(0, EVIDENCE_SCAN_MAX_ASSETS);
    const scored = await loadScoredRows({ ...input, assetIds: scanned.map((row) => row.assetId) });
    const matched = applyEvidenceFilters(scored, input.filters);
    const { items, info } = paginate(matched, input.filters.page);
    return { ...base, rows: items, info, evidencePartial: candidates.length > EVIDENCE_SCAN_MAX_ASSETS };
  }

  const { items: pageIdentity, info } = paginate(candidates, input.filters.page);
  const rows = await loadScoredRows({ ...input, assetIds: pageIdentity.map((row) => row.assetId) });
  return { ...base, rows, info, evidencePartial: false };
}

export type { EquipmentIdentityRow };

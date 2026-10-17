import "server-only";
import { getDispatchBoard } from "@/features/dispatch/server/commands";
import { loadEquipmentAssetList } from "@/features/equipment/server/loadEquipmentAssetList";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import {
  getActorCapabilities,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";
import { isActiveServiceVisitStatus } from "@/features/scheduling/lib/service-visit-contract";

export type EquipmentVisitWindow = { startsAt: string; endsAt: string };
/** Match the canonical Dispatch board's default window. Carry it into the drilldown. */
export function equipmentVisitWindow(now = new Date()): EquipmentVisitWindow {
  return {
    startsAt: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
    endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
export function equipmentFieldVisitsHref(window: EquipmentVisitWindow): string {
  return `/equipment/dashboard/field-visits?${new URLSearchParams(window)}`;
}
export function parseEquipmentVisitWindow(
  params: Record<string, string | string[] | undefined>,
): EquipmentVisitWindow {
  const start =
    typeof params.startsAt === "string" ? Date.parse(params.startsAt) : NaN;
  const end =
    typeof params.endsAt === "string" ? Date.parse(params.endsAt) : NaN;
  // Keep this dashboard drilldown bounded to the canonical default window's length.
  if (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start &&
    end - start <= 7.5 * 86400000
  )
    return {
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
    };
  return equipmentVisitWindow();
}
export async function loadEquipmentFieldVisits(
  input: Parameters<typeof loadEquipmentAssetList>[0] & {
    role: CanonicalRole;
    actorProfileId: string;
    window: EquipmentVisitWindow;
  },
) {
  if (
    !(EQUIPMENT_DIRECTORY_ROLES as readonly string[]).includes(input.role) ||
    !getActorCapabilities({ role: input.role }).canManageScheduling
  )
    throw new Error("Equipment dispatch access denied.");
  const [index, board] = await Promise.all([
    loadEquipmentAssetList(input),
    getDispatchBoard({
      supabase: input.supabase,
      shopId: input.shopId,
      actorUserId: input.actorProfileId,
      ...input.window,
    }),
  ]);
  const assets = new Set(index.rows.map((row) => row.assetId));
  // dispatch_board_snapshot returns all matching visits in the requested window,
  // without row pagination/limits. Filter that complete projection before counting.
  const rows = board.visits.filter(
    (visit) =>
      visit.shopId === input.shopId &&
      visit.mode === "mobile" &&
      isActiveServiceVisitStatus(visit.status) &&
      !!visit.vehicle?.id &&
      assets.has(visit.vehicle.id),
  );
  return { rows, partial: index.capped, window: input.window };
}

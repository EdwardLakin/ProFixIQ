import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { equipmentClassLabel, type EquipmentAssetRecord } from "@/features/equipment/lib/assetProfile";
import { loadEquipmentAssetRecord } from "@/features/equipment/server/equipmentAssetProfileService";
import {
  loadEquipmentEvidence,
  type EquipmentAssetEvidence,
} from "@/features/equipment/server/equipmentEvidence";
import { loadFluidSampleSummaries } from "@/features/equipment/server/equipmentFluidSampleService";
import type { FluidSampleSummary } from "@/features/equipment/lib/fluids";
import {
  loadEquipmentPmSummaries,
  type EquipmentPmSummary,
} from "@/features/equipment/server/equipmentPmService";
import { vehicleWorkspacePermissionsForRole } from "@/features/vehicles/server/vehicleWorkspacePermissions";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import type { VehicleWorkspaceSnapshot } from "@/features/vehicles/lib/vehicleWorkspace";
import { loadVehicleWorkspaceSnapshot } from "@/features/vehicles/server/loadVehicleWorkspaceSnapshot";

type DB = Database;

export type MountedAttachment = {
  assetId: string;
  href: string;
  label: string;
  equipmentClassLabel: string;
};

export type AssetHealth = {
  snapshot: VehicleWorkspaceSnapshot;
  equipment: EquipmentAssetRecord;
  /** Shared Equipment evidence (latest inspection findings, PM evaluation) — same source as the directory. */
  evidence: EquipmentAssetEvidence;
  /** Equipment PM plan status (null without active plans) — same loader as the directory. */
  pmPlans: EquipmentPmSummary | null;
  /** Latest live lab fluid sample per component and fluid type (lab status as reported). */
  fluidSamples: FluidSampleSummary[];
  attachments: MountedAttachment[];
  host: { assetId: string; href: string; label: string } | null;
};

function assetLabel(row: {
  unit_number: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
}): string {
  const machine = [row.year, row.make, row.model].filter(Boolean).join(" ");
  if (row.unit_number && machine) return `Unit ${row.unit_number} · ${machine}`;
  return row.unit_number ? `Unit ${row.unit_number}` : machine || "Asset";
}

/**
 * The neutral "everything we know about this machine" record.
 *
 * Reuses the canonical vehicle workspace snapshot (identity, active work,
 * attention items, appointments, timeline, documents) with its own role and
 * mechanic-assignment rules, then adds the Equipment profile and the assets
 * mounted on / hosting this one. Returns null for anything the caller cannot
 * see, so missing, cross-shop and unassigned assets look the same.
 */
export async function loadAssetHealth(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  assetId: string;
}): Promise<AssetHealth | null> {
  const snapshot = await loadVehicleWorkspaceSnapshot({
    supabase: input.supabase,
    shopId: input.shopId,
    role: input.role,
    vehicleId: input.assetId,
  });
  if (!snapshot) return null;

  const equipment = await loadEquipmentAssetRecord(input);
  if (!equipment) return null;

  // Attachments mounted on this asset (profiles have no client grants).
  const { data: mounted, error: mountedError } = await input.admin
    .from("equipment_asset_profiles")
    .select("vehicle_id,equipment_class")
    .eq("shop_id", input.shopId)
    .eq("mounted_on_vehicle_id", input.assetId)
    .limit(100);
  if (mountedError) throw new Error("Unable to load mounted attachments.");

  const relatedIds = [
    ...(mounted ?? []).map((row) => row.vehicle_id),
    ...(equipment.profile?.mountedOnAssetId ? [equipment.profile.mountedOnAssetId] : []),
  ];
  const labels = new Map<string, string>();
  if (relatedIds.length) {
    // Names come through the caller's RLS client: an asset the caller cannot
    // see is omitted rather than revealed.
    const { data: vehicles, error } = await input.supabase
      .from("vehicles")
      .select("id,unit_number,year,make,model")
      .eq("shop_id", input.shopId)
      .in("id", relatedIds);
    if (error) throw new Error("Unable to load related assets.");
    let visible = vehicles ?? [];

    // Same-shop vehicle RLS does not encode work assignment. For
    // assigned-work-only roles, apply the vehicle workspace rule: a related
    // asset is shown only when work-order RLS exposes work on it.
    if (vehicleWorkspacePermissionsForRole(input.role).isAssignedWorkOnly && visible.length) {
      const { data: assigned, error: assignedError } = await input.supabase
        .from("work_orders")
        .select("vehicle_id")
        .eq("shop_id", input.shopId)
        .in(
          "vehicle_id",
          visible.map((row) => row.id),
        );
      if (assignedError) throw new Error("Unable to load related assets.");
      const assignedIds = new Set((assigned ?? []).map((row) => row.vehicle_id));
      visible = visible.filter((row) => assignedIds.has(row.id));
    }
    for (const row of visible) labels.set(row.id, assetLabel(row));
  }

  const attachments = (mounted ?? [])
    .filter((row) => labels.has(row.vehicle_id))
    .map((row) => ({
      assetId: row.vehicle_id,
      href: `/equipment/${row.vehicle_id}`,
      label: labels.get(row.vehicle_id)!,
      equipmentClassLabel: equipmentClassLabel(row.equipment_class),
    }));

  const hostId = equipment.profile?.mountedOnAssetId ?? null;
  const host =
    hostId && labels.has(hostId)
      ? { assetId: hostId, href: `/equipment/${hostId}`, label: labels.get(hostId)! }
      : null;

  const evidence = (
    await loadEquipmentEvidence({
      supabase: input.supabase,
      shopId: input.shopId,
      assetIds: [input.assetId],
    })
  ).get(input.assetId)!;

  const pmPlans =
    (
      await loadEquipmentPmSummaries({
        admin: input.admin,
        shopId: input.shopId,
        assets: [
          {
            id: input.assetId,
            engineHours: equipment.asset.engineHours,
            // Canonical reading: the newest dated work-order odometer (km)
            // wins over the vehicle value, as in the directory.
            odometer:
              evidence.workOrderOdometerKm === null
                ? equipment.asset.odometer
                : String(evidence.workOrderOdometerKm),
            odometerUnit: evidence.workOrderOdometerKm === null ? equipment.asset.odometerUnit : "km",
            cycles: equipment.profile?.currentCycles ?? null,
          },
        ],
      })
    ).get(input.assetId) ?? null;

  // The asset is authorized above (canonical workspace snapshot).
  const fluidSamples = await loadFluidSampleSummaries({
    admin: input.admin,
    shopId: input.shopId,
    assetId: input.assetId,
  });

  return { snapshot, equipment, evidence, pmPlans, fluidSamples, attachments, host };
}

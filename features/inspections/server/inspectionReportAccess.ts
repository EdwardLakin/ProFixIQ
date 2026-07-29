import "server-only";

import type { InspectionSession } from "@/features/inspections/lib/inspection/types";
import {
  assembleInspectionReport,
  type InspectionReport,
} from "@/features/inspections/lib/inspection/report";
import { createAdminClient } from "@/features/integrations/shopreel/server/createAdminClient";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { canonicalizeRole } from "@/features/shared/lib/rbac";

export type InspectionReportRecord = {
  inspectionId: string;
  workOrderId: string;
  workOrderReference: string | null;
  vehicleId: string | null;
  shopId: string;
  storageBucket: string;
  storagePath: string;
  finalizedAt: string | null;
  technicianName: string | null;
  report: InspectionReport;
};

type RawInspection = {
  id: string;
  shop_id: string;
  work_order_id: string | null;
  summary: unknown;
  pdf_storage_path: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
};

async function actorCanRead(args: {
  actorUserId: string;
  shopId: string;
  customerId: string | null;
  vehicleId: string | null;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("shop_id,role")
    .or(`id.eq.${args.actorUserId},user_id.eq.${args.actorUserId}`)
    .eq("shop_id", args.shopId)
    .limit(1)
    .maybeSingle<{ shop_id: string | null; role: string | null }>();
  const role = canonicalizeRole(profile?.role);
  if (
    profile?.shop_id === args.shopId &&
    !["customer", "fleet_manager", "driver", "unknown"].includes(role)
  ) {
    return true;
  }

  if (args.customerId) {
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .eq("id", args.customerId)
      .eq("shop_id", args.shopId)
      .eq("user_id", args.actorUserId)
      .maybeSingle<{ id: string }>();
    if (customer?.id) return true;
  }

  if (!args.vehicleId) return false;
  const actor = await resolveFleetActorContext(admin, {
    userId: args.actorUserId,
  });
  if (!actor.isFleetActor || actor.shopId !== args.shopId) return false;
  const { data: vehicle } = await admin
    .from("vehicles")
    .select("fleet_id")
    .eq("id", args.vehicleId)
    .eq("shop_id", args.shopId)
    .maybeSingle<{ fleet_id: string | null }>();
  return !!vehicle?.fleet_id && actor.fleetIds.includes(vehicle.fleet_id);
}

function storageObject(url: string): { bucket: string; path: string } | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(
      /\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/(.+)$/,
    );
    return match
      ? { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) }
      : null;
  } catch {
    return null;
  }
}

async function refreshEvidence(report: InspectionReport): Promise<InspectionReport> {
  const admin = createAdminClient();
  const refreshed = await Promise.all(
    report.sections.map(async (section) => ({
      ...section,
      items: await Promise.all(
        section.items.map(async (item) => ({
          ...item,
          photoUrls: await Promise.all(
            item.photoUrls.map(async (url) => {
              const object = storageObject(url);
              if (!object) return url;
              const signed = await admin.storage
                .from(object.bucket)
                .createSignedUrl(object.path, 60 * 10);
              return signed.data?.signedUrl ?? url;
            }),
          ),
        })),
      ),
    })),
  );
  return { ...report, sections: refreshed };
}

async function hydrate(
  inspection: RawInspection,
  actorUserId: string,
  includeEvidencePhotos: boolean,
): Promise<InspectionReportRecord | null> {
  if (
    !inspection.work_order_id ||
    !inspection.pdf_storage_path ||
    !inspection.summary ||
    typeof inspection.summary !== "object"
  ) {
    return null;
  }
  const admin = createAdminClient();
  const { data: workOrder } = await admin
    .from("work_orders")
    .select("id,custom_id,vehicle_id,customer_id,shop_id")
    .eq("id", inspection.work_order_id)
    .eq("shop_id", inspection.shop_id)
    .maybeSingle<{
      id: string;
      custom_id: string | null;
      vehicle_id: string | null;
      customer_id: string | null;
      shop_id: string;
    }>();
  if (
    !workOrder ||
    !(await actorCanRead({
      actorUserId,
      shopId: inspection.shop_id,
      customerId: workOrder.customer_id,
      vehicleId: workOrder.vehicle_id,
    }))
  ) {
    return null;
  }
  let technicianName: string | null = null;
  if (inspection.finalized_by) {
    const { data: technician } = await admin
      .from("profiles")
      .select("full_name")
      .or(
        `id.eq.${inspection.finalized_by},user_id.eq.${inspection.finalized_by}`,
      )
      .limit(1)
      .maybeSingle<{ full_name: string | null }>();
    technicianName = technician?.full_name ?? null;
  }
  let report = assembleInspectionReport(
    inspection.summary as InspectionSession,
  );
  if (includeEvidencePhotos) report = await refreshEvidence(report);
  return {
    inspectionId: inspection.id,
    workOrderId: workOrder.id,
    workOrderReference: workOrder.custom_id,
    vehicleId: workOrder.vehicle_id,
    shopId: inspection.shop_id,
    storageBucket: "inspection_pdfs",
    storagePath: inspection.pdf_storage_path,
    finalizedAt: inspection.finalized_at,
    technicianName,
    report,
  };
}

export async function getInspectionReportForActor(args: {
  actorUserId: string;
  inspectionId: string;
  includeEvidencePhotos?: boolean;
}) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("inspections")
    .select(
      "id,shop_id,work_order_id,summary,pdf_storage_path,finalized_at,finalized_by",
    )
    .eq("id", args.inspectionId)
    .eq("is_canonical", true)
    .not("pdf_storage_path", "is", null)
    .maybeSingle<RawInspection>();
  return data
    ? hydrate(data, args.actorUserId, args.includeEvidencePhotos ?? true)
    : null;
}

export async function listInspectionReportsForActor(args: {
  actorUserId: string;
  workOrderId?: string | null;
  vehicleId?: string | null;
}) {
  const admin = createAdminClient();
  let workOrderIds: string[] | null = args.workOrderId
    ? [args.workOrderId]
    : null;
  if (args.vehicleId) {
    const { data } = await admin
      .from("work_orders")
      .select("id")
      .eq("vehicle_id", args.vehicleId);
    workOrderIds = (data ?? []).map((row) => row.id);
  }
  if (!workOrderIds?.length) return [];
  const { data, error } = await admin
    .from("inspections")
    .select(
      "id,shop_id,work_order_id,summary,pdf_storage_path,finalized_at,finalized_by",
    )
    .in("work_order_id", workOrderIds)
    .eq("is_canonical", true)
    .not("pdf_storage_path", "is", null)
    .order("finalized_at", { ascending: false });
  if (error) throw new Error(error.message);
  const records = await Promise.all(
    ((data ?? []) as RawInspection[]).map((inspection) =>
      hydrate(inspection, args.actorUserId, false),
    ),
  );
  return records.filter(
    (record): record is InspectionReportRecord => !!record,
  );
}

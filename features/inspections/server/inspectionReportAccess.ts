import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";
import {
  assembleInspectionReport,
  type InspectionReport,
} from "@/features/inspections/lib/inspection/report";
import { createAdminClient } from "@/features/integrations/shopreel/server/createAdminClient";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { signCanonicalWorkOrderPhotoUrls } from "@/features/inspections/server/signCanonicalWorkOrderPhotoUrls";
import {
  canFieldOperatorAccessWorkOrder,
  type ShopAccess,
} from "@/features/mobile/service/server/access";
import { resolveCanonicalStaffProfile } from "@/features/shared/lib/authenticated-profile";
import {
  resolveShopProductAccess,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type DB = Database;

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
  signing_cycle: number | null;
};

async function actorCanRead(args: {
  sessionClient: SupabaseClient<DB>;
  actorUserId: string;
  workOrderId: string;
  shopId: string;
  customerId: string | null;
  vehicleId: string | null;
}): Promise<"staff" | "portal" | null> {
  const admin = createAdminClient();
  const { profile, error: profileError } = await resolveCanonicalStaffProfile(
    admin,
    args.actorUserId,
  );
  const staffActor = getActorCapabilities({ role: profile?.role });
  if (
    !profileError &&
    profile?.shop_id === args.shopId &&
    staffActor.isKnownRole &&
    staffActor.canonicalRole !== "customer" &&
    !staffActor.canViewFleetOnlyData
  ) {
    const shopProduct = await resolveShopProductAccess({
      supabase: admin,
      shopId: args.shopId,
      capabilities: SHOP_PRODUCT_CAPABILITIES,
    });
    if (shopProduct.entitled) return "staff";

    try {
      const access: ShopAccess = {
        ok: true,
        profile: { ...profile, shop_id: args.shopId },
        canonicalRole: staffActor.canonicalRole,
        authUserId: args.actorUserId,
        supabase: admin as ShopAccess["supabase"],
      };
      if (await canFieldOperatorAccessWorkOrder(access, args.workOrderId)) {
        return "staff";
      }
    } catch {
      // Customer and Fleet relationships remain independently authoritative.
    }
  }

  if (args.customerId) {
    const { data: portalAccess, error: portalAccessError } =
      await args.sessionClient.rpc("profixiq_is_portal_customer_for", {
        p_customer_id: args.customerId,
        p_shop_id: args.shopId,
      });
    if (!portalAccessError && portalAccess === true) return "portal";
  }

  if (!args.vehicleId) return null;
  const actor = await resolveFleetActorContext(admin, {
    userId: args.actorUserId,
  });
  if (!actor.isFleetActor || actor.shopId !== args.shopId) return null;
  const { data: vehicle } = await admin
    .from("vehicles")
    .select("fleet_id")
    .eq("id", args.vehicleId)
    .eq("shop_id", args.shopId)
    .maybeSingle<{ fleet_id: string | null }>();
  return vehicle?.fleet_id && actor.fleetIds.includes(vehicle.fleet_id)
    ? "portal"
    : null;
}

async function refreshEvidence(
  report: InspectionReport,
  scope: {
    shopId: string;
    workOrderId: string;
    customerVisibleOnly: boolean;
  },
): Promise<InspectionReport> {
  const admin = createAdminClient();
  const originalUrls = report.sections.flatMap((section) =>
    section.items.flatMap((item) => item.photoUrls),
  );
  const signedUrls = await signCanonicalWorkOrderPhotoUrls({
    admin,
    shopId: scope.shopId,
    workOrderId: scope.workOrderId,
    urls: originalUrls,
    customerVisibleOnly: scope.customerVisibleOnly,
  });
  const replacements = new Map(
    originalUrls.map((url, index) => [url, signedUrls[index]]),
  );

  const refreshed = report.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      photoUrls: item.photoUrls
        .map((url) => replacements.get(url) ?? null)
        .filter((url): url is string => typeof url === "string"),
    })),
  }));
  return { ...report, sections: refreshed };
}

async function hydrate(
  inspection: RawInspection,
  sessionClient: SupabaseClient<DB>,
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
  const actorKind = workOrder
    ? await actorCanRead({
        sessionClient,
        actorUserId,
        workOrderId: workOrder.id,
        shopId: inspection.shop_id,
        customerId: workOrder.customer_id,
        vehicleId: workOrder.vehicle_id,
      })
    : null;
  if (!workOrder || !actorKind) {
    return null;
  }
  const { data: technicianSignature } = await admin
    .from("inspection_signatures")
    .select("signed_name")
    .eq("inspection_id", inspection.id)
    .eq("signing_cycle", Math.max(0, inspection.signing_cycle ?? 0))
    .eq("role", "technician")
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ signed_name: string | null }>();
  const technicianName = technicianSignature?.signed_name ?? null;
  let report = assembleInspectionReport(
    inspection.summary as InspectionSession,
  );
  if (includeEvidencePhotos) {
    report = await refreshEvidence(report, {
      shopId: inspection.shop_id,
      workOrderId: workOrder.id,
      customerVisibleOnly: actorKind === "portal",
    });
  }
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
  sessionClient: SupabaseClient<DB>;
  actorUserId: string;
  inspectionId: string;
  includeEvidencePhotos?: boolean;
}) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("inspections")
    .select(
      "id,shop_id,work_order_id,summary,pdf_storage_path,finalized_at,finalized_by,signing_cycle",
    )
    .eq("id", args.inspectionId)
    .eq("is_canonical", true)
    .not("pdf_storage_path", "is", null)
    .maybeSingle<RawInspection>();
  return data
    ? hydrate(
        data,
        args.sessionClient,
        args.actorUserId,
        args.includeEvidencePhotos ?? true,
      )
    : null;
}

export async function listInspectionReportsForActor(args: {
  sessionClient: SupabaseClient<DB>;
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
      "id,shop_id,work_order_id,summary,pdf_storage_path,finalized_at,finalized_by,signing_cycle",
    )
    .in("work_order_id", workOrderIds)
    .eq("is_canonical", true)
    .not("pdf_storage_path", "is", null)
    .order("finalized_at", { ascending: false });
  if (error) throw new Error(error.message);
  const records = await Promise.all(
    ((data ?? []) as RawInspection[]).map((inspection) =>
      hydrate(inspection, args.sessionClient, args.actorUserId, false),
    ),
  );
  return records.filter((record): record is InspectionReportRecord => !!record);
}

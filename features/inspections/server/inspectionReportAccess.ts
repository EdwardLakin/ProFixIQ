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
}): Promise<boolean> {
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
    if (shopProduct.entitled) return true;

    try {
      const access: ShopAccess = {
        ok: true,
        profile: { ...profile, shop_id: args.shopId },
        canonicalRole: staffActor.canonicalRole,
        authUserId: args.actorUserId,
        supabase: admin as ShopAccess["supabase"],
      };
      if (await canFieldOperatorAccessWorkOrder(access, args.workOrderId)) {
        return true;
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
    if (!portalAccessError && portalAccess === true) return true;
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
  const configuredUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!configuredUrl) return null;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(configuredUrl).origin) return null;
    const match = parsed.pathname.match(
      /\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/(.+)$/,
    );
    return match
      ? {
          bucket: decodeURIComponent(match[1]),
          path: decodeURIComponent(match[2]),
        }
      : null;
  } catch {
    return null;
  }
}

async function refreshEvidence(
  report: InspectionReport,
  scope: { shopId: string; workOrderId: string },
): Promise<InspectionReport> {
  const admin = createAdminClient();
  const { data: media, error } = await admin
    .from("work_order_media")
    .select("storage_bucket,storage_path")
    .eq("shop_id", scope.shopId)
    .eq("work_order_id", scope.workOrderId)
    .eq("storage_bucket", "job-photos")
    .not("storage_path", "is", null);
  if (error) throw new Error(error.message);

  const canonicalObjects = new Set(
    (media ?? [])
      .filter(
        (
          row,
        ): row is {
          storage_bucket: string;
          storage_path: string;
        } =>
          row.storage_bucket === "job-photos" &&
          typeof row.storage_path === "string" &&
          row.storage_path.startsWith(`wo/${scope.workOrderId}/`),
      )
      .map((row) => `${row.storage_bucket}/${row.storage_path}`),
  );

  const refreshed = await Promise.all(
    report.sections.map(async (section) => ({
      ...section,
      items: await Promise.all(
        section.items.map(async (item) => {
          const photoUrls = await Promise.all(
            item.photoUrls.map(async (url) => {
              const object = storageObject(url);
              if (
                !object ||
                object.bucket !== "job-photos" ||
                !object.path.startsWith(`wo/${scope.workOrderId}/`) ||
                !canonicalObjects.has(`${object.bucket}/${object.path}`)
              ) {
                return null;
              }
              const signed = await admin.storage
                .from("job-photos")
                .createSignedUrl(object.path, 60 * 10);
              return signed.data?.signedUrl ?? null;
            }),
          );
          return {
            ...item,
            photoUrls: photoUrls.filter(
              (url): url is string => typeof url === "string",
            ),
          };
        }),
      ),
    })),
  );
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
  if (
    !workOrder ||
    !(await actorCanRead({
      sessionClient,
      actorUserId,
      workOrderId: workOrder.id,
      shopId: inspection.shop_id,
      customerId: workOrder.customer_id,
      vehicleId: workOrder.vehicle_id,
    }))
  ) {
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

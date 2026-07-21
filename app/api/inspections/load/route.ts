import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Json } from "@shared/types/types/supabase";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

type InspectionRow = {
  id: string;
  work_order_id: string | null;
  work_order_line_id: string | null;
  summary: Json | null;
  locked: boolean | null;
  completed: boolean | null;
  is_draft: boolean | null;
  status: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  updated_at: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

type InspectionPhotoRow = {
  item_name: string | null;
  image_url: string | null;
};

type WorkOrderContextRow = {
  customer_id: string | null;
  vehicle_id: string | null;
};
type CustomerContextRow = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
};
type VehicleContextRow = {
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
  mileage: string | null;
  color: string | null;
  unit_number: string | null;
  engine_hours: number | null;
};

function normalizeItemName(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

function mergeCanonicalPhotos(
  session: InspectionSession,
  photos: InspectionPhotoRow[],
): InspectionSession {
  if (!photos.length) return session;

  const byItem = new Map<string, string[]>();
  for (const photo of photos) {
    const itemKey = normalizeItemName(photo.item_name);
    const url = asString(photo.image_url);
    if (!itemKey || !url) continue;
    const current = byItem.get(itemKey) ?? [];
    if (!current.includes(url)) current.push(url);
    byItem.set(itemKey, current);
  }
  if (!byItem.size) return session;

  const consumed = new Set<string>();
  return {
    ...session,
    sections: (session.sections ?? []).map((section) => ({
      ...section,
      items: (section.items ?? []).map((item) => {
        const key = normalizeItemName(item.item ?? item.name);
        const canonical = !consumed.has(key) ? byItem.get(key) : undefined;
        if (!canonical?.length) return item;
        consumed.add(key);
        const existing = Array.isArray(item.photoUrls) ? item.photoUrls : [];
        return {
          ...item,
          photoUrls: [...existing, ...canonical].filter(
            (url, index, all) => all.indexOf(url) === index,
          ),
        };
      }),
    })),
  };
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const inspectionId = asString(req.nextUrl.searchParams.get("inspectionId"));
  const workOrderLineId = asString(
    req.nextUrl.searchParams.get("workOrderLineId"),
  );

  if (!inspectionId && !workOrderLineId) {
    return NextResponse.json(
      { error: "Missing inspectionId or workOrderLineId" },
      { status: 400 },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let profileResult = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();
  if (!profileResult.data && !profileResult.error) {
    profileResult = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle<{ shop_id: string | null }>();
  }
  const profile = profileResult.data;
  const profileError = profileResult.error;

  const shopId = profile?.shop_id ?? null;
  if (profileError || !shopId) {
    return NextResponse.json(
      { error: "Unable to resolve actor shop." },
      { status: 403 },
    );
  }

  if (workOrderLineId) {
    const { data: line, error: lineError } = await supabase
      .from("work_order_lines")
      .select("id")
      .eq("id", workOrderLineId)
      .eq("shop_id", shopId)
      .maybeSingle<{ id: string }>();

    if (lineError) {
      return NextResponse.json({ error: lineError.message }, { status: 500 });
    }
    if (!line) {
      return NextResponse.json(
        { error: "Work-order line was not found for this shop." },
        { status: 404 },
      );
    }
  }

  const selectColumns =
    "id, work_order_id, work_order_line_id, summary, locked, completed, is_draft, status, finalized_at, finalized_by, reopened_at, reopened_by, reopen_reason, updated_at";

  let inspectionRow: InspectionRow | null = null;

  // A work-order line is the canonical identity across devices. Device-local
  // inspection UUIDs are only a fallback for legacy standalone inspections.
  if (workOrderLineId) {
    const { data, error } = await supabase
      .from("inspections")
      .select(selectColumns)
      .eq("shop_id", shopId)
      .eq("work_order_line_id", workOrderLineId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle<InspectionRow>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    inspectionRow = data;
  }

  // When a line is supplied it remains authoritative. Falling back to an
  // unrelated same-shop UUID can hydrate one job with another job's snapshot.
  if (!inspectionRow && inspectionId && !workOrderLineId) {
    const { data, error } = await supabase
      .from("inspections")
      .select(selectColumns)
      .eq("shop_id", shopId)
      .eq("id", inspectionId)
      .limit(1)
      .maybeSingle<InspectionRow>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    inspectionRow = data;
  }

  const resolvedWorkOrderLineId =
    inspectionRow?.work_order_line_id ?? workOrderLineId ?? null;

  let session =
    (inspectionRow?.summary as unknown as InspectionSession | null) ?? null;

  if (!session && resolvedWorkOrderLineId) {
    const { data: sessionRow, error: sessionError } = await supabase
      .from("inspection_sessions")
      .select("state")
      .eq("work_order_line_id", resolvedWorkOrderLineId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle<{ state: Json | null }>();

    if (sessionError) {
      return NextResponse.json(
        { error: sessionError.message },
        { status: 500 },
      );
    }

    session =
      (sessionRow?.state as unknown as InspectionSession | null) ?? null;
  }

  if (!session) {
    return NextResponse.json({
      session: null,
      inspectionMeta: inspectionRow
        ? {
            locked: Boolean(inspectionRow.locked),
            completed: Boolean(inspectionRow.completed),
            isDraft: Boolean(inspectionRow.is_draft),
            status: inspectionRow.status,
            finalizedAt: inspectionRow.finalized_at,
            finalizedBy: inspectionRow.finalized_by,
            reopenedAt: inspectionRow.reopened_at,
            reopenedBy: inspectionRow.reopened_by,
            reopenReason: inspectionRow.reopen_reason,
            updatedAt: inspectionRow.updated_at,
          }
        : null,
    });
  }

  const canonicalInspectionId =
    inspectionRow?.id ?? session.id ?? inspectionId ?? "";
  const canonicalWorkOrderId =
    inspectionRow?.work_order_id ?? session.workOrderId ?? null;

  let customerContext: CustomerContextRow | null = null;
  let vehicleContext: VehicleContextRow | null = null;
  if (canonicalWorkOrderId) {
    const { data: workOrder, error: workOrderError } = await supabase
      .from("work_orders")
      .select("customer_id, vehicle_id")
      .eq("id", canonicalWorkOrderId)
      .eq("shop_id", shopId)
      .maybeSingle<WorkOrderContextRow>();

    if (workOrderError) {
      console.error("[inspections/load] work-order context failed", workOrderError);
    } else if (workOrder) {
      const [customerResult, vehicleResult] = await Promise.all([
        workOrder.customer_id
          ? supabase
              .from("customers")
              .select(
                "first_name, last_name, phone, email, address, city, province, postal_code",
              )
              .eq("id", workOrder.customer_id)
              .eq("shop_id", shopId)
              .maybeSingle<CustomerContextRow>()
          : Promise.resolve({ data: null, error: null }),
        workOrder.vehicle_id
          ? supabase
              .from("vehicles")
              .select(
                "year, make, model, vin, license_plate, mileage, color, unit_number, engine_hours",
              )
              .eq("id", workOrder.vehicle_id)
              .eq("shop_id", shopId)
              .maybeSingle<VehicleContextRow>()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (customerResult.error) {
        console.error(
          "[inspections/load] customer context failed",
          customerResult.error,
        );
      } else {
        customerContext = customerResult.data;
      }
      if (vehicleResult.error) {
        console.error(
          "[inspections/load] vehicle context failed",
          vehicleResult.error,
        );
      } else {
        vehicleContext = vehicleResult.data;
      }
    }
  }

  let canonicalPhotos: InspectionPhotoRow[] = [];
  if (canonicalInspectionId) {
    const { data: photoRows, error: photoError } = await supabase
      .from("inspection_photos")
      .select("item_name, image_url")
      .eq("inspection_id", canonicalInspectionId)
      .order("created_at", { ascending: true });

    if (photoError) {
      console.error("[inspections/load] canonical photo hydration failed", photoError);
    } else {
      canonicalPhotos = (photoRows ?? []) as InspectionPhotoRow[];
    }
  }

  const hydratedSession = mergeCanonicalPhotos(
    {
      ...session,
      id: canonicalInspectionId,
      workOrderId: canonicalWorkOrderId,
      workOrderLineId: resolvedWorkOrderLineId ?? session.workOrderLineId ?? null,
      customer: customerContext
        ? {
            ...(session.customer ?? {}),
            first_name: customerContext.first_name ?? "",
            last_name: customerContext.last_name ?? "",
            phone: customerContext.phone ?? "",
            email: customerContext.email ?? "",
            address: customerContext.address ?? "",
            city: customerContext.city ?? "",
            province: customerContext.province ?? "",
            postal_code: customerContext.postal_code ?? "",
          }
        : session.customer,
      vehicle: vehicleContext
        ? {
            ...(session.vehicle ?? {}),
            year: vehicleContext.year != null ? String(vehicleContext.year) : "",
            make: vehicleContext.make ?? "",
            model: vehicleContext.model ?? "",
            vin: vehicleContext.vin ?? "",
            license_plate: vehicleContext.license_plate ?? "",
            mileage: vehicleContext.mileage ?? "",
            color: vehicleContext.color ?? "",
            unit_number: vehicleContext.unit_number ?? "",
            engine_hours:
              vehicleContext.engine_hours != null
                ? String(vehicleContext.engine_hours)
                : "",
          }
        : session.vehicle,
    },
    canonicalPhotos,
  );

  return NextResponse.json({
    session: hydratedSession,
    inspectionId: hydratedSession.id ?? null,
    workOrderId: hydratedSession.workOrderId ?? null,
    workOrderLineId: hydratedSession.workOrderLineId ?? null,
    inspectionMeta: {
      locked: Boolean(inspectionRow?.locked),
      completed: Boolean(inspectionRow?.completed),
      isDraft: Boolean(inspectionRow?.is_draft),
      status: inspectionRow?.status ?? null,
      finalizedAt: inspectionRow?.finalized_at ?? null,
      finalizedBy: inspectionRow?.finalized_by ?? null,
      reopenedAt: inspectionRow?.reopened_at ?? null,
      reopenedBy: inspectionRow?.reopened_by ?? null,
      reopenReason: inspectionRow?.reopen_reason ?? null,
      updatedAt: inspectionRow?.updated_at ?? null,
    },
  });
}

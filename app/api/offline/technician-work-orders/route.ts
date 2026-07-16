export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import type { Database } from "@shared/types/types/supabase";
import type {
  TechnicianOfflineBundle,
  TechnicianOfflineWorkOrder,
} from "@/features/work-orders/mobile/technicianOfflineTypes";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

export async function GET() {
  const authClient = createServerSupabaseRoute();
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await authClient
    .from("profiles")
    .select("shop_id, role")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null; role: string | null }>();
  if (profileError || !profile?.shop_id) {
    return NextResponse.json({ error: "Missing shop" }, { status: 403 });
  }
  if (!getActorCapabilities({ role: profile.role }).canPerformAssignedWork) {
    return NextResponse.json(
      { error: "Assigned technician work is not available for this role." },
      { status: 403 },
    );
  }

  const admin = createAdminSupabase();
  const [
    { data: directlyAssigned, error: directError },
    { data: sharedAssigned, error: sharedError },
  ] = await Promise.all([
    admin
      .from("work_order_lines")
      .select("id, work_order_id")
      .eq("shop_id", profile.shop_id)
      .eq("line_type", "job")
      .or(`assigned_tech_id.eq.${user.id},assigned_to.eq.${user.id}`),
    admin
      .from("work_order_line_technicians")
      .select("work_order_line_id")
      .eq("technician_id", user.id),
  ]);
  if (directError || sharedError) {
    return NextResponse.json(
      {
        error:
          directError?.message ??
          sharedError?.message ??
          "Assignments could not be loaded.",
      },
      { status: 500 },
    );
  }

  const sharedLineIds = (sharedAssigned ?? []).map(
    (row) => row.work_order_line_id,
  );
  const { data: sharedLines, error: sharedLinesError } = sharedLineIds.length
    ? await admin
        .from("work_order_lines")
        .select("id, work_order_id")
        .eq("shop_id", profile.shop_id)
        .eq("line_type", "job")
        .in("id", sharedLineIds)
    : { data: [], error: null };
  if (sharedLinesError) {
    return NextResponse.json(
      { error: sharedLinesError.message },
      { status: 500 },
    );
  }

  const assignedRows = [...(directlyAssigned ?? []), ...(sharedLines ?? [])];
  const assignedLineIds = new Set(assignedRows.map((row) => row.id));
  const workOrderIds = [
    ...new Set(assignedRows.map((row) => row.work_order_id).filter(Boolean)),
  ] as string[];
  if (workOrderIds.length === 0) {
    const empty: TechnicianOfflineBundle = {
      scope: { userId: user.id, shopId: profile.shop_id },
      downloadedAt: new Date().toISOString(),
      workOrders: [],
    };
    return NextResponse.json(empty, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  // Use the authenticated client for every downloaded business record so the
  // normal table policies remain the final authorization boundary.
  const { data: workOrdersData, error: workOrdersError } = await authClient
    .from("work_orders")
    .select("*")
    .eq("shop_id", profile.shop_id)
    .in("id", workOrderIds)
    .neq("type", "historical_import")
    .order("created_at", { ascending: false })
    .limit(50);
  if (workOrdersError) {
    return NextResponse.json(
      { error: workOrdersError.message },
      { status: 500 },
    );
  }

  const workOrders = (workOrdersData ?? []) as WorkOrder[];
  if (workOrders.length === 0) {
    const empty: TechnicianOfflineBundle = {
      scope: { userId: user.id, shopId: profile.shop_id },
      downloadedAt: new Date().toISOString(),
      workOrders: [],
    };
    return NextResponse.json(empty, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const allowedWorkOrderIds = workOrders.map((row) => row.id);
  const vehicleIds = [
    ...new Set(workOrders.map((row) => row.vehicle_id).filter(Boolean)),
  ] as string[];
  const customerIds = [
    ...new Set(workOrders.map((row) => row.customer_id).filter(Boolean)),
  ] as string[];
  const [linesResult, quotesResult, vehiclesResult, customersResult] =
    await Promise.all([
      authClient
        .from("work_order_lines")
        .select("*")
        .eq("shop_id", profile.shop_id)
        .in("work_order_id", allowedWorkOrderIds)
        .order("created_at"),
      authClient
        .from("work_order_quote_lines")
        .select("*")
        .in("work_order_id", allowedWorkOrderIds)
        .order("created_at"),
      vehicleIds.length
        ? authClient
            .from("vehicles")
            .select("*")
            .eq("shop_id", profile.shop_id)
            .in("id", vehicleIds)
        : Promise.resolve({ data: [], error: null }),
      customerIds.length
        ? authClient
            .from("customers")
            .select("*")
            .eq("shop_id", profile.shop_id)
            .in("id", customerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (linesResult.error) {
    return NextResponse.json(
      { error: linesResult.error.message },
      { status: 500 },
    );
  }

  const lines = (linesResult.data ?? []) as WorkOrderLine[];
  const quoteLines = (
    quotesResult.error ? [] : (quotesResult.data ?? [])
  ) as QuoteLine[];
  const vehicles = (
    vehiclesResult.error ? [] : (vehiclesResult.data ?? [])
  ) as Vehicle[];
  const customers = (
    customersResult.error ? [] : (customersResult.data ?? [])
  ) as Customer[];
  const techIds = [
    ...new Set(lines.map((line) => line.assigned_tech_id).filter(Boolean)),
  ] as string[];
  const { data: technicians } = techIds.length
    ? await authClient
        .from("profiles")
        .select("id, full_name")
        .eq("shop_id", profile.shop_id)
        .in("id", techIds)
    : { data: [] };
  const techNamesById = Object.fromEntries(
    (technicians ?? []).map((technician) => [
      technician.id,
      technician.full_name ?? "Technician",
    ]),
  );

  const bundle: TechnicianOfflineBundle = {
    scope: { userId: user.id, shopId: profile.shop_id },
    downloadedAt: new Date().toISOString(),
    workOrders: workOrders.map<TechnicianOfflineWorkOrder>((workOrder) => ({
      workOrder,
      lines: lines.filter((line) => line.work_order_id === workOrder.id),
      quoteLines: quoteLines.filter(
        (line) => line.work_order_id === workOrder.id,
      ),
      vehicle:
        vehicles.find((vehicle) => vehicle.id === workOrder.vehicle_id) ?? null,
      customer:
        customers.find((customer) => customer.id === workOrder.customer_id) ??
        null,
      techNamesById,
      assignedLineIds: lines
        .filter(
          (line) =>
            line.work_order_id === workOrder.id && assignedLineIds.has(line.id),
        )
        .map((line) => line.id),
    })),
  };

  return NextResponse.json(bundle, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

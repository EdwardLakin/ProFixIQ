import { NextResponse, type NextRequest } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type ProfileRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  role: string | null;
};

type WorkOrderRow = {
  id: string;
  technician_id: string | null;
};

type LineRow = { id: string };
type TechnicianRow = { technician_id: string };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function displayProfile(profile: ProfileRow) {
  return {
    id: profile.id,
    full_name:
      profile.full_name?.trim() ||
      profile.username?.trim() ||
      profile.email?.trim() ||
      "Employee profile unavailable",
    role: profile.role,
  };
}

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope");
  const workOrderId = request.nextUrl.searchParams.get("work_order_id") ?? "";
  const isWorkOrderDisplay = scope === "work_order";
  const access = await requireShopScopedApiAccess(
    isWorkOrderDisplay
      ? {}
      : { requiredCapability: "canAssignWork" },
  );
  if (!access.ok) return access.response;

  if (scope && !isWorkOrderDisplay) {
    return NextResponse.json({ error: "Unsupported scope" }, { status: 400 });
  }
  if (isWorkOrderDisplay && !isUuid(workOrderId)) {
    return NextResponse.json(
      { error: "A valid work order is required" },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase();
  if (!isWorkOrderDisplay) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, full_name, username, email, role")
      .eq("shop_id", access.profile.shop_id)
      .in("role", ["mechanic", "tech", "foreman", "lead_hand"])
      .order("full_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      data: ((data ?? []) as ProfileRow[]).map(displayProfile),
    });
  }

  // The user-scoped client proves this actor can see the work order through
  // canonical RLS. The service client is then limited to names already tied to
  // that one visible work order; it never becomes a shop-wide people lookup.
  const { data: visibleWorkOrder, error: workOrderError } =
    await access.supabase
      .from("work_orders")
      .select("id, technician_id")
      .eq("shop_id", access.profile.shop_id)
      .eq("id", workOrderId)
      .maybeSingle<WorkOrderRow>();

  if (workOrderError) {
    return NextResponse.json(
      { error: workOrderError.message },
      { status: 400 },
    );
  }
  if (!visibleWorkOrder) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  const { data: lineData, error: lineError } = await admin
    .from("work_order_lines")
    .select("id")
    .eq("shop_id", access.profile.shop_id)
    .eq("work_order_id", visibleWorkOrder.id);
  if (lineError) {
    return NextResponse.json({ error: lineError.message }, { status: 400 });
  }

  const lineIds = ((lineData ?? []) as LineRow[]).map((line) => line.id);
  const [assignmentResult, laborResult] =
    lineIds.length > 0
      ? await Promise.all([
          admin
            .from("work_order_line_technicians")
            .select("technician_id")
            .in("work_order_line_id", lineIds),
          admin
            .from("work_order_line_labor_segments")
            .select("technician_id")
            .eq("shop_id", access.profile.shop_id)
            .eq("work_order_id", visibleWorkOrder.id),
        ])
      : [
          { data: [] as TechnicianRow[], error: null },
          { data: [] as TechnicianRow[], error: null },
        ];

  if (assignmentResult.error || laborResult.error) {
    return NextResponse.json(
      {
        error:
          assignmentResult.error?.message ??
          laborResult.error?.message ??
          "Unable to load work-order employees",
      },
      { status: 400 },
    );
  }

  const technicianIds = [
    ...new Set(
      [
        visibleWorkOrder.technician_id,
        ...((assignmentResult.data ?? []) as TechnicianRow[]).map(
          (row) => row.technician_id,
        ),
        ...((laborResult.data ?? []) as TechnicianRow[]).map(
          (row) => row.technician_id,
        ),
      ].filter((value): value is string => Boolean(value)),
    ),
  ];
  if (technicianIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, username, email, role")
    .eq("shop_id", access.profile.shop_id)
    .in("id", technicianIds)
    .order("full_name", { ascending: true });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({
    data: ((profiles ?? []) as ProfileRow[]).map(displayProfile),
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { resolveTechnicianAssignmentContract } from "@/features/work-orders/lib/technicianAssignmentContract";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";

type ProfileRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  role: string | null;
};

type WorkOrderRow = {
  id: string;
};

type LineRow = {
  id: string;
  assigned_tech_id: string | null;
  assigned_to: string | null;
};
type TechnicianRow = {
  technician_id: string;
  work_order_line_id: string;
};
type LaborTechnicianRow = {
  technician_id: string;
  work_order_line_id: string;
};
type WorkforceStatusRow = {
  user_id: string;
  employment_status: string;
};

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
      : {
          requiredWorkspaceCapability:
            WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
        },
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
    const [profileResult, workforceResult] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, username, email, role")
        .eq("shop_id", access.profile.shop_id)
        .in("role", [
          "mechanic",
          "tech",
          "technician",
          "foreman",
          "lead_hand",
          "lead hand",
          "leadhand",
        ])
        .order("full_name", { ascending: true }),
      admin
        .from("people_workforce_profiles")
        .select("user_id, employment_status")
        .eq("shop_id", access.profile.shop_id),
    ]);

    if (profileResult.error || workforceResult.error) {
      return NextResponse.json(
        {
          error:
            profileResult.error?.message ??
            workforceResult.error?.message ??
            "Unable to load assignable technicians.",
        },
        { status: 400 },
      );
    }

    const unavailableIds = new Set(
      ((workforceResult.data ?? []) as WorkforceStatusRow[])
        .filter((row) => row.employment_status?.toLowerCase() !== "active")
        .map((row) => row.user_id),
    );

    return NextResponse.json({
      data: ((profileResult.data ?? []) as ProfileRow[])
        .filter((profile) => !unavailableIds.has(profile.id))
        .map(displayProfile),
    });
  }

  // The user-scoped client proves this actor can see the work order through
  // canonical RLS. The service client is then limited to names already tied to
  // that one visible work order; it never becomes a shop-wide people lookup.
  const { data: visibleWorkOrder, error: workOrderError } =
    await access.supabase
      .from("work_orders")
      .select("id")
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
    .select("id, assigned_tech_id, assigned_to")
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
            .select("technician_id, work_order_line_id")
            .in("work_order_line_id", lineIds),
          admin
            .from("work_order_line_labor_segments")
            .select("technician_id, work_order_line_id")
            .eq("shop_id", access.profile.shop_id)
            .in("work_order_line_id", lineIds)
            .is("ended_at", null),
        ])
      : [
          { data: [] as TechnicianRow[], error: null },
          { data: [] as LaborTechnicianRow[], error: null },
        ];

  if (assignmentResult.error || laborResult.error) {
    return NextResponse.json(
      {
        error:
          assignmentResult.error?.message ??
          laborResult.error?.message ??
          "Unable to load work-order technicians.",
      },
      { status: 400 },
    );
  }

  const canonicalIdsByLine = new Map<string, string[]>();
  for (const row of (assignmentResult.data ?? []) as TechnicianRow[]) {
    canonicalIdsByLine.set(row.work_order_line_id, [
      ...(canonicalIdsByLine.get(row.work_order_line_id) ?? []),
      row.technician_id,
    ]);
  }
  const assignmentTechnicianIds = [
    ...new Set(
      ((lineData ?? []) as LineRow[]).flatMap((line) =>
        resolveTechnicianAssignmentContract({
          primaryTechnicianId: line.assigned_tech_id,
          legacyAssignedTo: line.assigned_to,
          canonicalTechnicianIds: canonicalIdsByLine.get(line.id),
        }).technicianIds,
      ),
    ),
  ];
  // Active labor identifies who is performing the work for display purposes;
  // it does not become or mutate a persisted assignment.
  const displayTechnicianIds = [
    ...new Set([
      ...assignmentTechnicianIds,
      ...((laborResult.data ?? []) as LaborTechnicianRow[]).map(
        (row) => row.technician_id,
      ),
    ]),
  ];
  if (displayTechnicianIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, username, email, role")
    .eq("shop_id", access.profile.shop_id)
    .in("id", displayTechnicianIds)
    .order("full_name", { ascending: true });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  const profilesById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
  );
  return NextResponse.json({
    data: displayTechnicianIds.map((technicianId) => {
      const profile = profilesById.get(technicianId);
      return profile
        ? displayProfile(profile)
        : {
            id: technicianId,
            full_name: "Unavailable technician",
            role: null,
          };
    }),
  });
}

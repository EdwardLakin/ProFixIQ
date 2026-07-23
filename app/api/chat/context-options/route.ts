import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { resolveMessagingActor } from "@/features/ai/lib/chat/authorization";

export const dynamic = "force-dynamic";

type ContextOption = {
  type: "work_order" | "booking" | "vehicle";
  id: string;
  label: string;
  secondary: string | null;
};

type RecipientOption = {
  id: string;
  label: string;
};

export async function GET(req: Request): Promise<NextResponse> {
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabase();
  const preferredKind =
    new URL(req.url).searchParams.get("actor") === "customer"
      ? "customer"
      : undefined;
  const actorResult = await resolveMessagingActor({
    supabase: admin,
    actorUserId: user.id,
    preferredKind,
  });
  if (!actorResult.ok) {
    return NextResponse.json({ error: actorResult.error }, { status: actorResult.status });
  }
  if (actorResult.actor.kind !== "customer") {
    return NextResponse.json({ options: [] });
  }

  const customerId = actorResult.actor.customerId;
  const shopId = actorResult.actor.shopId;
  const [
    { data: workOrders, error: workOrderError },
    { data: bookings, error: bookingError },
    { data: vehicles, error: vehicleError },
    { data: advisors, error: advisorError },
  ] =
    await Promise.all([
      admin
        .from("work_orders")
        .select("id, custom_id, status, created_at")
        .eq("shop_id", shopId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(25),
      admin
        .from("bookings")
        .select("id, starts_at, status")
        .eq("shop_id", shopId)
        .eq("customer_id", customerId)
        .order("starts_at", { ascending: false })
        .limit(25),
      admin
        .from("vehicles")
        .select("id, year, make, model, unit_number")
        .eq("shop_id", shopId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(25),
      admin
        .from("profiles")
        .select("id, user_id, full_name, email")
        .eq("shop_id", shopId)
        .eq("role", "advisor")
        .order("full_name", { ascending: true })
        .limit(50),
    ]);

  const queryError =
    workOrderError ?? bookingError ?? vehicleError ?? advisorError;
  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const options: ContextOption[] = [
    ...(workOrders ?? []).map((workOrder) => ({
      type: "work_order" as const,
      id: workOrder.id,
      label: `Work Order ${workOrder.custom_id ?? `#${workOrder.id.slice(0, 8)}`}`,
      secondary: workOrder.status,
    })),
    ...(bookings ?? []).map((booking) => ({
      type: "booking" as const,
      id: booking.id,
      label: `Appointment ${new Date(booking.starts_at).toLocaleDateString()}`,
      secondary: booking.status,
    })),
    ...(vehicles ?? []).map((vehicle) => ({
      type: "vehicle" as const,
      id: vehicle.id,
      label:
        [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
        "Vehicle",
      secondary: vehicle.unit_number ? `Unit ${vehicle.unit_number}` : null,
    })),
  ];

  const recipients: RecipientOption[] = (advisors ?? [])
    .map((advisor) => ({
      id: advisor.user_id ?? advisor.id,
      label:
        advisor.full_name?.trim() ||
        advisor.email?.trim() ||
        "Service advisor",
    }))
    .filter(
      (advisor, index, rows) =>
        Boolean(advisor.id) &&
        rows.findIndex((candidate) => candidate.id === advisor.id) === index,
    );

  return NextResponse.json({ options, recipients });
}

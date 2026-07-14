import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import BookingsTable, { type BookingRow } from "./BookingsTable";


export default async function BookingsTableWrapper() {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-[color:var(--theme-text-secondary)]">
        Sign in required.
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id, role")
    .eq("id", user.id)
    .single();

  const shopId = profile?.shop_id ?? null;
  const role = String(profile?.role ?? "");
  const canEdit = ["owner", "admin", "manager", "advisor"].includes(role);

  if (!shopId) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-[color:var(--theme-text-secondary)]">
        No shop linked to this profile.
      </div>
    );
  }

  const { data: rows, error } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, status, notes, customer_id, vehicle_id, work_order_id")
    .eq("shop_id", shopId)
    .order("starts_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-red-300">
        Failed to load bookings: {error.message}
      </div>
    );
  }

  const customerIds = Array.from(
    new Set((rows ?? []).map((r) => r.customer_id).filter(Boolean))
  ) as string[];

  const vehicleIds = Array.from(
    new Set((rows ?? []).map((r) => r.vehicle_id).filter(Boolean))
  ) as string[];

  const [{ data: customers }, { data: vehicles }] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, first_name, last_name").in("id", customerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; first_name: string | null; last_name: string | null }> }),
    vehicleIds.length
      ? supabase.from("vehicles").select("id, year, make, model").in("id", vehicleIds)
      : Promise.resolve({ data: [] as Array<{ id: string; year: number | null; make: string | null; model: string | null }> }),
  ]);

  const customerMap = new Map(
    (customers ?? []).map((c) => [
      c.id,
      [c.first_name ?? "", c.last_name ?? ""].join(" ").trim() || "Customer",
    ])
  );

  const vehicleMap = new Map(
    (vehicles ?? []).map((v) => [
      v.id,
      [v.year ?? "", v.make ?? "", v.model ?? ""].join(" ").trim() || "Vehicle",
    ])
  );

  const initialRows: BookingRow[] = (rows ?? []).map((r) => ({
    ...r,
    status: r.status as BookingRow["status"],
    customer_name: r.customer_id ? customerMap.get(r.customer_id) ?? null : null,
    vehicle_label: r.vehicle_id ? vehicleMap.get(r.vehicle_id) ?? null : null,
  }));

  return <BookingsTable initialRows={initialRows} canEdit={canEdit} />;
}

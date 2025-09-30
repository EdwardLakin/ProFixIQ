export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export default async function WorkOrderBasic({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerComponentClient<DB>({ cookies });

  // Guard: signed in?
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-red-400">
        Not signed in.
      </div>
    );
  }

  const id = params.id;

  // --- Load Work Order (by id, then by custom_id if short) ---
  const { data: byId, error: idErr } = await supabase
    .from("work_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (idErr) console.error("[wo/[id]] select by id error:", idErr);

  let wo = byId ?? null;
  if (!wo && id.length < 36) {
    const { data: byCustom, error: customErr } = await supabase
      .from("work_orders")
      .select("*")
      .eq("custom_id", id)
      .maybeSingle();
    if (customErr) console.error("[wo/[id]] select by custom_id error:", customErr);
    wo = byCustom ?? null;
  }

  if (!wo) notFound();

  // --- Optionally load Vehicle & Customer if referenced on WO ---
  const [vehRes, custRes] = await Promise.all([
    wo.vehicle_id
      ? supabase.from("vehicles").select("*").eq("id", wo.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    wo.customer_id
      ? supabase.from("customers").select("*").eq("id", wo.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const vehicle = (vehRes?.data as DB["public"]["Tables"]["vehicles"]["Row"] | null) ?? null;
  const customer = (custRes?.data as DB["public"]["Tables"]["customers"]["Row"] | null) ?? null;

  return (
    <div className="mx-auto max-w-3xl p-6 text-white">
      <Link href="/work-orders" className="text-sm text-orange-400 hover:underline">
        ← Back to Work Orders
      </Link>

      <h1 className="mt-3 text-2xl font-semibold">
        Work Order {wo.custom_id || `#${wo.id.slice(0, 8)}`}
      </h1>

      {/* Vehicle & Customer (restored) */}
      <div className="mt-4 rounded border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Vehicle & Customer</h2>

          {/* Optional quick links if ids exist */}
          <div className="text-xs text-orange-400">
            {vehicle?.id ? (
              <Link
                href={`/vehicles/${vehicle.id}`}
                className="hover:underline"
                prefetch={false}
              >
                Vehicle →
              </Link>
            ) : null}
            {vehicle?.id && customer?.id ? <span className="mx-2 text-white/30">•</span> : null}
            {customer?.id ? (
              <Link
                href={`/customers/${customer.id}`}
                className="hover:underline"
                prefetch={false}
              >
                Customer →
              </Link>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Vehicle */}
          <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
            <h3 className="mb-1 font-semibold">Vehicle</h3>
            {vehicle ? (
              <>
                <p>
                  {(vehicle.year ?? "").toString()} {vehicle.make ?? ""} {vehicle.model ?? ""}
                </p>
                <p className="text-sm text-neutral-400">
                  VIN: {vehicle.vin ?? "—"} • Plate: {vehicle.license_plate ?? "—"}
                </p>
              </>
            ) : (
              <p className="text-neutral-400">—</p>
            )}
          </div>

          {/* Customer */}
          <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
            <h3 className="mb-1 font-semibold">Customer</h3>
            {customer ? (
              <>
                <p>
                  {[customer.first_name ?? "", customer.last_name ?? ""]
                    .filter(Boolean)
                    .join(" ") || "—"}
                </p>
                <p className="text-sm text-neutral-400">
                  {customer.phone ?? "—"}
                  {customer.email ? ` • ${customer.email}` : ""}
                </p>
              </>
            ) : (
              <p className="text-neutral-400">—</p>
            )}
          </div>
        </div>
      </div>

      <p className="mt-6 text-sm text-neutral-400">
        Vehicle & Customer restored. Next step: add the Jobs / Lines list back in.
      </p>
    </div>
  );
}
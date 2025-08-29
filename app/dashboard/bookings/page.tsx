

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import BookingsTable from "./BookingsTable";

export default async function BookingsPage() {
  // ✅ correct helper for server components
  const supabase = createServerComponentClient<Database>({ cookies });

  // who am I?
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <div className="p-6 text-white">You must be signed in.</div>;
  }

  // get staff shop
  const { data: prof } = await supabase
    .from("profiles")
    .select("shop_id, full_name, role")
    .eq("id", user.id)
    .single();

  if (!prof?.shop_id) {
    return (
      <div className="p-6 text-white">
        No shop linked to your profile yet.
      </div>
    );
  }

  // fetch future (and recent) bookings in the same shop
  const sevenDaysAgoIso = new Date(
    new Date().setDate(new Date().getDate() - 7)
  ).toISOString();

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, status, notes, customer_id, vehicle_id")
    .eq("shop_id", prof.shop_id)
    .gte("starts_at", sevenDaysAgoIso)
    .order("starts_at", { ascending: true });

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-blackops text-orange-400 mb-4">
        Shop Bookings
      </h1>
      <BookingsTable
        initialRows={bookings ?? []}
        canEdit={["owner", "admin", "manager", "advisor"].includes(
          prof.role ?? ""
        )}
      />
    </div>
  );
}
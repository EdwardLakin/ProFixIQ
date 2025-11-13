export const dynamic = "force-dynamic";
export const revalidate = 0;

// app/portal/history/page.tsx
import { cookies } from "next/headers";
import Link from "next/link";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import HistoryList from "./components/HistoryList";

export default async function HistoryPage() {
  const supabase = createServerComponentClient<Database>({ cookies });

  // Ensure user is logged in
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    console.error("Error getting user:", userErr);
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className="text-2xl font-blackops text-orange-400">
          Service history
        </h1>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-4 text-sm text-neutral-200">
          <p>You need to be signed in to view your service history.</p>
          <Link
            href="/portal/signin"
            className="mt-3 inline-flex rounded border border-orange-500 bg-orange-600 px-3 py-1.5 text-xs font-semibold text-black hover:bg-orange-500"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  // Find the customer row linked to this auth user
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (custErr) {
    console.error("Error loading customer:", custErr);
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className="text-2xl font-blackops text-orange-400">
          Service history
        </h1>
        <p className="rounded-xl border border-red-700 bg-red-900/40 p-4 text-sm text-red-100">
          Failed to load your customer profile. Please try again later.
        </p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className="text-2xl font-blackops text-orange-400">
          Service history
        </h1>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-4 text-sm text-neutral-200">
          <p>
            We couldn’t find a customer profile linked to your account yet.
            Complete your profile so we can connect your visits.
          </p>
          <Link
            href="/portal/profile"
            className="mt-3 inline-flex rounded border border-orange-500 bg-orange-600 px-3 py-1.5 text-xs font-semibold text-black hover:bg-orange-500"
          >
            Go to profile
          </Link>
        </div>
      </div>
    );
  }

  // Fetch history records joined with vehicle + work order
  const { data: history, error } = await supabase
    .from("history")
    .select(
      `
      *,
      vehicle:vehicles(id, year, make, model, vin, license_plate),
      work_order:work_orders(id, status, type)
    `,
    )
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading history:", error);
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className="text-2xl font-blackops text-orange-400">
          Service history
        </h1>
        <p className="rounded-xl border border-red-700 bg-red-900/40 p-4 text-sm text-red-100">
          Failed to load history.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-blackops text-orange-400">
          Service history
        </h1>
        <p className="text-sm text-neutral-400">
          Past visits, notes, and work orders linked to your vehicles.
        </p>
      </header>

      <HistoryList items={history || []} />
    </div>
  );
}
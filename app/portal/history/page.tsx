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
      <div className="mx-auto max-w-xl space-y-3 text-white">
        <header className="space-y-1">
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-300">
            Service history
          </h1>
          <p className="text-xs text-neutral-400">
            Sign in to view your previous visits.
          </p>
        </header>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-neutral-200 backdrop-blur-md shadow-card">
          <p>You need to be signed in to view your service history.</p>
          <Link
            href="/portal/signin"
            className="mt-3 inline-flex items-center justify-center rounded-lg border border-orange-600 px-3 py-2 text-xs font-semibold text-orange-300 transition hover:bg-orange-600 hover:text-black"
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
      <div className="mx-auto max-w-xl space-y-3 text-white">
        <header className="space-y-1">
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-300">
            Service history
          </h1>
        </header>

        <div className="rounded-2xl border border-red-500/35 bg-red-900/20 p-4 text-sm text-red-100 backdrop-blur-md shadow-card">
          Failed to load your customer profile. Please try again later.
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-xl space-y-3 text-white">
        <header className="space-y-1">
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-300">
            Service history
          </h1>
          <p className="text-xs text-neutral-400">
            Complete your profile so we can connect your visits.
          </p>
        </header>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-neutral-200 backdrop-blur-md shadow-card">
          <p>
            We couldn’t find a customer profile linked to your account yet.
            Complete your profile so we can connect your visits.
          </p>
          <Link
            href="/portal/profile"
            className="mt-3 inline-flex items-center justify-center rounded-lg border border-orange-600 px-3 py-2 text-xs font-semibold text-orange-300 transition hover:bg-orange-600 hover:text-black"
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
      <div className="mx-auto max-w-xl space-y-3 text-white">
        <header className="space-y-1">
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-300">
            Service history
          </h1>
        </header>

        <div className="rounded-2xl border border-red-500/35 bg-red-900/20 p-4 text-sm text-red-100 backdrop-blur-md shadow-card">
          Failed to load history.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 text-white">
      <header className="space-y-1">
        <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-300">
          Service history
        </h1>
        <p className="text-xs text-neutral-400">
          Past visits, notes, and work orders linked to your vehicles.
        </p>
      </header>

      <HistoryList items={history || []} />
    </div>
  );
}
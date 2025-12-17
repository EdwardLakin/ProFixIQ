export const dynamic = "force-dynamic";
export const revalidate = 0;

// app/portal/history/page.tsx
import { cookies } from "next/headers";
import Link from "next/link";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import HistoryList from "./components/HistoryList";


function cardClass() {
  return "rounded-3xl border border-white/10 bg-black/30 p-4 backdrop-blur-md shadow-card";
}

function copperButtonClass() {
  return "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-[0.99]";
}

function errorCardClass() {
  return "rounded-3xl border border-red-500/35 bg-red-900/20 p-4 text-sm text-red-100 backdrop-blur-md shadow-card";
}

export default async function HistoryPage() {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) console.error("Error getting user:", userErr);

  if (!user) {
    return (
      <div className="mx-auto max-w-xl space-y-3 text-white">
        <header className="space-y-1">
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Service history
          </h1>
          <p className="text-xs text-neutral-400">
            Sign in to view your previous visits.
          </p>
        </header>

        <div className={cardClass()}>
          <p className="text-sm text-neutral-200">
            You need to be signed in to view your service history.
          </p>

          <Link
            href="/portal/auth/sign-in"
            className={copperButtonClass() + " mt-3"}
            style={{
              borderColor: "rgba(197,122,74,0.55)",
              color: "rgba(245,225,205,0.95)",
              background: "rgba(197,122,74,0.10)",
            }}
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
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Service history
          </h1>
        </header>

        <div className={errorCardClass()}>
          Failed to load your customer profile. Please try again later.
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-xl space-y-3 text-white">
        <header className="space-y-1">
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Service history
          </h1>
          <p className="text-xs text-neutral-400">
            Complete your profile so we can connect your visits.
          </p>
        </header>

        <div className={cardClass()}>
          <p className="text-sm text-neutral-200">
            We couldn’t find a customer profile linked to your account yet.
            Complete your profile so we can connect your visits.
          </p>

          <Link
            href="/portal/profile"
            className={copperButtonClass() + " mt-3"}
            style={{
              borderColor: "rgba(197,122,74,0.55)",
              color: "rgba(245,225,205,0.95)",
              background: "rgba(197,122,74,0.10)",
            }}
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
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Service history
          </h1>
        </header>

        <div className={errorCardClass()}>Failed to load history.</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 text-white">
      <header className="space-y-1">
        <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
          Service history
        </h1>
        <p className="text-xs text-neutral-400">
          Past visits, notes, and work orders linked to your vehicles.
        </p>

        <div
          className="mt-3 h-px w-full"
          style={{
            background:
              "linear-gradient(90deg, rgba(197,122,74,0.0), rgba(197,122,74,0.35), rgba(197,122,74,0.0))",
          }}
        />
      </header>

      <div className={cardClass()}>
        <HistoryList items={history || []} />
      </div>
    </div>
  );
}
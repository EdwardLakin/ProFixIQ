// app/dashboard/bookings/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/dist/server/request/cookies";
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
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black px-4 py-10 text-foreground">
        <div className="mx-auto max-w-xl rounded-2xl border border-[var(--metal-border-soft)] bg-card/95 p-6 text-center shadow-[0_20px_50px_rgba(0,0,0,0.9)]">
          <h1
            className="mb-3 text-2xl font-blackops tracking-[0.24em] text-[var(--accent-copper-light)]"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            Shop Bookings
          </h1>
          <p className="text-sm text-neutral-300">
            You must be signed in to view bookings.
          </p>
        </div>
      </div>
    );
  }

  // get staff shop
  const { data: prof } = await supabase
    .from("profiles")
    .select("shop_id, full_name, role")
    .eq("id", user.id)
    .single();

  if (!prof?.shop_id) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black px-4 py-10 text-foreground">
        <div className="mx-auto max-w-xl rounded-2xl border border-[var(--metal-border-soft)] bg-card/95 p-6 text-center shadow-[0_20px_50px_rgba(0,0,0,0.9)]">
          <h1
            className="mb-3 text-2xl font-blackops tracking-[0.24em] text-[var(--accent-copper-light)]"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            Shop Bookings
          </h1>
          <p className="text-sm text-neutral-300">
            No shop is linked to your profile yet. Complete onboarding or ask an
            admin to assign you to a shop.
          </p>
        </div>
      </div>
    );
  }

  // fetch future (and recent) bookings in the same shop
  const sevenDaysAgoIso = new Date(
    new Date().setDate(new Date().getDate() - 7),
  ).toISOString();

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, status, notes, customer_id, vehicle_id")
    .eq("shop_id", prof.shop_id)
    .gte("starts_at", sevenDaysAgoIso)
    .order("starts_at", { ascending: true });

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black px-4 py-10 text-foreground">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <header className="space-y-2">
          <div className="inline-flex items-center rounded-full border border-[var(--metal-border-soft)] bg-black/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
            Advisor • Bookings
          </div>
          <h1
            className="text-3xl font-blackops tracking-[0.26em] text-[var(--accent-copper-light)] sm:text-4xl"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            Shop Bookings
          </h1>
          <p className="max-w-xl text-xs text-neutral-400 sm:text-sm">
            View and manage upcoming appointments for{" "}
            <span className="font-medium text-neutral-200">
              {prof.full_name ?? "your shop"}
            </span>
            .
          </p>
        </header>

        {/* Card */}
        <section
          className="
            rounded-2xl border border-[var(--metal-border-soft)]
            bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_80%)]
            p-4 sm:p-6
            shadow-[0_24px_70px_rgba(0,0,0,0.95)]
          "
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-300">
              Upcoming & recent
            </h2>
            <span className="h-px flex-1 bg-gradient-to-r from-[var(--accent-copper-soft)]/70 via-neutral-700 to-transparent" />
          </div>

          <BookingsTable
            initialRows={bookings ?? []}
            canEdit={["owner", "admin", "manager", "advisor"].includes(
              prof.role ?? "",
            )}
          />
        </section>
      </div>
    </div>
  );
}
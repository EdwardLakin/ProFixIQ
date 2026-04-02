"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type BookingRow = Pick<
  DB["public"]["Tables"]["bookings"]["Row"],
  "id" | "starts_at" | "status"
>;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function BookingsWidget() {
  const supabase = createClientComponentClient<DB>();
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (active) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .single();

      const shopId = profile?.shop_id ?? null;

      if (!shopId) {
        if (active) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase
        .from("bookings")
        .select("id, starts_at, status")
        .eq("shop_id", shopId)
        .gte("starts_at", startOfToday())
        .order("starts_at", { ascending: true })
        .limit(50);

      if (active) {
        setRows((data ?? []) as BookingRow[]);
        setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [supabase]);

  const { pending, confirmed, today, nextUp } = useMemo(() => {
    const pendingCount = rows.filter((r) => r.status === "pending").length;
    const confirmedCount = rows.filter((r) => r.status === "confirmed").length;

    return {
      pending: pendingCount,
      confirmed: confirmedCount,
      today: rows.length,
      nextUp: rows[0] ?? null,
    };
  }, [rows]);

  return (
    <section className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-r from-black/80 via-slate-950/90 to-black/80 p-4 shadow-[0_20px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-50">Bookings</h3>
          <p className="text-xs text-neutral-400">
            Today’s appointment snapshot
          </p>
        </div>
        <Link
          href="/dashboard/bookings"
          className="text-xs font-medium text-orange-400 hover:text-orange-300"
        >
          Open bookings
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-black/30 p-3">
          <div className="text-[11px] text-neutral-400">Today</div>
          <div className="mt-1 text-lg font-semibold text-neutral-100">
            {loading ? "…" : today}
          </div>
        </div>
        <div className="rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-black/30 p-3">
          <div className="text-[11px] text-neutral-400">Pending</div>
          <div className="mt-1 text-lg font-semibold text-amber-300">
            {loading ? "…" : pending}
          </div>
        </div>
        <div className="rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-black/30 p-3">
          <div className="text-[11px] text-neutral-400">Confirmed</div>
          <div className="mt-1 text-lg font-semibold text-emerald-300">
            {loading ? "…" : confirmed}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-black/30 p-3">
        <div className="text-[11px] text-neutral-400">Next up</div>
        <div className="mt-1 text-sm text-neutral-100">
          {loading
            ? "Loading…"
            : nextUp
              ? new Date(nextUp.starts_at).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "No upcoming bookings"}
        </div>
      </div>
    </section>
  );
}
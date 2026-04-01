import Link from "next/link";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function BookingsWidget() {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .single();

  const shopId = profile?.shop_id ?? null;
  if (!shopId) return null;

  const { data: rows } = await supabase
    .from("bookings")
    .select("id, starts_at, status")
    .eq("shop_id", shopId)
    .gte("starts_at", startOfToday())
    .order("starts_at", { ascending: true })
    .limit(50);

  const all = rows ?? [];
  const pending = all.filter((r) => r.status === "pending").length;
  const confirmed = all.filter((r) => r.status === "confirmed").length;
  const today = all.length;
  const nextUp = all[0] ?? null;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-50">Bookings</h3>
          <p className="text-xs text-neutral-400">Today’s appointment snapshot</p>
        </div>
        <Link
          href="/dashboard/bookings"
          className="text-xs font-medium text-orange-400 hover:text-orange-300"
        >
          Open bookings
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="text-[11px] text-neutral-400">Today</div>
          <div className="mt-1 text-lg font-semibold text-neutral-100">{today}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="text-[11px] text-neutral-400">Pending</div>
          <div className="mt-1 text-lg font-semibold text-amber-300">{pending}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="text-[11px] text-neutral-400">Confirmed</div>
          <div className="mt-1 text-lg font-semibold text-emerald-300">{confirmed}</div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="text-[11px] text-neutral-400">Next up</div>
        <div className="mt-1 text-sm text-neutral-100">
          {nextUp
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

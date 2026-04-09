"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import DashboardWidgetBoard from "@/features/dashboard/components/DashboardWidgetBoard";
import type { DashboardCountState } from "@/features/dashboard/types/layout";

type DB = Database;

const CLOSED_PART_STATUSES = ["fulfilled", "rejected", "cancelled"] as const;
const CLOSED_LINE_STATUSES = ["completed", "ready_to_invoice", "invoiced"] as const;

function sqlTextIn(values: readonly string[]): string {
  return `(${values.map((v) => `'${v}'`).join(",")})`;
}

function isTechRole(role: string | null): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "tech" || r === "mechanic" || r === "technician";
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<DashboardCountState>({
    appointments: 0,
    workOrders: 0,
    partsRequests: 0,
  });

  useEffect(() => {
    void (async () => {
      setLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const uid = session?.user?.id ?? null;
      if (!uid) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role, shop_id")
        .eq("id", uid)
        .maybeSingle();

      const nextRole = profile?.role ?? null;
      const nextShopId = profile?.shop_id ?? null;

      setName(profile?.full_name ?? null);
      setRole(nextRole);
      setShopId(nextShopId);

      if (!nextShopId) {
        setLoading(false);
        return;
      }

      if (isTechRole(nextRole)) {
        const [myJobs, myParts] = await Promise.all([
          supabase
            .from("work_order_lines")
            .select("id", { count: "exact", head: true })
            .eq("shop_id", nextShopId)
            .eq("assigned_tech_id", uid)
            .not("status", "in", sqlTextIn(CLOSED_LINE_STATUSES)),
          supabase
            .from("part_requests")
            .select("id", { count: "exact", head: true })
            .eq("shop_id", nextShopId)
            .not("status", "in", sqlTextIn(CLOSED_PART_STATUSES))
            .or(`requested_by.eq.${uid},assigned_tech_id.eq.${uid}`),
        ]);

        setCounts({
          appointments: 0,
          workOrders: myJobs.error ? 0 : myJobs.count ?? 0,
          partsRequests: myParts.error ? 0 : myParts.count ?? 0,
        });
        setLoading(false);
        return;
      }

      const [appt, wo, parts] = await Promise.all([
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", nextShopId),
        supabase
          .from("work_orders")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", nextShopId),
        supabase
          .from("part_requests")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", nextShopId)
          .not("status", "in", sqlTextIn(CLOSED_PART_STATUSES)),
      ]);

      setCounts({
        appointments: appt.error ? 0 : appt.count ?? 0,
        workOrders: wo.error ? 0 : wo.count ?? 0,
        partsRequests: parts.error ? 0 : parts.count ?? 0,
      });
      setLoading(false);
    })();
  }, [supabase]);

  const displayName = name?.trim() || "there";

  return (
    <div className="w-full space-y-5 xl:space-y-6">
      <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.10),rgba(2,6,23,0.88))] px-5 py-5 backdrop-blur-xl xl:px-7 xl:py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-neutral-400">
              Dashboard
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-white xl:text-4xl">
              Welcome back, {displayName} 👋
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-neutral-300 xl:text-[15px]">
              Brand-aware widget dashboard with drag, resize, hide, reset, and saved desktop layouts.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/work-orders/create"
              className="rounded-full border border-orange-500/60 bg-orange-500/15 px-4 py-2 text-sm font-medium text-orange-100 transition hover:bg-orange-500 hover:text-black"
            >
              Create work order
            </Link>
            <Link
              href="/dashboard/owner/reports"
              className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:bg-black/40"
            >
              Full reports
            </Link>
          </div>
        </div>
      </section>

      {loading ? (
        <div
          className="rounded-3xl border p-6"
          style={{
            borderColor: "var(--theme-card-border,#334155)",
            background: "var(--theme-card-bg,#111827)",
            color: "var(--theme-text-secondary,#94A3B8)",
          }}
        >
          Loading dashboard…
        </div>
      ) : (
        <DashboardWidgetBoard
          role={role}
          context={{
            role,
            shopId,
            counts,
          }}
        />
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import DailySummaryCard from "@/features/shared/components/DailySummaryCard";
import SuggestedActionsPanel from "@/features/assistant/components/SuggestedActionsPanel";
import ReportsPerformanceWidget from "@/features/owner/reports/ReportsPerformanceWidget";
import AdvisorQueueWidget from "@/features/work-orders/components/dashboard/AdvisorQueueWidget";
import WorkOrderBoardWidget from "@shared/components/workboard/WorkOrderBoardWidget";
import BookingsWidget from "@/features/dashboard/widgets/BookingsWidget";
import {
  ShopPulseWidget,
  ApprovalRiskWidget,
  WaitingPartsWidget,
  RevenueWatchWidget,
  TechLoadWidget,
  ComebackRiskWidget,
} from "@/features/dashboard/widgets";

type DB = Database;

type CountState = {
  appointments: number;
  workOrders: number;
  partsRequests: number;
};

const CLOSED_PART_STATUSES = ["fulfilled", "rejected", "cancelled"] as const;
const CLOSED_LINE_STATUSES = ["completed", "ready_to_invoice", "invoiced"] as const;

function sqlTextIn(values: readonly string[]): string {
  return `(${values.map((v) => `'${v}'`).join(",")})`;
}

function isTechRole(role: string | null): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "tech" || r === "mechanic" || r === "technician";
}

function canViewOwnerDashboard(role: string | null): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "owner" || r === "admin" || r === "manager";
}

function metricTone(kind: "appointments" | "workOrders" | "partsRequests"): string {
  if (kind === "appointments") return "text-sky-300";
  if (kind === "partsRequests") return "text-amber-300";
  return "text-emerald-300";
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-4 backdrop-blur-xl xl:px-5">
      <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 text-xs text-neutral-400">{hint}</div>
    </div>
  );
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<CountState>({
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

      const tech = isTechRole(nextRole);

      if (tech) {
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

  const tech = isTechRole(role);
  const ownerLike = canViewOwnerDashboard(role);
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
              Desktop command view for today’s shop activity.
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

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          label="Appointments"
          value={counts.appointments}
          hint={tech ? "Not used for tech view" : "Open bookings in your shop"}
          tone={metricTone("appointments")}
        />
        <MetricCard
          label={tech ? "My active jobs" : "Work orders"}
          value={counts.workOrders}
          hint={tech ? "Assigned lines still in progress" : "Open work orders in your shop"}
          tone={metricTone("workOrders")}
        />
        <MetricCard
          label={tech ? "My parts requests" : "Parts requests"}
          value={counts.partsRequests}
          hint={tech ? "Requests tied to you" : "Open parts activity"}
          tone={metricTone("partsRequests")}
        />
        <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-4 backdrop-blur-xl xl:px-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            Role
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {role ?? "—"}
          </div>
          <div className="mt-1 text-xs text-neutral-400">
            {loading ? "Loading dashboard context…" : "Desktop dashboard active"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-12">
        <div className="md:col-span-2 xl:col-span-2 2xl:col-span-7">
          <DailySummaryCard />
        </div>

        <div className="xl:col-span-1 2xl:col-span-5">
          <SuggestedActionsPanel
            context={{
              pageType: "dashboard",
              pageTitle: "Dashboard",
            }}
            title="Suggested Actions"
            description="Recommended next actions based on today’s shop state"
            compact
            maxItems={6}
          />
        </div>

        {ownerLike ? (
          <div className="md:col-span-2 xl:col-span-2 2xl:col-span-8">
            <ReportsPerformanceWidget />
          </div>
        ) : null}

        {ownerLike ? (
          <div className="xl:col-span-1 2xl:col-span-4">
            <ShopPulseWidget shopId={shopId} />
          </div>
        ) : null}

        {ownerLike ? (
          <div className="xl:col-span-1 2xl:col-span-4">
            <RevenueWatchWidget shopId={shopId} />
          </div>
        ) : null}

        <div className="xl:col-span-1 2xl:col-span-4">
          <TechLoadWidget shopId={shopId} />
        </div>

        <div className="xl:col-span-1 2xl:col-span-4">
          <ApprovalRiskWidget shopId={shopId} />
        </div>

        <div className="xl:col-span-1 2xl:col-span-4">
          <WaitingPartsWidget shopId={shopId} />
        </div>

        <div className="xl:col-span-1 2xl:col-span-4">
          <ComebackRiskWidget shopId={shopId} />
        </div>

        <div className="md:col-span-2 xl:col-span-2 2xl:col-span-8">
          <WorkOrderBoardWidget />
        </div>

        <div className="space-y-4 md:col-span-2 xl:col-span-1 2xl:col-span-4">
          {!tech ? <BookingsWidget /> : null}
          {!tech ? <AdvisorQueueWidget /> : null}
        </div>
      </div>
    </div>
  );
}

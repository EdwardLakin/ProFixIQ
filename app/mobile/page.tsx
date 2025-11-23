"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import {
  MobileTechHome,
  type MobileTechStats,
  type MobileTechJob,
} from "@/features/mobile/dashboard/MobileTechHome";

type DB = Database;

type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];
type TechShift = DB["public"]["Tables"]["tech_shifts"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];

// helpers for date windows (local time)
function startOfDayLocal(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDayLocal(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// week starting Monday
function startOfWeekLocal(d: Date): Date {
  const x = startOfDayLocal(d);
  const day = x.getDay(); // 0 (Sun) .. 6 (Sat)
  const diffToMonday = (day + 6) % 7; // 0 if Mon, 1 if Tue, etc.
  x.setDate(x.getDate() - diffToMonday);
  return x;
}

function endOfWeekLocal(d: Date): Date {
  const start = startOfWeekLocal(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function msToHours(ms: number): number {
  return ms <= 0 ? 0 : ms / (1000 * 60 * 60);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function calcEfficiencyPct(worked: number, billed: number): number | null {
  if (worked <= 0) return null;
  // billed / worked, like: 10h worked, 7.6h billed → 76%
  return (billed / worked) * 100;
}

export default function MobileHome() {
  const supabase = createClientComponentClient<DB>();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState<MobileTechStats | null>(null);
  const [jobs, setJobs] = useState<MobileTechJob[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  // Load profile + shop
  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getUser();
        if (!sessionData?.user) {
          setLoading(false);
          return;
        }

        const uid = sessionData.user.id;

        const { data: profileRow } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", uid)
          .maybeSingle();

        setProfile(profileRow ?? null);

        if (profileRow?.shop_id) {
          const { data: shopRow } = await supabase
            .from("shops")
            .select("*")
            .eq("id", profileRow.shop_id)
            .maybeSingle();

          setShop(shopRow ?? null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  // Load mechanic stats + today's jobs
  useEffect(() => {
    const loadStats = async () => {
      if (!profile?.id || profile.role !== "mechanic") return;

      setStatsLoading(true);
      try {
        const uid = profile.id;
        const now = new Date();

        const dayStart = startOfDayLocal(now);
        const dayEnd = endOfDayLocal(now);
        const weekStart = startOfWeekLocal(now);
        const weekEnd = endOfWeekLocal(now);

        const dayStartIso = dayStart.toISOString();
        const dayEndIso = dayEnd.toISOString();
        const weekStartIso = weekStart.toISOString();
        const weekEndIso = weekEnd.toISOString();

        // Exclude breaks/lunch by only counting tech_shifts.type = 'shift'
        const [
          { data: todayShifts },
          { data: weekShifts },
          { data: todayCompletedLines },
          { data: weekCompletedLines },
          { data: activeLines },
          { data: todayJobsRaw },
        ] = await Promise.all([
          supabase
            .from("tech_shifts")
            .select("start_time,end_time,type,user_id")
            .eq("user_id", uid)
            .eq("type", "shift")
            .gte("start_time", dayStartIso)
            .lte("start_time", dayEndIso),

          supabase
            .from("tech_shifts")
            .select("start_time,end_time,type,user_id")
            .eq("user_id", uid)
            .eq("type", "shift")
            .gte("start_time", weekStartIso)
            .lte("start_time", weekEndIso),

          // completed jobs today for billed hours + jobsCompletedToday
          supabase
            .from("work_order_lines")
            .select("id,labor_time,punched_out_at,status")
            .or(
              `assigned_tech_id.eq.${uid},assigned_to.eq.${uid},user_id.eq.${uid}`,
            )
            .eq("status", "completed")
            .gte("punched_out_at", dayStartIso)
            .lte("punched_out_at", dayEndIso),

          // completed this week for weekly billed hours
          supabase
            .from("work_order_lines")
            .select("id,labor_time,punched_out_at,status")
            .or(
              `assigned_tech_id.eq.${uid},assigned_to.eq.${uid},user_id.eq.${uid}`,
            )
            .eq("status", "completed")
            .gte("punched_out_at", weekStartIso)
            .lte("punched_out_at", weekEndIso),

          // active / open jobs assigned to this tech
          supabase
            .from("work_order_lines")
            .select("id,status,description,job_type")
            .or(
              `assigned_tech_id.eq.${uid},assigned_to.eq.${uid},user_id.eq.${uid}`,
            )
            .in("status", [
              "awaiting",
              "queued",
              "in_progress",
              "on_hold",
              "paused",
              "assigned",
            ]),

          // today's jobs list for the card (simple label)
          supabase
            .from("work_order_lines")
            .select("id,status,description,job_type,created_at")
            .or(
              `assigned_tech_id.eq.${uid},assigned_to.eq.${uid},user_id.eq.${uid}`,
            )
            .gte("created_at", dayStartIso)
            .lte("created_at", dayEndIso)
            .order("created_at", { ascending: false }),
        ]);

        const nowMs = now.getTime();

        const sumWorkedHours = (rows: TechShift[] | null | undefined) => {
          if (!rows) return 0;
          let total = 0;
          for (const r of rows) {
            if (!r.start_time) continue;
            const s = new Date(r.start_time).getTime();
            const e = r.end_time ? new Date(r.end_time).getTime() : nowMs;
            if (Number.isNaN(s) || Number.isNaN(e)) continue;
            total += Math.max(0, e - s);
          }
          return msToHours(total);
        };

        const sumBilledHours = (rows: WorkOrderLine[] | null | undefined) => {
          if (!rows) return 0;
          return rows.reduce((acc, line) => {
            const raw = line.labor_time;
            const n =
              typeof raw === "number"
                ? raw
                : raw != null
                ? Number(raw)
                : 0;
            if (!Number.isFinite(n)) return acc;
            return acc + n;
          }, 0);
        };

        const todayWorked = round1(sumWorkedHours(todayShifts as TechShift[]));
        const weekWorked = round1(sumWorkedHours(weekShifts as TechShift[]));

        const todayBilled = round1(
          sumBilledHours(todayCompletedLines as WorkOrderLine[]),
        );
        const weekBilled = round1(
          sumBilledHours(weekCompletedLines as WorkOrderLine[]),
        );

        const todayEff = calcEfficiencyPct(todayWorked, todayBilled);
        const weekEff = calcEfficiencyPct(weekWorked, weekBilled);

        const completedTodayCount =
          todayCompletedLines?.length ?? 0;

        const active = (activeLines as WorkOrderLine[] | null) ?? [];
        const openJobs = active.length;
        const assignedJobs = active.filter(
          (l) => (l.status ?? "").toLowerCase() === "assigned",
        ).length || openJobs;

        const jobsList: MobileTechJob[] =
          (todayJobsRaw as WorkOrderLine[] | null)?.slice(0, 6).map((l) => {
            const base =
              l.description ||
              l.complaint ||
              (l.job_type
                ? String(l.job_type).replace(/_/g, " ")
                : "Job");
            return {
              id: String(l.id),
              label: base,
              status: String(l.status ?? "in_progress"),
              href: `/mobile/work-orders?focus=${l.id}`,
            };
          }) ?? [];

        const nextStats: MobileTechStats = {
          openJobs,
          assignedJobs,
          jobsCompletedToday: completedTodayCount,
          today: {
            workedHours: todayWorked,
            billedHours: todayBilled,
            efficiencyPct: todayEff,
          },
          week: {
            workedHours: weekWorked,
            billedHours: weekBilled,
            efficiencyPct: weekEff,
          },
        };

        setStats(nextStats);
        setJobs(jobsList);
      } finally {
        setStatsLoading(false);
      }
    };

    void loadStats();
  }, [profile, supabase]);

  const role = profile?.role ?? null;
  const userName = profile?.full_name ?? null;
  const shopName = shop?.name ?? null;

  // Mechanic-only tech dashboard override
  if (!loading && profile && role === "mechanic") {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto flex max-w-md flex-col gap-4 px-0 pb-8 pt-2">
          <MobileTechHome
            techName={profile.full_name || "Tech"}
            role="mechanic"
            stats={stats}
            jobs={jobs}
            loadingStats={statsLoading}
          />
        </div>
      </main>
    );
  }

  // Default companion home for other roles (advisor, manager, etc.)
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-8 pt-6">
        {/* Header */}
        <header className="space-y-1 text-center">
          <div className="text-[0.7rem] uppercase tracking-[0.25em] text-neutral-500">
            ProFixIQ • Mobile
          </div>

          <h1 className="font-blackops text-xl uppercase tracking-[0.18em] text-orange-400">
            Shop Console
          </h1>

          {loading ? (
            <p className="text-[0.8rem] text-neutral-400">Loading…</p>
          ) : userName ? (
            <p className="text-[0.8rem] text-neutral-400">
              Hi,{" "}
              <span className="font-medium text-neutral-100">
                {userName}
              </span>
              .
              {shopName && (
                <span className="ml-1 text-neutral-300">
                  ({shopName})
                </span>
              )}
            </p>
          ) : (
            <p className="text-[0.8rem] text-neutral-400">
              Stay on top of jobs from your phone.
            </p>
          )}
        </header>

        {/* App tiles */}
        <section className="grid grid-cols-2 gap-3">
          {/* Jobs / Work Orders */}
          <Link
            href="/mobile/work-orders"
            className="flex h-28 flex-col justify-between rounded-2xl border border-orange-500/70 bg-gradient-to-br from-orange-500/20 via-black/40 to-black/80 p-3 shadow-lg shadow-orange-500/30"
          >
            <div className="text-[0.7rem] uppercase tracking-[0.18em] text-orange-200/80">
              Jobs
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                Work Orders
              </div>
              <div className="mt-1 text-[0.75rem] text-orange-100/90">
                View & update live jobs.
              </div>
            </div>
          </Link>

          {/* New work order */}
          <Link
            href="/mobile/work-orders/create"
            className="flex h-28 flex-col justify-between rounded-2xl border border-neutral-700 bg-gradient-to-br from-neutral-900 via-black to-black p-3"
          >
            <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
              Quick
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                New Work Order
              </div>
              <div className="mt-1 text-[0.75rem] text-neutral-400">
                Capture customer & vehicle.
              </div>
            </div>
          </Link>

          {/* Inspections */}
          <Link
            href="/mobile/inspections"
            className="flex h-28 flex-col justify-between rounded-2xl border border-neutral-700 bg-gradient-to-br from-neutral-900 via-black to-black p-3"
          >
            <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
              Inspections
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                Inspection Queue
              </div>
              <div className="mt-1 text-[0.75rem] text-neutral-400">
                Start & review inspection forms.
              </div>
            </div>
          </Link>

          {/* AI & Messages */}
          <Link
            href="/mobile/messages"
            className="flex h-28 flex-col justify-between rounded-2xl border border-neutral-700 bg-gradient-to-br from-neutral-900 via-black to-black p-3"
          >
            <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
              AI
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                AI & Messages
              </div>
              <div className="mt-1 text-[0.75rem] text-neutral-400">
                Chat with AI and your team.
              </div>
            </div>
          </Link>

          {/* Planner */}
          <Link
            href="/mobile/planner"
            className="col-span-2 flex h-28 flex-col justify-between rounded-2xl border border-neutral-700 bg-gradient-to-br from-neutral-900 via-black to-black p-3"
          >
            <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
              Planner
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                Tech & Job Planner
              </div>
              <div className="mt-1 text-[0.75rem] text-neutral-400">
                See what’s coming up and who’s on it.
              </div>
            </div>
          </Link>
        </section>

        <footer className="mt-2 text-center text-[0.65rem] text-neutral-500">
          Mobile companion • Use the desktop app for admin & setup.
        </footer>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import { canonicalizeRole } from "@/features/shared/lib/rbac";
import type { Database } from "@shared/types/types/supabase";
import {
  MobileTechHome,
  type MobileTechJob,
  type MobileTechStats,
} from "@/features/mobile/dashboard/MobileTechHome";
import MobileAdvisorHome from "@/features/mobile/dashboard/MobileAdvisorHome";
import MobileManagerHome from "@/features/mobile/dashboard/MobileManagerHome";
import MobileLeadHome from "@/features/mobile/dashboard/MobileLeadHandHome";
import MobileOperationalRoleHome from "@/features/mobile/dashboard/MobileOperationalRoleHome";
import type { MobileRole } from "@/features/mobile/config/mobile-tiles";

type DB = Database;
type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];
type TechShift = DB["public"]["Tables"]["tech_shifts"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];

type HomePayload = {
  advisor: { awaitingApprovals: number; waiters: number; callbacks: number };
  manager: { activeWos: number; waiters: number; techniciansOnShift: number };
  leadhand: { techsOnShift: number; jobsInProgress: number; jobsBlocked: number };
};

function dayWindow(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function weekWindow(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function workedHours(rows: TechShift[] | null | undefined, nowMs: number) {
  return round1(
    (rows ?? []).reduce((total, row) => {
      if (!row.start_time) return total;
      const start = new Date(row.start_time).getTime();
      const end = row.end_time ? new Date(row.end_time).getTime() : nowMs;
      return total + Math.max(0, end - start) / 3_600_000;
    }, 0),
  );
}

function billedHours(rows: WorkOrderLine[] | null | undefined) {
  return round1(
    (rows ?? []).reduce((total, row) => {
      const value = Number(row.labor_time ?? 0);
      return Number.isFinite(value) ? total + value : total;
    }, 0),
  );
}

export default function MobileHome() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [homePayload, setHomePayload] = useState<HomePayload | null>(null);
  const [techStats, setTechStats] = useState<MobileTechStats | null>(null);
  const [techJobs, setTechJobs] = useState<MobileTechJob[]>([]);
  const [techLoading, setTechLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const actor = await resolveCurrentActor(supabase);
        if (!active) return;
        setProfile(actor.profile ?? null);
        if (!actor.shopId) {
          setShop(null);
          return;
        }
        const { data } = await supabase
          .from("shops")
          .select("*")
          .eq("id", actor.shopId)
          .maybeSingle();
        if (active) setShop(data ?? null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!profile?.id) return;
    void (async () => {
      const response = await fetch("/api/mobile/home-payload", { method: "GET" });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; payload?: HomePayload }
        | null;
      if (response.ok && body?.ok && body.payload) setHomePayload(body.payload);
    })();
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id || canonicalizeRole(profile.role) !== "mechanic") return;
    const userId = profile.id;
    setTechLoading(true);
    void (async () => {
      try {
        const now = new Date();
        const day = dayWindow(now);
        const week = weekWindow(now);
        const [todayShifts, weekShifts, todayDone, weekDone, activeLines, todayJobs] =
          await Promise.all([
            supabase.from("tech_shifts").select("*").eq("user_id", userId).eq("type", "shift").gte("start_time", day.start).lte("start_time", day.end),
            supabase.from("tech_shifts").select("*").eq("user_id", userId).eq("type", "shift").gte("start_time", week.start).lte("start_time", week.end),
            supabase.from("work_order_lines").select("*").or(`assigned_tech_id.eq.${userId},user_id.eq.${userId}`).eq("line_type", "job").eq("status", "completed").gte("punched_out_at", day.start).lte("punched_out_at", day.end),
            supabase.from("work_order_lines").select("*").or(`assigned_tech_id.eq.${userId},user_id.eq.${userId}`).eq("line_type", "job").eq("status", "completed").gte("punched_out_at", week.start).lte("punched_out_at", week.end),
            supabase.from("work_order_lines").select("*").or(`assigned_tech_id.eq.${userId},user_id.eq.${userId}`).eq("line_type", "job").in("status", ["awaiting", "assigned", "active", "on_hold"]),
            supabase.from("work_order_lines").select("*").or(`assigned_tech_id.eq.${userId},user_id.eq.${userId}`).eq("line_type", "job").gte("created_at", day.start).lte("created_at", day.end).order("created_at", { ascending: false }).limit(6),
          ]);

        const todayWorked = workedHours(todayShifts.data as TechShift[] | null, now.getTime());
        const weekWorked = workedHours(weekShifts.data as TechShift[] | null, now.getTime());
        const todayBilled = billedHours(todayDone.data as WorkOrderLine[] | null);
        const weekBilled = billedHours(weekDone.data as WorkOrderLine[] | null);
        const active = (activeLines.data as WorkOrderLine[] | null) ?? [];

        setTechStats({
          openJobs: active.length,
          assignedJobs: active.filter((line) => line.status === "assigned").length || active.length,
          jobsCompletedToday: todayDone.data?.length ?? 0,
          today: {
            workedHours: todayWorked,
            billedHours: todayBilled,
            efficiencyPct: todayWorked > 0 ? (todayBilled / todayWorked) * 100 : null,
          },
          week: {
            workedHours: weekWorked,
            billedHours: weekBilled,
            efficiencyPct: weekWorked > 0 ? (weekBilled / weekWorked) * 100 : null,
          },
        });
        setTechJobs(
          ((todayJobs.data as WorkOrderLine[] | null) ?? []).map((line) => ({
            id: String(line.id),
            label: line.description || line.complaint || String(line.job_type ?? "Job"),
            status: String(line.status ?? "awaiting"),
            href: "/mobile/tech/queue",
          })),
        );
      } finally {
        setTechLoading(false);
      }
    })();
  }, [profile?.id, profile?.role, supabase]);

  const canonical = canonicalizeRole(profile?.role);
  const role = canonical === "unknown" ? null : (canonical as MobileRole);
  const name = profile?.full_name || "Team member";

  if (loading) {
    return (
      <main className="min-h-screen overflow-x-hidden bg-[color:var(--theme-surface-page)] px-4 py-16 text-center text-[color:var(--theme-text-primary)]">
        <div className="mx-auto h-10 w-56 animate-pulse rounded-lg bg-[color:var(--theme-surface-panel)]" />
      </main>
    );
  }

  if (role === "mechanic") {
    return <MobileTechHome techName={name} role={role} stats={techStats} jobs={techJobs} loadingStats={techLoading} />;
  }
  if (role === "advisor") {
    return <MobileAdvisorHome advisorName={name} role={role} stats={homePayload?.advisor} />;
  }
  if (role === "lead_hand") {
    return <MobileLeadHome leadName={name} role={role} stats={homePayload?.leadhand} />;
  }
  if (role === "owner" || role === "admin" || role === "manager" || role === "foreman") {
    return <MobileManagerHome managerName={name} role={role} stats={homePayload?.manager} />;
  }
  if (role === "parts" || role === "dispatcher" || role === "fleet_manager" || role === "driver") {
    return <MobileOperationalRoleHome name={name} role={role} />;
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[color:var(--theme-surface-page)] px-4 py-12 text-center text-[color:var(--theme-text-primary)]">
      <div className="mx-auto max-w-md rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--accent-copper)]">ProFixIQ mobile</div>
        <h1 className="mt-2 text-xl font-semibold">Mobile access is not configured</h1>
        <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
          {shop?.name ? `${shop.name} has not assigned a supported mobile role to this account.` : "This account is not attached to a shop role."}
        </p>
      </div>
    </main>
  );
}

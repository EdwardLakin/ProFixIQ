"use client";

import { RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import MobileAdvisorHome from "@/features/mobile/dashboard/MobileAdvisorHome";
import MobileLeadHome from "@/features/mobile/dashboard/MobileLeadHandHome";
import MobileManagerHome from "@/features/mobile/dashboard/MobileManagerHome";
import MobileOperationalRoleHome from "@/features/mobile/dashboard/MobileOperationalRoleHome";
import {
  MobileTechHome,
  type MobileTechJob,
  type MobileTechStats,
} from "@/features/mobile/dashboard/MobileTechHome";
import type { MobileRole } from "@/features/mobile/config/mobile-tiles";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import { canonicalizeRole } from "@/features/shared/lib/rbac";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { useOperationsLiveRefresh } from "@/features/work-orders/hooks/useOperationsLiveRefresh";

type DB = Database;
type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];
type TechShift = DB["public"]["Tables"]["tech_shifts"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];

type HomePayload = {
  advisor: {
    awaitingApprovals: number;
    activeWos: number;
    waiters: number;
    appointmentsToday: number;
  };
  manager: { activeWos: number; waiters: number; techniciansOnShift: number };
  leadhand: {
    techsOnShift: number;
    jobsInProgress: number;
    jobsBlocked: number;
  };
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

function MobileHomeFreshness({
  children,
  lastUpdatedAt,
  liveStatus,
  refreshing,
  error,
  onRefresh,
}: {
  children: ReactNode;
  lastUpdatedAt: Date | null;
  liveStatus: "connecting" | "live" | "unavailable";
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <>
      {children}
      <section className="mx-4 mb-24 mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">
        <div className="min-w-0">
          <div>
            {liveStatus === "live"
              ? "Live updates connected"
              : liveStatus === "connecting"
                ? "Connecting live updates…"
                : "Live updates unavailable"}
          </div>
          <div className={error ? "text-amber-600 dark:text-amber-300" : ""}>
            {error ??
              `Last updated ${lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}`}
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[color:var(--theme-border-soft)] px-3 font-semibold text-[color:var(--accent-copper)] disabled:opacity-55"
        >
          <RefreshCw
            aria-hidden
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </section>
    </>
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
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const homeLoadGenerationRef = useRef(0);

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
        const response = await fetch(
          "/api/work-order-lines/operational?limit=1",
          { cache: "no-store" },
        );
        const body = (await response.json().catch(() => null)) as {
          shop?: Shop | null;
        } | null;
        if (active) setShop(response.ok ? (body?.shop ?? null) : null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  const loadHomePayload = useCallback(async () => {
    const generation = ++homeLoadGenerationRef.current;
    const isLatest = () => generation === homeLoadGenerationRef.current;
    setHomeRefreshing(true);
    setHomeError(null);
    try {
      const response = await fetch("/api/mobile/home-payload", {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        payload?: HomePayload;
        error?: string;
      } | null;
      if (!response.ok || !body?.ok || !body.payload) {
        throw new Error(body?.error || "Mobile counts could not be refreshed.");
      }
      if (isLatest()) {
        setHomePayload(body.payload);
        setLastUpdatedAt(new Date());
      }
    } catch (error) {
      if (isLatest()) {
        setHomeError(
          error instanceof Error
            ? error.message
            : "Mobile counts could not be refreshed.",
        );
      }
    } finally {
      if (isLatest()) setHomeRefreshing(false);
    }
  }, []);

  const loadTechnicianState = useCallback(async () => {
    if (!profile?.id || canonicalizeRole(profile.role) !== "mechanic") return;
    const userId = profile.id;
    setTechLoading(true);
    try {
      const now = new Date();
      const day = dayWindow(now);
      const week = weekWindow(now);
      const operationalLinesPromise = fetch(
        "/api/work-order-lines/operational?limit=2000",
        { cache: "no-store" },
      ).then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          lines?: WorkOrderLine[];
        } | null;
        if (!response.ok) {
          throw new Error("Assigned jobs could not be loaded.");
        }
        return body?.lines ?? [];
      });
      const [
        todayShifts,
        weekShifts,
        todayDone,
        weekDone,
        activeLines,
        todayJobs,
      ] = await Promise.all([
        supabase
          .from("tech_shifts")
          .select("*")
          .eq("user_id", userId)
          .eq("type", "shift")
          .gte("start_time", day.start)
          .lte("start_time", day.end),
        supabase
          .from("tech_shifts")
          .select("*")
          .eq("user_id", userId)
          .eq("type", "shift")
          .gte("start_time", week.start)
          .lte("start_time", week.end),
        operationalLinesPromise.then((rows) => ({
          data: rows.filter(
            (line) =>
              line.status === "completed" &&
              Boolean(line.punched_out_at) &&
              line.punched_out_at! >= day.start &&
              line.punched_out_at! <= day.end,
          ),
        })),
        operationalLinesPromise.then((rows) => ({
          data: rows.filter(
            (line) =>
              line.status === "completed" &&
              Boolean(line.punched_out_at) &&
              line.punched_out_at! >= week.start &&
              line.punched_out_at! <= week.end,
          ),
        })),
        operationalLinesPromise.then((rows) => ({
          data: rows.filter((line) =>
            [
              "awaiting",
              "assigned",
              "active",
              "in_progress",
              "on_hold",
            ].includes(line.status),
          ),
        })),
        operationalLinesPromise.then((rows) => ({
          data: rows
            .filter(
              (line) =>
                Boolean(line.created_at) &&
                line.created_at! >= day.start &&
                line.created_at! <= day.end,
            )
            .sort(
              (left, right) =>
                new Date(right.created_at ?? 0).getTime() -
                new Date(left.created_at ?? 0).getTime(),
            )
            .slice(0, 6),
        })),
      ]);

      const todayWorked = workedHours(
        todayShifts.data as TechShift[] | null,
        now.getTime(),
      );
      const weekWorked = workedHours(
        weekShifts.data as TechShift[] | null,
        now.getTime(),
      );
      const todayBilled = billedHours(todayDone.data as WorkOrderLine[] | null);
      const weekBilled = billedHours(weekDone.data as WorkOrderLine[] | null);
      const active = (activeLines.data as WorkOrderLine[] | null) ?? [];

      setTechStats({
        openJobs: active.length,
        assignedJobs:
          active.filter((line) => line.status === "assigned").length ||
          active.length,
        jobsCompletedToday: todayDone.data?.length ?? 0,
        today: {
          workedHours: todayWorked,
          billedHours: todayBilled,
          efficiencyPct:
            todayWorked > 0 ? (todayBilled / todayWorked) * 100 : null,
        },
        week: {
          workedHours: weekWorked,
          billedHours: weekBilled,
          efficiencyPct:
            weekWorked > 0 ? (weekBilled / weekWorked) * 100 : null,
        },
      });
      setTechJobs(
        ((todayJobs.data as WorkOrderLine[] | null) ?? []).map((line) => ({
          id: String(line.id),
          label:
            line.description ||
            line.complaint ||
            String(line.job_type ?? "Job"),
          status: String(line.status ?? "awaiting"),
          href: line.work_order_id
            ? `/mobile/work-orders/${line.work_order_id}`
            : "/mobile/tech/queue",
        })),
      );
    } catch (error) {
      setHomeError(
        error instanceof Error
          ? error.message
          : "Technician metrics could not be refreshed.",
      );
    } finally {
      setTechLoading(false);
    }
  }, [profile?.id, profile?.role, supabase]);

  const refreshVisibleHome = useCallback(async () => {
    if (canonicalizeRole(profile?.role) === "mechanic") {
      await Promise.all([loadHomePayload(), loadTechnicianState()]);
      return;
    }
    await loadHomePayload();
  }, [loadHomePayload, loadTechnicianState, profile?.role]);

  useEffect(() => {
    if (profile?.id) void refreshVisibleHome();
  }, [profile?.id, refreshVisibleHome]);

  const liveStatus = useOperationsLiveRefresh({
    shopId: profile?.shop_id ?? null,
    onRefresh: refreshVisibleHome,
  });

  const withFreshness = (content: ReactNode) => (
    <MobileHomeFreshness
      lastUpdatedAt={lastUpdatedAt}
      liveStatus={liveStatus}
      refreshing={homeRefreshing || techLoading}
      error={homeError}
      onRefresh={() => void refreshVisibleHome()}
    >
      {content}
    </MobileHomeFreshness>
  );

  const canonical = canonicalizeRole(profile?.role);
  const role =
    canonical === "unknown" || canonical === "customer"
      ? null
      : (canonical as MobileRole);
  const name = profile?.full_name || "Team member";

  if (loading) {
    return (
      <main className="min-h-screen overflow-x-hidden bg-[color:var(--theme-surface-page)] px-4 py-16 text-center text-[color:var(--theme-text-primary)]">
        <div className="mx-auto h-10 w-56 animate-pulse rounded-lg bg-[color:var(--theme-surface-panel)]" />
      </main>
    );
  }

  if (role === "mechanic") {
    return withFreshness(
      <MobileTechHome
        techName={name}
        role={role}
        stats={techStats}
        jobs={techJobs}
        loadingStats={techLoading}
      />,
    );
  }
  if (role === "advisor" || role === "service") {
    return withFreshness(
      <MobileAdvisorHome
        advisorName={name}
        role={role}
        stats={homePayload?.advisor}
      />,
    );
  }
  if (role === "lead_hand") {
    return withFreshness(
      <MobileLeadHome
        leadName={name}
        role={role}
        stats={homePayload?.leadhand}
      />,
    );
  }
  if (
    role === "owner" ||
    role === "admin" ||
    role === "manager" ||
    role === "foreman"
  ) {
    return withFreshness(
      <MobileManagerHome
        managerName={name}
        role={role}
        stats={homePayload?.manager}
      />,
    );
  }
  if (
    role === "parts" ||
    role === "dispatcher" ||
    role === "fleet_manager" ||
    role === "driver"
  ) {
    return <MobileOperationalRoleHome name={name} role={role} />;
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[color:var(--theme-surface-page)] px-4 py-12 text-center text-[color:var(--theme-text-primary)]">
      <div className="mx-auto max-w-md rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--accent-copper)]">
          ProFixIQ mobile
        </div>
        <h1 className="mt-2 text-xl font-semibold">
          Mobile access is not configured
        </h1>
        <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
          {shop?.name
            ? `${shop.name} has not assigned a supported mobile role to this account.`
            : "This account is not attached to a shop role."}
        </p>
      </div>
    </main>
  );
}

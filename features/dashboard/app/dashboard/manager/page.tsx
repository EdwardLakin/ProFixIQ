// features/dashboard/app/dashboard/manager/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

// Your main manager UI (already in your repo)
import ManagerJobDashboard from "@work-orders/components/manager/ManagerJobDashboard";

export default function ManagerPageClient() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const params = useSearchParams();

  // simple role gate
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  // KPIs for quick status glance
  const [awaiting, setAwaiting] = useState(0);
  const [inProgress, setInProgress] = useState(0);
  const [onHold, setOnHold] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [unassigned, setUnassigned] = useState(0);

  const selected = params.get("status") || "all";

  // -------- Role check (client safe) --------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) setAllowed(false);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        const ok =
          !!profile &&
          ["manager", "admin", "owner", "advisor"].includes(profile.role);

        if (!cancelled) setAllowed(ok);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // -------- KPIs + live updates --------
  const refreshKpis = async () => {
    // count helpers without introducing implicit-any
    const cAwaiting = await supabase
      .from("work_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("status", "awaiting");

    const cInProgress = await supabase
      .from("work_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("status", "in_progress");

    const cOnHold = await supabase
      .from("work_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("status", "on_hold");

    const cCompleted = await supabase
      .from("work_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed");

    const cUnassigned = await supabase
      .from("work_order_lines")
      .select("id", { count: "exact", head: true })
      .is("assigned_to", null);

    setAwaiting(cAwaiting.count ?? 0);
    setInProgress(cInProgress.count ?? 0);
    setOnHold(cOnHold.count ?? 0);
    setCompleted(cCompleted.count ?? 0);
    setUnassigned(cUnassigned.count ?? 0);
  };

  useEffect(() => {
    void refreshKpis();

    const ch = supabase
      .channel("manager-wo-lines")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_lines" },
        () => {
          void refreshKpis();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase]);

  // -------- Filter via URL (so child can read it if it wants) --------
  const setFilter = (status: string) => {
    const next = new URLSearchParams(Array.from(params.entries()));
    if (!status || status === "all") next.delete("status");
    else next.set("status", status);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  // -------- Render --------
  if (loading) return <div className="p-4 text-sm text-neutral-400">Loading…</div>;
  if (!allowed) return <div className="p-6 text-red-400">You do not have access to this page.</div>;

  return (
    <div className="space-y-6">
      {/* Header + quick actions */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-orange-400">Manager Dashboard</h1>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/work-orders/create"
            className="rounded-md bg-orange-500 px-4 py-2 font-semibold text-black hover:bg-orange-600"
          >
            + Create Work Order
          </Link>
          <Link
            href="/work-orders/queue"
            className="rounded-md border border-white/15 px-4 py-2 hover:border-orange-500"
          >
            Job Queue
          </Link>
          <Link
            href="/parts"
            className="rounded-md border border-white/15 px-4 py-2 hover:border-orange-500"
          >
            Parts
          </Link>
        </div>
      </header>

      {/* KPIs / Filters */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <button
          onClick={() => setFilter("awaiting")}
          className={`rounded-lg border p-4 text-left transition ${
            selected === "awaiting"
              ? "border-orange-500 bg-neutral-900"
              : "border-white/10 bg-neutral-900/60 hover:border-orange-500"
          }`}
        >
          <div className="text-xs text-neutral-400">Awaiting</div>
          <div className="mt-1 text-2xl font-bold">{awaiting}</div>
        </button>

        <button
          onClick={() => setFilter("in_progress")}
          className={`rounded-lg border p-4 text-left transition ${
            selected === "in_progress"
              ? "border-orange-500 bg-neutral-900"
              : "border-white/10 bg-neutral-900/60 hover:border-orange-500"
          }`}
        >
          <div className="text-xs text-neutral-400">In Progress</div>
          <div className="mt-1 text-2xl font-bold">{inProgress}</div>
        </button>

        <button
          onClick={() => setFilter("on_hold")}
          className={`rounded-lg border p-4 text-left transition ${
            selected === "on_hold"
              ? "border-orange-500 bg-neutral-900"
              : "border-white/10 bg-neutral-900/60 hover:border-orange-500"
          }`}
        >
          <div className="text-xs text-neutral-400">On Hold</div>
          <div className="mt-1 text-2xl font-bold">{onHold}</div>
        </button>

        <button
          onClick={() => setFilter("completed")}
          className={`rounded-lg border p-4 text-left transition ${
            selected === "completed"
              ? "border-orange-500 bg-neutral-900"
              : "border-white/10 bg-neutral-900/60 hover:border-orange-500"
          }`}
        >
          <div className="text-xs text-neutral-400">Completed (All)</div>
          <div className="mt-1 text-2xl font-bold">{completed}</div>
        </button>

        <button
          onClick={() => setFilter("unassigned")}
          className={`rounded-lg border p-4 text-left transition ${
            selected === "unassigned"
              ? "border-orange-500 bg-neutral-900"
              : "border-white/10 bg-neutral-900/60 hover:border-orange-500"
          }`}
        >
          <div className="text-xs text-neutral-400">Unassigned</div>
          <div className="mt-1 text-2xl font-bold">{unassigned}</div>
        </button>
      </section>

      {/* Main manager module (encapsulated UI) */}
      <section className="rounded-xl border border-white/10 bg-neutral-900 p-3">
        {/* If ManagerJobDashboard reads the ?status query, it'll auto-filter.
           Even if it doesn't, this still renders the full manager view. */}
        <ManagerJobDashboard />
      </section>
    </div>
  );
}
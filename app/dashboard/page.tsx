// app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Link from "next/link";

type CountState = {
  appointments: number | null;
  workOrders: number | null;
  partsRequests: number | null;
};

export default function DashboardPage() {
  const supabase = createClientComponentClient<Database>();
  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [counts, setCounts] = useState<CountState>({
    appointments: null,
    workOrders: null,
    partsRequests: null,
  });

  // fetch profile
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", uid)
        .maybeSingle();
      setName(profile?.full_name ?? null);
      setRole(profile?.role ?? null);
    })();
  }, [supabase]);

  // fetch the 3 counts
  useEffect(() => {
    (async () => {
      const [appt, wo, parts] = await Promise.all([
        // 🔁 appointments → bookings
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("work_orders")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("parts_requests")
          .select("id", { count: "exact", head: true }),
      ]);

      setCounts({
        appointments: appt.error ? 0 : appt.count ?? 0,
        workOrders: wo.error ? 0 : wo.count ?? 0,
        partsRequests: parts.error ? 0 : parts.count ?? 0,
      });
    })();
  }, [supabase]);

  const firstName = name ? name.split(" ")[0] : null;

  return (
    <div className="relative space-y-8 fade-in">
      {/* soft gradient background for this page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.9),#020617_70%)]"
      />

      {/* welcome panel */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 shadow-card backdrop-blur-md flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {firstName ? `Welcome back, ${firstName} 👋` : "Welcome 👋"}
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Here’s a quick view of what matters today in your shop.
          </p>
        </div>
      </section>

      {/* overview cards */}
      <section className="grid gap-4 md:grid-cols-4">
        <OverviewCard
          title="Today’s appointments"
          value={
            counts.appointments === null ? "…" : String(counts.appointments)
          }
          href="/portal/appointments"
        />
        <OverviewCard
          title="Open work orders"
          value={counts.workOrders === null ? "…" : String(counts.workOrders)}
          href="/work-orders/view"
        />
        <OverviewCard
          title="Parts requests"
          value={
            counts.partsRequests === null ? "…" : String(counts.partsRequests)
          }
          href="/parts/requests"
        />
        <OverviewCard title="Team chat" value="Open" href="/chat" />
      </section>

      {/* quick actions */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-300">
          Quick actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <QuickButton href="/work-orders/create?autostart=1">
            New work order
          </QuickButton>
          <QuickButton href="/portal/appointments">
            Appointments
          </QuickButton>
          <QuickButton href="/ai/assistant">AI assistant</QuickButton>
          {role === "owner" || role === "admin" ? (
            <QuickButton href="/dashboard/owner/reports">
              Reports
            </QuickButton>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function OverviewCard({
  title,
  value,
  href,
}: {
  title: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 shadow-card backdrop-blur-md transition hover:border-accent hover:shadow-glow">
      {/* subtle highlight wash on hover */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),transparent_60%)] opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative">
        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
          {title}
        </p>
        <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

function QuickButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-md border border-orange-400/60 bg-white/[0.03] px-4 py-2 text-sm text-white shadow-sm backdrop-blur-md transition hover:bg-orange-500/10 hover:border-orange-400"
    >
      {children}
    </Link>
  );
}
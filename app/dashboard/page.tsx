// app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Link from "next/link";

export default function DashboardPage() {
  const supabase = createClientComponentClient<Database>();
  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      {/* top welcome */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {name ? `Welcome back, ${name.split(" ")[0]} 👋` : "Welcome 👋"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here’s a quick view of what matters today.
          </p>
        </div>
      </div>

      {/* small overview cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <OverviewCard
          title="Today’s appointments"
          value="—"
          href="/portal/appointments"
        />
        <OverviewCard
          title="Open work orders"
          value="—"
          href="/work-orders/view"
        />
        <OverviewCard
          title="Parts requests"
          value="—"
          href="/parts/requests"
        />
        <OverviewCard
          title="Team chat"
          value="Open"
          href="/chat"
        />
      </div>

      {/* role-based shortcuts but lighter */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Quick actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <QuickButton href="/work-orders/create?autostart=1">
            New work order
          </QuickButton>
          <QuickButton href="/portal/appointments">Appointments</QuickButton>
          <QuickButton href="/chat">Messages</QuickButton>
          <QuickButton href="/ai/assistant">AI assistant</QuickButton>
          {role === "owner" || role === "admin" ? (
            <QuickButton href="/dashboard/owner/reports">
              Reports
            </QuickButton>
          ) : null}
        </div>
      </div>

      {/* you can add a "recent activity" later */}
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
    <div className="rounded-lg border border-border/40 bg-surface/40 px-4 py-3 hover:border-accent/80 transition">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
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
      className="inline-flex items-center gap-2 rounded-md border border-border/40 bg-surface/40 px-3 py-1.5 text-sm text-foreground hover:border-accent hover:text-foreground transition"
    >
      {children}
    </Link>
  );
}
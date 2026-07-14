"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";

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
  const supabase = createBrowserSupabase();
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
    <DashboardWidgetShell
      eyebrow="AI · Bookings"
      title="Upcoming appointments"
      subtitle="Today’s appointment snapshot and upcoming slot."
      rightSlot={
        <Link
          href="/dashboard/bookings"
          className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-inset)]"
        >
          Open bookings →
        </Link>
      }
      compact
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Today" value={loading ? "…" : String(today)} tone="neutral" />
          <Metric label="Pending" value={loading ? "…" : String(pending)} tone="accent" />
          <Metric label="Confirmed" value={loading ? "…" : String(confirmed)} tone="primary" />
        </div>

        <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
          <div className="text-[11px] text-[color:var(--theme-text-secondary)]">Next up</div>
          <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
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
      </div>
    </DashboardWidgetShell>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "primary" | "accent";
}) {
  const toneClass =
    tone === "accent"
      ? "text-[color:var(--brand-accent)]"
      : tone === "primary"
        ? "text-[color:var(--brand-primary)]"
        : "text-[color:var(--theme-text-primary)]";

  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
      <div className="text-[11px] text-[color:var(--theme-text-secondary)]">{label}</div>
      <div className={["mt-1 text-lg font-semibold", toneClass].join(" ")}>{value}</div>
    </div>
  );
}

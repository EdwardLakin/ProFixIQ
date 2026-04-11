"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import { toDashboardFallbackMessage } from "@/features/dashboard/lib/widget-fallback";
import StatusBadge from "@shared/components/ui/StatusBadge";
import { cn } from "@shared/lib/utils";

type DB = Database;
type BoardRow = DB["public"]["Views"]["v_work_order_board_cards_shop"]["Row"];

function ageLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d`;
  if (h >= 1) return `${h}h`;
  const m = Math.floor(ms / 60000);
  return `${Math.max(1, m)}m`;
}

function MetricTile(props: {
  label: string;
  value: string;
  tone?: "neutral" | "danger" | "accent";
}) {
  const { label, value, tone = "neutral" } = props;

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-lg font-semibold",
          tone === "danger"
            ? "text-[color:var(--brand-accent)]"
            : tone === "accent"
              ? "text-[color:var(--brand-primary)]"
              : "text-neutral-100",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default function ShopPulseWidget({
  shopId,
  embedded = false,
}: {
  shopId: string | null;
  embedded?: boolean;
}) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BoardRow[]>([]);

  useEffect(() => {
    if (!shopId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: qErr } = await supabase
          .from("v_work_order_board_cards_shop")
          .select("*")
          .eq("shop_id", shopId)
          .order("activity_at", { ascending: false })
          .limit(80);

        if (qErr) throw qErr;
        if (!cancelled) setRows((data as BoardRow[]) ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(toDashboardFallbackMessage(e, "Data unavailable. Try refresh."));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId, supabase]);

  const pulse = useMemo(() => {
    const active = rows.filter((r) => r.overall_stage !== "completed");
    const approvals = active.filter((r) => r.overall_stage === "awaiting_approval");
    const parts = active.filter((r) => r.overall_stage === "waiting_parts");
    const onHold = active.filter((r) => r.overall_stage === "on_hold");
    const urgent = active.filter((r) => r.priority === 1);
    const waiters = active.filter((r) => !!r.is_waiter);
    const danger = active.filter((r) => r.risk_level === "danger");
    const ready = rows.filter((r) => r.overall_stage === "completed");

    const messages: string[] = [];

    if (danger.length > 0) messages.push(`${danger.length} high-risk job${danger.length === 1 ? "" : "s"}`);
    if (approvals.length > 0) messages.push(`${approvals.length} waiting approval`);
    if (parts.length > 0) messages.push(`${parts.length} waiting parts`);
    if (onHold.length > 0) messages.push(`${onHold.length} on hold`);
    if (urgent.length > 0) messages.push(`${urgent.length} urgent`);
    if (waiters.length > 0) messages.push(`${waiters.length} waiter job${waiters.length === 1 ? "" : "s"}`);
    if (ready.length > 0) messages.push(`${ready.length} completed`);

    return {
      active: active.length,
      danger: danger.length,
      messages,
      latest: rows[0]?.activity_at ? ageLabel(rows[0].activity_at) : "—",
    };
  }, [rows]);

  const content = (
    <>
      {embedded ? (
        <div className="mb-2 flex justify-end">
          <Link
            href="/work-orders/board"
            className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold text-neutral-200 transition hover:border-[color:var(--brand-accent)] hover:bg-black/45"
          >
            Open board →
          </Link>
        </div>
      ) : null}
      {loading ? (
        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-neutral-300">
          Loading AI pulse…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_14%,transparent)] px-4 py-4 text-sm text-[color:var(--brand-accent)]">
          {error}
        </div>
      ) : (
        <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
              Live totals
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3">
              <MetricTile label="Active" value={String(pulse.active)} />
              <MetricTile label="High risk" value={String(pulse.danger)} tone="danger" />
              <MetricTile label="Latest" value={pulse.latest} tone="accent" />
            </div>
          </div>

          <div className="min-h-0 rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
              AI summary
            </div>

            {pulse.messages.length === 0 ? (
              <div className="mt-3 text-sm text-neutral-300">
                Nothing major is flagged right now. The shop flow looks stable.
              </div>
            ) : (
              <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
                {pulse.messages.map((msg, index) => (
                  <StatusBadge
                    key={`${msg}-${index}`}
                    variant={msg.includes("high-risk") ? "danger" : "neutral"}
                  >
                    {msg}
                  </StatusBadge>
                ))}
              </div>
            )}

            <div className="mt-4 text-xs text-neutral-500">
              Compact action summary only. Use the work board and queue widgets below to drill in.
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) return content;

  return (
    <DashboardWidgetShell
      eyebrow="AI · Shop Pulse"
      title="What needs attention right now"
      subtitle="Fast operational summary from the live work board."
      rightSlot={
        <Link
          href="/work-orders/board"
          className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold text-neutral-200 transition hover:border-[color:var(--brand-accent)] hover:bg-black/45"
        >
          Open board →
        </Link>
      }
    >
      {content}
    </DashboardWidgetShell>
  );
}

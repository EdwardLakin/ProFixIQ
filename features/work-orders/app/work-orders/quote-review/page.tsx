"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";
import { formatDecisionStatus } from "@/features/shared/lib/decisionStatus";
import DecisionEventFeed from "@/features/shared/components/ui/DecisionEventFeed";
import { deriveEventsFromQuote } from "@/features/shared/lib/decisionEvents";

type DB = Database;

type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];
type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

type WorkOrderWithMeta = WorkOrder & {
  shops?: Pick<Shop, "name"> | null;
  work_order_lines?: Array<
    Pick<Line, "id" | "status" | "approval_state" | "labor_time" | "line_no" | "description" | "created_at" | "updated_at">
  >;
  work_order_quote_lines?: Array<Pick<QuoteLine, "id" | "stage">>;
  labor_hours?: number | null;
  waiting_for_parts?: boolean;
};

const COPPER = "#C57A4A";

const INPUT_DARK =
  "w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:ring-2 focus:ring-[var(--accent-copper)]/35";

function safeTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function queueAccent(waitingForParts: boolean): {
  badge: string;
  border: string;
  progress: string;
} {
  if (waitingForParts) {
    return {
      badge: "border-sky-400/60 bg-sky-500/10 text-sky-100",
      border: "border-sky-500/25",
      progress: "bg-sky-400",
    };
  }

  return {
    badge: "border-emerald-400/70 bg-emerald-500/10 text-emerald-100",
    border: "border-emerald-500/25",
    progress: "bg-emerald-400",
  };
}

function ApprovalsList(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [rows, setRows] = useState<WorkOrderWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userErr || !user) {
        setErr("You must be signed in to view quote approvals.");
        setLoading(false);
        return;
      }

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle<Pick<Profile, "shop_id">>();

      if (cancelled) return;

      if (profErr) {
        setErr(profErr.message);
        setLoading(false);
        return;
      }

      if (!profile?.shop_id) {
        setErr("No shop is linked to your profile yet.");
        setLoading(false);
        return;
      }

      setShopId(profile.shop_id);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const load = async () => {
    if (!shopId) return;

    setLoading(true);
    setErr(null);

    const { data: wo, error } = await supabase
      .from("work_orders")
      .select(
        `
        *,
        shops(name),
        work_order_lines(id,status,approval_state,labor_time,line_no,description,created_at,updated_at),
        work_order_quote_lines(id,stage)
      `,
      )
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      setRows([]);
      setErr(error.message);
      setLoading(false);
      return;
    }

    const list = (wo ?? []) as unknown as WorkOrderWithMeta[];

    const PENDING_LINE_STATUSES = new Set<string>([
      "waiting_for_approval",
      "awaiting_approval",
    ]);

    const isPendingLine = (
      l: NonNullable<WorkOrderWithMeta["work_order_lines"]>[number],
    ): boolean => {
      const st = safeTrim(l?.status).toLowerCase();
      const ap = safeTrim(l?.approval_state).toLowerCase();
      return PENDING_LINE_STATUSES.has(st) || ap === "pending";
    };

    const filtered = list.filter((w) => {
      const woStatus = safeTrim(w.status).toLowerCase();
      if (woStatus === "awaiting_approval") return true;

      const lines = Array.isArray(w.work_order_lines) ? w.work_order_lines : [];
      return lines.some((l) => isPendingLine(l));
    });

    const next = filtered.map((w) => {
      const lines = Array.isArray(w.work_order_lines) ? w.work_order_lines : [];
      const hours = lines.reduce(
        (sum, l) => sum + (typeof l.labor_time === "number" ? l.labor_time : 0),
        0,
      );

      const qlines = Array.isArray(w.work_order_quote_lines)
        ? w.work_order_quote_lines
        : [];
      const hasQuotes = qlines.length > 0;
      const waitingForParts = !hasQuotes;

      return {
        ...w,
        labor_hours: hours,
        waiting_for_parts: waitingForParts,
      };
    });

    const qlc = q.trim().toLowerCase();

    const searched =
      qlc.length === 0
        ? next
        : next.filter((w) => {
            const cid = String(w.custom_id ?? "").toLowerCase();
            const id = String(w.id ?? "").toLowerCase();
            const shopName = String(w.shops?.name ?? "").toLowerCase();
            const status = String(w.status ?? "").toLowerCase().replaceAll("_", " ");
            const queueState = w.waiting_for_parts ? "waiting for parts" : "quotes ready";

            return (
              cid.includes(qlc) ||
              id.includes(qlc) ||
              shopName.includes(qlc) ||
              status.includes(qlc) ||
              queueState.includes(qlc)
            );
          });

    setRows(searched);
    setLoading(false);
  };

  useEffect(() => {
    if (!shopId) return;

    void load();

    const ch = supabase
      .channel("qr:approvals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_lines" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_quote_lines" },
        () => void load(),
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, shopId, q]);

  const waitingCount = useMemo(
    () => rows.filter((w) => Boolean(w.waiting_for_parts)).length,
    [rows],
  );

  const readyCount = useMemo(
    () => rows.filter((w) => !w.waiting_for_parts).length,
    [rows],
  );

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-56 animate-pulse rounded-[24px] border border-white/10 bg-white/5"
          />
        ))}
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {err}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-[24px] border border-white/10 bg-black/25 p-6 text-sm text-neutral-400">
        No work orders waiting for approval.
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(197,122,74,0.12),rgba(0,0,0,0.92)_38%,rgba(2,6,23,0.98)_100%)] shadow-[0_0_60px_rgba(0,0,0,0.8)]">
        <div className="border-b border-white/8 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                Work Orders
              </div>
              <h1
                className="mt-2 text-3xl text-white"
                style={{ fontFamily: "var(--font-blackops)" }}
              >
                Quote Review
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-neutral-300">
                Review work orders that are waiting for approval, see which ones
                are still waiting on parts, and jump directly into the quote flow.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-semibold text-neutral-200">
                  Total: <span className="text-white">{rows.length}</span>
                </div>
                <div className="rounded-full border border-sky-500/20 bg-sky-500/5 px-3 py-1 text-[11px] font-semibold text-sky-100">
                  Waiting for parts: <span className="text-white">{waitingCount}</span>
                </div>
                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                  Quotes ready: <span className="text-white">{readyCount}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/work-orders/view"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:border-[var(--accent-copper-light)] hover:bg-[var(--accent-copper)]/15"
              >
                Open work orders
              </Link>

              <Link
                href="/billing"
                className="inline-flex items-center justify-center rounded-full border border-[var(--accent-copper-light)]/35 bg-[var(--accent-copper)]/12 px-4 py-2 text-sm font-semibold text-[var(--accent-copper-light)] transition hover:bg-[var(--accent-copper)]/20"
              >
                Billing
              </Link>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex-1">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void load()}
                placeholder="Search work order, shop, status, or queue state..."
                className={INPUT_DARK}
              />
            </div>

            <div className="flex gap-3 lg:w-auto">
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-[var(--accent-copper-light)] hover:bg-[var(--accent-copper)]/10"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((w) => {
          const quoteHref = `/quote-review/${w.id}`;
          const woHref = `/work-orders/${w.id}`;
          const accent = queueAccent(Boolean(w.waiting_for_parts));
          const progressValue = w.waiting_for_parts ? 45 : 78;
          const decisionEvents = deriveEventsFromQuote({
            workOrder: w,
            lines: w.work_order_lines ?? [],
            actorLabel: "Service advisor",
          });

          return (
            <div
              key={w.id}
              className={[
                "overflow-hidden rounded-[24px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] shadow-[0_0_40px_rgba(0,0,0,0.55)]",
                accent.border,
              ].join(" ")}
            >
              <div className="border-b border-white/8 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-2xl font-semibold text-white">
                        {w.custom_id ? w.custom_id : `#${w.id.slice(0, 8)}`}
                      </div>

                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${accent.badge}`}
                      >
                        {w.waiting_for_parts ? "Waiting for parts" : "Quotes ready"}
                      </span>
                      <StatusBadge variant={formatDecisionStatus({ workStatus: w.status }).variant}>
                        {formatDecisionStatus({ workStatus: w.status }).label}
                      </StatusBadge>
                    </div>

                    <div className="mt-3 text-base font-semibold text-white">
                      {w.shops?.name || "Shop"}
                    </div>
                    <div className="mt-1 text-sm text-neutral-300">
                      {formatDecisionStatus({ workStatus: w.status }).label}
                      {typeof w.labor_hours === "number"
                        ? ` • ${w.labor_hours.toFixed(1)}h`
                        : ""}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                      Created
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {w.created_at ? new Date(w.created_at).toLocaleDateString() : "—"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-4 py-4">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                  <span>Approval progress</span>
                  <span>{progressValue}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${accent.progress}`}
                    style={{ width: `${progressValue}%` }}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                      Work order
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {w.custom_id ? `#${w.custom_id}` : `#${w.id.slice(0, 8)}`}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                      Labor hours
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {typeof w.labor_hours === "number" ? `${w.labor_hours.toFixed(1)}h` : "—"}
                    </div>
                  </div>
                </div>
                <DecisionEventFeed events={decisionEvents} compact className="mt-4" maxVisible={5} />

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={quoteHref}
                    prefetch={false}
                    className="rounded-full border border-[color:var(--copper)]/70 bg-[color:var(--copper)]/10 px-3 py-1.5 text-sm font-semibold text-[color:var(--copper)] transition hover:bg-[color:var(--copper)]/15"
                    style={{ ["--copper" as never]: COPPER }}
                  >
                    Review
                  </Link>

                  <Link
                    href={woHref}
                    prefetch={false}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-semibold text-neutral-100 transition hover:border-[var(--accent-copper-light)] hover:bg-[var(--accent-copper)]/15"
                  >
                    Open WO
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </section>
  );
}

export default function QuoteReviewIndexPage(): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const woId = params.get("woId");

  useEffect(() => {
    if (woId) router.replace(`/quote-review/${woId}`);
  }, [woId, router]);

  return (
    <div
      className="
        min-h-screen px-4 py-6 text-foreground
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]
      "
      style={{ ["--copper" as never]: COPPER }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-4">
          <button
            onClick={() => router.back()}
            className="text-sm text-[color:var(--copper)] hover:underline"
          >
            ← Back
          </button>
        </div>

        <ApprovalsList />
      </div>
    </div>
  );
}

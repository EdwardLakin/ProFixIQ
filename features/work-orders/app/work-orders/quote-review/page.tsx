// app/work-orders/quote-review/page.tsx (FULL FILE REPLACEMENT)
// Advisor-facing: list of WOs needing approval.
// Opens the editable detail view at: /quote-review/[id]
// Theme: metal card, thin borders/dividers, copper accents

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];
type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

type WorkOrderWithMeta = WorkOrder & {
  shops?: Pick<Shop, "name"> | null;
  work_order_lines?: Array<
    Pick<Line, "id" | "status" | "approval_state" | "labor_time">
  >;
  work_order_quote_lines?: Array<Pick<QuoteLine, "id" | "stage">>;
  labor_hours?: number | null;
  waiting_for_parts?: boolean;
};

const COPPER = "#C57A4A";

const card =
  "rounded-2xl border border-white/10 bg-black/40 shadow-[0_24px_70px_rgba(0,0,0,0.65)]";
const divider = "border-white/10";

function safeTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function statusLabel(s: string | null | undefined): string {
  return (s ?? "").replaceAll("_", " ").trim() || "—";
}

function ApprovalsList(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [rows, setRows] = useState<WorkOrderWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

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
        work_order_lines(id,status,approval_state,labor_time),
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

    setRows(next);
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
  }, [supabase, shopId]);

  if (loading) {
    return (
      <div className="mt-6 text-sm text-neutral-300">
        Loading…
      </div>
    );
  }

  if (err) {
    return (
      <div className="mt-6 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {err}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="mt-6 text-sm text-neutral-400">
        No work orders waiting for approval.
      </div>
    );
  }

  return (
    <div className={`${card} mt-4`}>
      <div className={`border-b ${divider} px-5 py-3`}>
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-300">
          Awaiting Approval
        </div>
        <div className="mt-1 text-xs text-neutral-500">
          {rows.length} work orders
        </div>
      </div>

      <div className="divide-y divide-white/10">
        {rows.map((w) => {
          const quoteHref = `/quote-review/${w.id}`;
          const woHref = `/work-orders/${w.id}`;

          const pill = w.waiting_for_parts
            ? "border-sky-400/25 bg-sky-400/10 text-sky-200"
            : "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";

          return (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-sm font-semibold text-white">
                    {w.custom_id ? `#${w.custom_id}` : `#${w.id.slice(0, 8)}`}
                  </div>

                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pill}`}
                  >
                    {w.waiting_for_parts ? "Waiting for parts" : "Quotes ready"}
                  </span>
                </div>

                <div className="mt-1 text-xs text-neutral-500">
                  {w.shops?.name ? `${w.shops.name} • ` : ""}
                  {statusLabel(w.status)}
                  {typeof w.labor_hours === "number"
                    ? ` • ${w.labor_hours.toFixed(1)}h`
                    : ""}
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <Link href={quoteHref} prefetch={false}>
                  <button
                    type="button"
                    onClickCapture={(e) => e.stopPropagation()}
                    className="
                      rounded-full border border-[color:var(--copper)]/70 bg-[color:var(--copper)]/10
                      px-4 py-2 text-sm font-semibold text-[color:var(--copper)]
                      hover:bg-[color:var(--copper)]/15
                    "
                    style={{ ["--copper" as never]: COPPER }}
                    title={quoteHref}
                  >
                    Review
                  </button>
                </Link>

                <Link href={woHref} prefetch={false}>
                  <button
                    type="button"
                    onClickCapture={(e) => e.stopPropagation()}
                    className="
                      rounded-full border border-white/10 bg-black/50
                      px-4 py-2 text-sm font-semibold text-neutral-200
                      hover:bg-black/65
                    "
                    title={woHref}
                  >
                    Open WO
                  </button>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
      <div className="mx-auto max-w-5xl">
        <div className="mb-4">
          <button
            onClick={() => router.back()}
            className="text-sm text-[color:var(--copper)] hover:underline"
          >
            ← Back
          </button>
        </div>

        <div className={`${card} px-5 py-4`}>
          <div className="text-xs uppercase tracking-[0.25em] text-neutral-400">
            Quote Review
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Approvals</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Work orders waiting for advisor + customer approval
          </p>
        </div>

        <ApprovalsList />
      </div>
    </div>
  );
}
// app/work-orders/quote-review/page.tsx (FULL FILE REPLACEMENT)
// Advisor-facing: list of WOs needing approval.
// Opens the editable detail view at: /work-orders/quote-review/[id]

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
  work_order_lines?: Array<Pick<Line, "id" | "status" | "approval_state" | "labor_time">>;
  work_order_quote_lines?: Array<Pick<QuoteLine, "id" | "stage">>;
  labor_hours?: number | null;
  waiting_for_parts?: boolean;
};

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

    const PENDING_LINE_STATUSES = new Set<string>(["waiting_for_approval", "awaiting_approval"]);
    const isPendingLine = (l: NonNullable<WorkOrderWithMeta["work_order_lines"]>[number]): boolean => {
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

      const qlines = Array.isArray(w.work_order_quote_lines) ? w.work_order_quote_lines : [];
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
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "work_order_lines" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "work_order_quote_lines" }, () => void load())
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

  if (loading) return <div className="mt-6 text-muted-foreground">Loading…</div>;
  if (err) return <div className="mt-6 text-destructive">{err}</div>;

  if (rows.length === 0) {
    return <div className="mt-6 text-muted-foreground">No work orders waiting for approval.</div>;
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2 font-semibold">Awaiting Approval</div>

      <div className="divide-y divide-border">
        {rows.map((w) => {
          const quoteHref = `/work-orders/quote-review/${w.id}`;
          const woHref = `/work-orders/${w.id}`;

          return (
            <div key={w.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate font-medium">
                    {w.custom_id ? `#${w.custom_id}` : `#${w.id.slice(0, 8)}`}
                  </div>

                  {w.waiting_for_parts ? (
                    <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200">
                      Waiting for parts
                    </span>
                  ) : (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                      Quotes ready
                    </span>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  {w.shops?.name ? `${w.shops.name} • ` : ""}
                  {statusLabel(w.status)}
                  {typeof w.labor_hours === "number" ? ` • ${w.labor_hours.toFixed(1)}h` : ""}
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <Link href={quoteHref} prefetch={false}>
                  <button
                    type="button"
                    onClickCapture={(e) => e.stopPropagation()}
                    className="rounded border border-orange-500 px-3 py-1 text-sm text-orange-500 hover:bg-orange-500/10"
                    title={quoteHref}
                  >
                    Review (Advisor)
                  </button>
                </Link>

                <Link href={woHref} prefetch={false}>
                  <button
                    type="button"
                    onClickCapture={(e) => e.stopPropagation()}
                    className="rounded border border-border px-3 py-1 text-sm hover:bg-muted"
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

  // Back-compat: if old links still send ?woId=..., route to the new detail page.
  useEffect(() => {
    if (woId) router.replace(`/work-orders/quote-review/${woId}`);
  }, [woId, router]);

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4">
          <button onClick={() => router.back()} className="text-sm text-orange-500 hover:underline">
            ← Back
          </button>
        </div>

        <h1 className="text-2xl font-semibold">Quote Review</h1>
        <p className="mt-1 text-muted-foreground">Work orders waiting for advisor + customer approval</p>

        <ApprovalsList />
      </div>
    </div>
  );
}
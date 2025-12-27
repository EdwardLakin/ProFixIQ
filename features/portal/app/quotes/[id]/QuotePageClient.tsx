"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Link from "next/link";

import type { Database } from "@shared/types/types/supabase";
import QuoteApprovalActions from "@/features/portal/components/QuoteApprovalActions";

const COPPER = "#C57A4A";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];

type QuoteLineRow = Pick<
  WorkOrderLineRow,
  "id" | "description" | "job_type" | "labor_time" | "price_estimate" | "line_no"
>;

type ParamsShape = Record<string, string | string[] | undefined>;

function paramToString(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function QuotePageClient() {
  const router = useRouter();
  const params = useParams();

  const workOrderId = useMemo(
    () => paramToString((params as ParamsShape).id),
    [params],
  );

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [workOrder, setWorkOrder] = useState<WorkOrderRow | null>(null);
  const [quoteLines, setQuoteLines] = useState<QuoteLineRow[]>([]);

  // Load quote data on mount
  useEffect(() => {
    if (!workOrderId) {
      router.replace("/portal");
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);

      // 1) Authed user
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userErr || !user) {
        router.replace("/portal/auth/sign-in");
        return;
      }

      // 2) Customer for this user
      const { data: customer, error: custErr } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (custErr || !customer) {
        router.replace("/portal");
        return;
      }

      // 3) Work order owned by this customer
      const { data: wo, error: woErr } = await supabase
        .from("work_orders")
        .select("*")
        .eq("id", workOrderId)
        .eq("customer_id", customer.id)
        .maybeSingle();

      if (cancelled) return;

      if (woErr || !wo) {
        router.replace("/portal");
        return;
      }

      setWorkOrder(wo as WorkOrderRow);

      // 4) Quote line items
      const { data: lineRows } = await supabase
        .from("work_order_lines")
        .select(
          "id, description, job_type, labor_time, price_estimate, line_no",
        )
        .eq("work_order_id", workOrderId)
        .order("line_no", { ascending: true });

      if (cancelled) return;

      const mapped: QuoteLineRow[] =
        lineRows?.map((line) => ({
          id: line.id,
          description: line.description,
          job_type: line.job_type,
          labor_time: line.labor_time,
          price_estimate: line.price_estimate,
          line_no: line.line_no,
        })) ?? [];

      setQuoteLines(mapped);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, router, workOrderId]);

  if (!workOrderId) {
    return (
      <div className="min-h-screen px-4 py-10 text-center text-red-300">
        Missing quote id.
      </div>
    );
  }

  if (loading || !workOrder) {
    return (
      <div className="min-h-screen px-4 py-10 flex items-center justify-center text-neutral-300">
        Loading quote…
      </div>
    );
  }

  const titleLabel =
    workOrder.custom_id || `Work Order ${workOrder.id.slice(0, 8)}…`;

  const quoteTotalNumber = quoteLines.reduce<number>((sum, line) => {
    const price = line.price_estimate;
    return sum + (price == null ? 0 : Number(price));
  }, 0);

  const quoteTotal = quoteTotalNumber > 0 ? quoteTotalNumber : null;

  const approvalState = (workOrder.approval_state ?? "pending") as
    | "pending"
    | "approved"
    | "declined";

  const approvalLabel =
    approvalState.charAt(0).toUpperCase() + approvalState.slice(1);

  return (
    <div
      className="
        min-h-screen px-4 text-foreground
        bg-background
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]
      "
    >
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center py-10">
        <div
          className="
            w-full rounded-3xl border
            border-[color:var(--metal-border-soft,#1f2937)]
            bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_82%)]
            shadow-[0_32px_80px_rgba(0,0,0,0.95)]
            px-6 py-7 sm:px-8 sm:py-9
          "
        >
          {/* Top bar: back + pill */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <Link
              href="/portal"
              className="
                inline-flex items-center gap-2 rounded-full border
                border-[color:var(--metal-border-soft,#1f2937)]
                bg-black/60 px-3 py-1.5 text-[11px]
                uppercase tracking-[0.2em] text-neutral-200
                hover:bg-black/70 hover:text-white
              "
            >
              <span aria-hidden className="text-base leading-none">←</span>
              Back
            </Link>

            <div
              className="
                inline-flex items-center gap-1 rounded-full border
                border-[color:var(--metal-border-soft,#1f2937)]
                bg-black/70 px-3 py-1 text-[11px]
                uppercase tracking-[0.22em]
                text-neutral-300
              "
              style={{ color: COPPER }}
            >
              Quote
            </div>
          </div>

          {/* Header */}
          <div className="mb-6 space-y-1">
            <h1
              className="text-2xl sm:text-3xl font-semibold text-white"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              {titleLabel}
            </h1>
            <p className="text-xs text-neutral-400 sm:text-sm">
              Review your inspection summary and quote for this work order.
            </p>
          </div>

          {/* Summary row */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Quote Total
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                {formatCurrency(quoteTotal)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Status
              </div>
              <div className="mt-1 text-sm font-semibold text-neutral-100">
                {workOrder.status ?? "—"}
              </div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                Approval: {approvalLabel}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Requested
              </div>
              <div className="mt-1 text-sm font-semibold text-neutral-100">
                {formatDate(workOrder.created_at)}
              </div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                Last updated: {formatDate(workOrder.updated_at)}
              </div>
            </div>
          </div>

          {/* Line items */}
          <div
            className="
              rounded-2xl border border-white/10 bg-black/40
              px-4 py-4 sm:px-5 sm:py-5
            "
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
                Line Items
              </div>
              <div className="text-[11px] text-neutral-500">
                {quoteLines.length === 0
                  ? "No line items recorded yet"
                  : `${quoteLines.length} items`}
              </div>
            </div>

            {quoteLines.length > 0 ? (
              <div className="space-y-2">
                {quoteLines.map((line) => (
                  <div
                    key={line.id}
                    className="
                      flex flex-wrap items-baseline justify-between gap-2
                      rounded-xl border border-white/5 bg-black/40 px-3 py-2
                    "
                  >
                    <div>
                      <div className="text-sm font-medium text-neutral-100">
                        {line.description || "Line item"}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {line.job_type ?? "—"}
                        {line.labor_time != null
                          ? ` • ${line.labor_time} hr`
                          : ""}
                      </div>
                    </div>
                    <div className="text-right text-xs text-neutral-300">
                      <div className="text-sm font-semibold">
                        {formatCurrency(line.price_estimate)}
                      </div>
                      {line.line_no != null ? (
                        <div className="text-[11px] text-neutral-500">
                          Line #{line.line_no}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-neutral-400">
                Once your shop prepares the quote, you&apos;ll see a breakdown
                of the recommended work and estimated costs here.
              </div>
            )}
          </div>

          {/* Approval actions */}
          <div className="mt-6">
            <QuoteApprovalActions
              workOrderId={workOrderId}
              initialApprovalState={approvalState}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
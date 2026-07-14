// app/dashboard/owner/payments/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type DB = Database;

type ProfileScope = {
  id: string;
  role: string | null;
  shop_id: string | null;
};

type PaymentRow = DB["public"]["Tables"]["payments"]["Row"];

function fmtMoney(cents: number | null, currency: string | null): string {
  const c = typeof cents === "number" ? cents : 0;
  const cur = String(currency ?? "usd").toUpperCase();
  const amt = (c / 100).toFixed(2);
  return `${cur} ${amt}`;
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

function calcNet(amountCents: number | null, feeCents: number | null): number {
  const a = typeof amountCents === "number" ? amountCents : 0;
  const f = typeof feeCents === "number" ? feeCents : 0;
  return Math.max(0, a - f);
}

export default function OwnerPaymentsPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState<string | null>(null);

  const [shopId, setShopId] = useState<string | null>(null);
  const [rows, setRows] = useState<PaymentRow[]>([]);

  // UI filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "succeeded" | "pending" | "failed" | "refunded">("all");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setForbidden(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const uid = session?.user?.id ?? null;
      if (!uid) {
        if (!cancelled) {
          setForbidden("Not signed in.");
          setLoading(false);
        }
        return;
      }

      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("id, role, shop_id")
        .eq("id", uid)
        .maybeSingle<ProfileScope>();

      if (meErr) {
        if (!cancelled) {
          setForbidden(meErr.message);
          setLoading(false);
        }
        return;
      }

      const sId = me?.shop_id ?? null;
      const actor = getActorCapabilities({ role: me?.role });

      if (!sId || !actor.canManageBilling) {
        if (!cancelled) {
          setForbidden("Forbidden.");
          setLoading(false);
        }
        return;
      }

      if (!cancelled) setShopId(sId);

      const { data: payments, error: pErr } = await supabase
        .from("payments")
        .select(
          "id, shop_id, work_order_id, stripe_payment_intent_id, stripe_checkout_session_id, amount_cents, currency, platform_fee_cents, status, created_at",
        )
        .eq("shop_id", sId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (pErr) {
        if (!cancelled) {
          setForbidden(pErr.message);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setRows((payments ?? []) as PaymentRow[]);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && String(r.status ?? "").toLowerCase() !== status) return false;

      if (!needle) return true;

      const w = String(r.work_order_id ?? "").toLowerCase();
      const pi = String(r.stripe_payment_intent_id ?? "").toLowerCase();
      const cs = String(r.stripe_checkout_session_id ?? "").toLowerCase();
      return w.includes(needle) || pi.includes(needle) || cs.includes(needle);
    });
  }, [rows, q, status]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)]">
          Loading payments…
        </div>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)]">
          {forbidden}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-[var(--theme-gradient-panel)] px-4 py-4 shadow-[var(--theme-shadow-medium)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-blackops text-[0.75rem] tracking-[0.22em] text-[color:var(--theme-text-primary)]">
              PAYMENTS
            </div>
            <div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              Customer payments collected through Stripe Connect • Platform fee applied automatically (3%).
            </div>
            {shopId ? (
              <div className="mt-1 text-[0.7rem] text-[color:var(--theme-text-muted)]">Shop: {shopId}</div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search WO / payment_intent / session…"
              className="h-9 w-full sm:w-72 rounded-xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none:border-[var(--accent-copper-soft)]"
            />

            <select
              value={status}
              onChange={(e) =>
                setStatus(
                  (String(e.target.value) as typeof status) ?? "all",
                )
              }
              className="h-9 rounded-xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm text-[color:var(--theme-text-primary)] outline-none focus:border-[var(--accent-copper-soft)]"
            >
              <option value="all">All statuses</option>
              <option value="succeeded">Succeeded</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)]">
        <div className="border-b border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2 text-[0.7rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
          Recent payments
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--theme-surface-inset)] text-[0.7rem] uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Work Order</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Platform Fee</th>
                <th className="px-4 py-3 text-left">Net to Shop</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Stripe IDs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--metal-border-soft)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-[color:var(--theme-text-secondary)]">
                    No payments found.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const amt = fmtMoney(p.amount_cents, p.currency);
                  const fee = fmtMoney(p.platform_fee_cents, p.currency);
                  const net = fmtMoney(
                    calcNet(p.amount_cents, p.platform_fee_cents),
                    p.currency,
                  );

                  const woId = p.work_order_id ? String(p.work_order_id) : "";

                  return (
                    <tr key={String(p.id)} className="hover:bg-[color:var(--theme-surface-subtle)]">
                      <td className="px-4 py-3 text-[color:var(--theme-text-primary)]">
                        {fmtDate(p.created_at)}
                      </td>

                      <td className="px-4 py-3">
                        {woId ? (
                          <Link
                            href={`/work-orders/${woId}`}
                            className="text-[var(--accent-copper-soft)] hover:text-[var(--accent-copper-light)] underline underline-offset-4"
                          >
                            {woId.slice(0, 8)}…
                          </Link>
                        ) : (
                          <span className="text-[color:var(--theme-text-muted)]">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-[color:var(--theme-text-primary)]">{amt}</td>
                      <td className="px-4 py-3 text-[color:var(--theme-text-primary)]">{fee}</td>
                      <td className="px-4 py-3 text-[color:var(--theme-text-primary)]">{net}</td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-[0.7rem] tracking-[0.12em] text-[color:var(--theme-text-primary)]">
                          {String(p.status ?? "unknown").toUpperCase()}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-[0.75rem] text-[color:var(--theme-text-secondary)]">
                        <div className="space-y-1">
                          <div>
                            <span className="text-[color:var(--theme-text-muted)]">pi:</span>{" "}
                            <span className="font-mono">{String(p.stripe_payment_intent_id ?? "—")}</span>
                          </div>
                          <div>
                            <span className="text-[color:var(--theme-text-muted)]">cs:</span>{" "}
                            <span className="font-mono">{String(p.stripe_checkout_session_id ?? "—")}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2 text-[0.7rem] text-[color:var(--theme-text-muted)]">
          Showing {filtered.length} of {rows.length} (latest 200)
        </div>
      </div>
    </div>
  );
}

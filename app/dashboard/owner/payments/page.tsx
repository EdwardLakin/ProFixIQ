// app/dashboard/owner/payments/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type ProfileScope = {
  id: string;
  role: string | null;
  shop_id: string | null;
};

type PaymentRow = DB["public"]["Tables"]["payments"]["Row"];

const ADMIN_ROLES = new Set(["owner", "admin", "manager"]);

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
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

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

      const role = String(me?.role ?? "").toLowerCase();
      const sId = me?.shop_id ?? null;

      if (!sId || !ADMIN_ROLES.has(role)) {
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
        <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-black/40 px-4 py-3 text-sm text-neutral-300">
          Loading payments…
        </div>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-black/40 px-4 py-3 text-sm text-neutral-300">
          {forbidden}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-[radial-gradient(circle_at_top,_#050910,_#020308_60%,_#000)] px-4 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.75)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-blackops text-[0.75rem] tracking-[0.22em] text-neutral-200">
              PAYMENTS
            </div>
            <div className="mt-1 text-sm text-neutral-400">
              Customer payments collected through Stripe Connect • Platform fee applied automatically (3%).
            </div>
            {shopId ? (
              <div className="mt-1 text-[0.7rem] text-neutral-500">Shop: {shopId}</div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search WO / payment_intent / session…"
              className="h-9 w-full sm:w-72 rounded-xl border border-[var(--metal-border-soft)] bg-black/40 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none:border-[var(--accent-copper-soft)]"
            />

            <select
              value={status}
              onChange={(e) =>
                setStatus(
                  (String(e.target.value) as typeof status) ?? "all",
                )
              }
              className="h-9 rounded-xl border border-[var(--metal-border-soft)] bg-black/40 px-3 text-sm text-neutral-100 outline-none focus:border-[var(--accent-copper-soft)]"
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
      <div className="overflow-hidden rounded-2xl border border-[var(--metal-border-soft)] bg-black/35">
        <div className="border-b border-[var(--metal-border-soft)] bg-black/40 px-4 py-2 text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
          Recent payments
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/30 text-[0.7rem] uppercase tracking-[0.14em] text-neutral-400">
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
                  <td colSpan={7} className="px-4 py-6 text-neutral-400">
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
                    <tr key={String(p.id)} className="hover:bg-white/5">
                      <td className="px-4 py-3 text-neutral-200">
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
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-neutral-200">{amt}</td>
                      <td className="px-4 py-3 text-neutral-200">{fee}</td>
                      <td className="px-4 py-3 text-neutral-200">{net}</td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full border border-[var(--metal-border-soft)] bg-black/40 px-2 py-1 text-[0.7rem] tracking-[0.12em] text-neutral-200">
                          {String(p.status ?? "unknown").toUpperCase()}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-[0.75rem] text-neutral-300">
                        <div className="space-y-1">
                          <div>
                            <span className="text-neutral-500">pi:</span>{" "}
                            <span className="font-mono">{String(p.stripe_payment_intent_id ?? "—")}</span>
                          </div>
                          <div>
                            <span className="text-neutral-500">cs:</span>{" "}
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

        <div className="border-t border-[var(--metal-border-soft)] bg-black/40 px-4 py-2 text-[0.7rem] text-neutral-500">
          Showing {filtered.length} of {rows.length} (latest 200)
        </div>
      </div>
    </div>
  );
}
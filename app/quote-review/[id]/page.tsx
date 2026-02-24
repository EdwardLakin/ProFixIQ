// /app/quote-review/[id]/page.tsx (FULL FILE REPLACEMENT)
// Advisor-facing: fully itemized + editable quote editor for a single WO.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";
import AddJobModal from "@/features/work-orders/components/workorders/AddJobModal";
import { formatCurrency } from "@/features/shared/lib/formatCurrency";
import {
  calculateTax,
  getTaxAmount,
  isProvinceCode,
  type ProvinceCode,
} from "@/features/integrations/tax";

type DB = Database;

type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type LineUpdate = DB["public"]["Tables"]["work_order_lines"]["Update"];

type Allocation = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type AllocationUpdate =
  DB["public"]["Tables"]["work_order_part_allocations"]["Update"];

type Part = DB["public"]["Tables"]["parts"]["Row"];

type AllocationWithPart = Allocation & {
  parts?: Pick<Part, "name" | "sku"> | null;
};

const COPPER = "#C57A4A";

function safeTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function statusLabel(s: string | null | undefined): string {
  return (s ?? "").replaceAll("_", " ").trim() || "—";
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fmt(n: number): string {
  try {
    return formatCurrency(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function customerDisplayName(c: Customer | null): string {
  if (!c) return "—";
  const full = safeTrim((c as unknown as { full_name?: unknown }).full_name);
  const first = safeTrim(c.first_name);
  const last = safeTrim(c.last_name);
  return full || [first, last].filter(Boolean).join(" ") || "—";
}

function normalizePhoneForTel(raw: string): string | null {
  const s = safeTrim(raw);
  if (!s) return null;
  // Keep + and digits only
  const cleaned = s.replace(/[^\d+]/g, "");
  // If it has no digits, ignore
  if (!/\d/.test(cleaned)) return null;
  return cleaned;
}

type EditableLine = Line & { _dirty?: boolean };
type EditableAlloc = AllocationWithPart & { _dirty?: boolean };

const card =
  "rounded-2xl border border-white/10 bg-black/40 shadow-[0_24px_70px_rgba(0,0,0,0.65)]";
const divider = "border-white/10";
const inputBase =
  "mt-1 w-full rounded-lg border border-white/10 bg-black/60 px-2.5 py-2 text-sm text-white placeholder:text-neutral-500 outline-none";
const inputFocus =
  "focus:border-[color:var(--copper,#C57A4A)]/60 focus:ring-2 focus:ring-[color:var(--copper,#C57A4A)]/15";
const inputCls = `${inputBase} ${inputFocus}`;

export default function AdvisorQuoteReviewDetailPage(): JSX.Element {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const woId = String(params?.id ?? "").trim();

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [lines, setLines] = useState<EditableLine[]>([]);
  const [allocs, setAllocs] = useState<EditableAlloc[]>([]);

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const [addJobOpen, setAddJobOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("system");

  function openAddJobWithPrefill(prefill: {
    jobName?: string | null;
    notes?: string | null;
    laborHours?: number | null;
    partsPaste?: string | null;
    parts?: Array<{ name: string; qty?: number | null }> | null;
  }) {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("addJobModal:prefill", JSON.stringify(prefill));
    }
    setAddJobOpen(true);
  }

  const reload = useCallback(async () => {
    if (!woId) return;

    setLoading(true);

    const { data: woRow, error: woErr } = await supabase
      .from("work_orders")
      .select("*")
      .eq("id", woId)
      .maybeSingle();

    if (woErr) {
      toast.error(woErr.message);
      setWo(null);
      setShop(null);
      setCustomer(null);
      setLines([]);
      setAllocs([]);
      setLoading(false);
      return;
    }

    setWo(woRow ?? null);

    // shop
    if (woRow?.shop_id) {
      const { data: shopRow, error: shopErr } = await supabase
        .from("shops")
        .select("*")
        .eq("id", woRow.shop_id)
        .maybeSingle();
      if (shopErr) toast.error(shopErr.message);
      setShop(shopRow ?? null);
    } else {
      setShop(null);
    }

    // customer (for header contact block)
    if (woRow?.customer_id) {
      const { data: custRow, error: custErr } = await supabase
        .from("customers")
        .select("*")
        .eq("id", woRow.customer_id)
        .maybeSingle();
      if (custErr) {
        toast.error(custErr.message);
        setCustomer(null);
      } else {
        setCustomer((custRow as Customer | null) ?? null);
      }
    } else {
      setCustomer(null);
    }

    // lines
    const { data: lineRows, error: lineErr } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", woId)
      .order("created_at", { ascending: true });

    if (lineErr) {
      toast.error(lineErr.message);
      setLines([]);
    } else {
      setLines((lineRows ?? []).map((l) => ({ ...l, _dirty: false })));
    }

    // allocations
    const { data: aRows, error: aErr } = await supabase
      .from("work_order_part_allocations")
      .select("*, parts(name, sku)")
      .eq("work_order_id", woId)
      .order("created_at", { ascending: true });

    if (aErr) {
      toast.error(aErr.message);
      setAllocs([]);
    } else {
      const cast = (aRows ?? []) as unknown as AllocationWithPart[];
      setAllocs(cast.map((a) => ({ ...a, _dirty: false })));
    }

    setLoading(false);
  }, [supabase, woId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let alive = true;

    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error) {
        setCurrentUserId("system");
        return;
      }

      setCurrentUserId(data.user?.id ?? "system");
    }

    void loadUser();

    return () => {
      alive = false;
    };
  }, [supabase]);

  const laborRate = useMemo(() => {
    const candidate = (shop as unknown as { labor_rate?: unknown } | null)
      ?.labor_rate;
    const n = asNumber(candidate);
    return n ?? 120;
  }, [shop]);

  const provinceCode = useMemo<ProvinceCode | null>(() => {
    const s = shop as unknown as {
      province_code?: unknown;
      province?: unknown;
    } | null;
    const raw = safeTrim(s?.province_code ?? s?.province ?? "").toUpperCase();
    if (!raw) return null;
    return isProvinceCode(raw) ? raw : null;
  }, [shop]);

  const lineAllocs = useMemo(() => {
    const map = new Map<string, EditableAlloc[]>();
    for (const a of allocs) {
      const k = String(a.work_order_line_id ?? "");
      if (!k) continue;
      const arr = map.get(k) ?? [];
      arr.push(a);
      map.set(k, arr);
    }
    return map;
  }, [allocs]);

  const totals = useMemo(() => {
    const laborTotal = lines.reduce((sum, l) => {
      const hrs = typeof l.labor_time === "number" ? l.labor_time : 0;
      return sum + hrs * laborRate;
    }, 0);

    const partsTotal = allocs.reduce((sum, a) => {
      const qty = typeof a.qty === "number" ? a.qty : Number(a.qty);
      const unit =
        typeof a.unit_cost === "number" ? a.unit_cost : Number(a.unit_cost);
      const q = Number.isFinite(qty) ? qty : 0;
      const u = Number.isFinite(unit) ? unit : 0;
      return sum + q * u;
    }, 0);

    const subtotal = laborTotal + partsTotal;
    const taxResult = provinceCode ? calculateTax(subtotal, provinceCode) : null;
    const tax = taxResult ? getTaxAmount(taxResult) : 0;
    const total = subtotal + tax;

    return { laborTotal, partsTotal, subtotal, tax, total };
  }, [allocs, laborRate, lines, provinceCode]);

  const setLineField = useCallback((lineId: string, patch: Partial<Line>) => {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId ? ({ ...l, ...patch, _dirty: true } as EditableLine) : l,
      ),
    );
  }, []);

  const setAllocField = useCallback(
    (allocId: string, patch: Partial<EditableAlloc>) => {
      setAllocs((prev) =>
        prev.map((a) =>
          a.id === allocId
            ? ({ ...a, ...patch, _dirty: true } as EditableAlloc)
            : a,
        ),
      );
    },
    [],
  );

  async function saveAllDirty() {
    if (!woId) return;
    if (saving) return;

    const dirtyLines = lines.filter((l) => l._dirty);
    const dirtyAllocs = allocs.filter((a) => a._dirty);

    if (dirtyLines.length === 0 && dirtyAllocs.length === 0) {
      toast.message("No changes to save.");
      return;
    }

    setSaving(true);
    try {
      for (const l of dirtyLines) {
        const patch: LineUpdate = {
          description: l.description,
          complaint: l.complaint,
          cause: l.cause,
          correction: l.correction,
          tools: l.tools,
          notes: l.notes,
          labor_time: l.labor_time,
        };

        const { error } = await supabase
          .from("work_order_lines")
          .update(patch)
          .eq("id", l.id);
        if (error) throw error;
      }

      for (const a of dirtyAllocs) {
        const patch: AllocationUpdate = {
          qty: a.qty,
          unit_cost: a.unit_cost,
          location_id: a.location_id,
        };

        const { error } = await supabase
          .from("work_order_part_allocations")
          .update(patch)
          .eq("id", a.id);
        if (error) throw error;
      }

      toast.success("Saved.");
      await reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save changes.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function setDecision(
    lineId: string,
    decision: "approve" | "decline" | "defer",
  ) {
    const patch: LineUpdate =
      decision === "approve"
        ? { approval_state: "approved", status: "queued" }
        : decision === "decline"
          ? { approval_state: "declined", status: "declined" }
          : { approval_state: null, status: "awaiting_approval" };

    const { error } = await supabase
      .from("work_order_lines")
      .update(patch)
      .eq("id", lineId);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(
      decision === "approve"
        ? "Line approved"
        : decision === "decline"
          ? "Line declined"
          : "Line deferred",
    );
    await reload();
  }

  async function sendQuoteToCustomer() {
    if (!woId) return;
    if (sending) return;

    setSending(true);
    try {
      // Save pending edits first so the customer sees the latest
      await saveAllDirty();

      const res = await fetch(`/api/work-orders/${woId}/send-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const json: { ok?: boolean; error?: string } = await res.json();

      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Failed to send quote.");
        return;
      }

      toast.success("Quote sent to customer (email + portal notification).");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send quote.");
    } finally {
      setSending(false);
    }
  }

  if (!woId) return <div className="p-6 text-red-300">Missing work order id.</div>;
  if (loading) return <div className="p-6 text-neutral-300">Loading…</div>;
  if (!wo) return <div className="p-6 text-red-300">Work order not found.</div>;

  const phoneRaw = safeTrim(customer?.phone ?? "");
  const emailRaw = safeTrim(customer?.email ?? "");
  const tel = normalizePhoneForTel(phoneRaw);

  return (
    <div
      className="
        min-h-screen px-4 py-6 text-foreground
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]
      "
      style={{ ["--copper" as never]: COPPER }}
    >
      <div className="mx-auto max-w-6xl">
        {/* top row */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => router.back()}
            className="text-sm text-[color:var(--copper)] hover:underline"
          >
            ← Back
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void sendQuoteToCustomer()}
              disabled={sending}
              className="
                rounded-full border border-white/10 bg-black/50
                px-4 py-2 text-sm font-semibold text-white
                hover:bg-black/65 disabled:opacity-60
              "
              title="Email the quote to the customer and notify their portal"
            >
              {sending ? "Sending…" : "Send Quote"}
            </button>

            <button
              onClick={() => void saveAllDirty()}
              disabled={saving}
              className="
                rounded-full border border-[color:var(--copper)]/70 bg-[color:var(--copper)]/10
                px-4 py-2 text-sm font-semibold text-[color:var(--copper)]
                hover:bg-[color:var(--copper)]/15 disabled:opacity-60
              "
              title="Save all changes"
            >
              {saving ? "Saving…" : "Save"}
            </button>

            <a
              href={`/work-orders/${woId}`}
              className="
                rounded-full border border-white/10 bg-black/40
                px-4 py-2 text-sm font-semibold text-neutral-200
                hover:bg-black/55
              "
              title="Open the work order"
            >
              Open WO
            </a>
          </div>
        </div>

        {/* header card */}
        <div className={`${card} px-5 py-4`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* left */}
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.25em] text-neutral-400">
                Quote Review
              </div>
              <div className="mt-1 text-2xl font-semibold text-white">
                <span className="text-white">#</span>
                <span style={{ color: COPPER }}>
                  {wo.custom_id ? wo.custom_id : wo.id.slice(0, 8)}
                </span>
              </div>
              <div className="mt-1 text-sm text-neutral-400">
                Status: {statusLabel(wo.status)}{" "}
                {shop?.name ? `• ${shop.name}` : ""}
              </div>
            </div>

            {/* middle */}
            <div
              className="
                w-full max-w-xl rounded-2xl border border-white/10 bg-black/35
                px-4 py-3
              "
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
                Customer contact
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div className="min-w-0">
                  <div className="text-[11px] text-neutral-500">Name</div>
                  <div className="truncate text-sm font-semibold text-white">
                    {customerDisplayName(customer)}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="text-[11px] text-neutral-500">Phone</div>
                  {tel ? (
                    <a
                      href={`tel:${tel}`}
                      className="truncate text-sm font-semibold text-[color:var(--copper)] hover:underline"
                      title="Call customer"
                    >
                      {phoneRaw}
                    </a>
                  ) : (
                    <div className="truncate text-sm font-semibold text-white/70">
                      —
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="text-[11px] text-neutral-500">Email</div>
                  {emailRaw ? (
                    <a
                      href={`mailto:${emailRaw}`}
                      className="truncate text-sm font-semibold text-[color:var(--copper)] hover:underline"
                      title="Email customer"
                    >
                      {emailRaw}
                    </a>
                  ) : (
                    <div className="truncate text-sm font-semibold text-white/70">
                      —
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* right */}
            <div className="text-right">
              <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                Labor rate
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                {fmt(laborRate)}/hr
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {/* lines */}
          <div className="lg:col-span-2">
            <div className={card}>
              <div
                className={`border-b ${divider} px-5 py-3 text-sm font-semibold text-neutral-200`}
              >
                Line Items
              </div>

              {lines.length === 0 ? (
                <div className="px-5 py-4 text-sm text-neutral-400">
                  No lines yet.
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {lines.map((l) => {
                    const la = lineAllocs.get(l.id) ?? [];
                    const laborHours =
                      typeof l.labor_time === "number" ? l.labor_time : 0;
                    const laborAmt = laborHours * laborRate;

                    const partsAmt = la.reduce((sum, a) => {
                      const qty = typeof a.qty === "number" ? a.qty : Number(a.qty);
                      const unit =
                        typeof a.unit_cost === "number"
                          ? a.unit_cost
                          : Number(a.unit_cost);
                      const q = Number.isFinite(qty) ? qty : 0;
                      const u = Number.isFinite(unit) ? unit : 0;
                      return sum + q * u;
                    }, 0);

                    const lineTotal = laborAmt + partsAmt;

                    const ap = safeTrim(l.approval_state).toLowerCase();

                    const pillClass =
                      ap === "approved"
                        ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                        : ap === "declined"
                          ? "border-red-400/25 bg-red-400/10 text-red-200"
                          : "border-amber-400/25 bg-amber-400/10 text-amber-200";

                    return (
                      <div key={l.id} className="px-5 py-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-white">
                                Line
                              </div>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pillClass}`}
                                title={`approval_state=${l.approval_state ?? "null"} status=${l.status ?? "null"}`}
                              >
                                {l.approval_state
                                  ? statusLabel(l.approval_state)
                                  : "pending"}{" "}
                                • {statusLabel(l.status)}
                              </span>

                              {l._dirty ? (
                                <span className="text-xs text-[color:var(--copper)]">
                                  Unsaved
                                </span>
                              ) : (
                                <span className="text-xs text-neutral-500">
                                  Saved
                                </span>
                              )}
                            </div>

                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <label className="text-xs text-neutral-400">
                                Description
                                <input
                                  value={l.description ?? ""}
                                  onChange={(e) =>
                                    setLineField(l.id, { description: e.target.value })
                                  }
                                  className={inputCls}
                                  placeholder="Describe the work..."
                                />
                              </label>

                              <label className="text-xs text-neutral-400">
                                Complaint
                                <input
                                  value={l.complaint ?? ""}
                                  onChange={(e) =>
                                    setLineField(l.id, { complaint: e.target.value })
                                  }
                                  className={inputCls}
                                  placeholder="Customer complaint..."
                                />
                              </label>

                              <label className="text-xs text-neutral-400">
                                Cause
                                <input
                                  value={l.cause ?? ""}
                                  onChange={(e) =>
                                    setLineField(l.id, { cause: e.target.value })
                                  }
                                  className={inputCls}
                                  placeholder="Root cause..."
                                />
                              </label>

                              <label className="text-xs text-neutral-400">
                                Correction
                                <input
                                  value={l.correction ?? ""}
                                  onChange={(e) =>
                                    setLineField(l.id, { correction: e.target.value })
                                  }
                                  className={inputCls}
                                  placeholder="Correction performed..."
                                />
                              </label>

                              <label className="text-xs text-neutral-400">
                                Labor hours
                                <input
                                  inputMode="decimal"
                                  value={
                                    typeof l.labor_time === "number"
                                      ? String(l.labor_time)
                                      : ""
                                  }
                                  onChange={(e) => {
                                    const n = asNumber(e.target.value);
                                    setLineField(l.id, { labor_time: n ?? 0 });
                                  }}
                                  className={inputCls}
                                  placeholder="0.0"
                                />
                              </label>

                              <div className="text-xs text-neutral-400">
                                Line total
                                <div className="mt-2 text-lg font-semibold text-white">
                                  {fmt(lineTotal)}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-col gap-2">
                            <button
                              onClick={() => void setDecision(l.id, "approve")}
                              className="
                                rounded-lg border border-emerald-400/40 bg-emerald-400/10
                                px-4 py-2 text-sm font-semibold text-emerald-200
                                hover:bg-emerald-400/15
                              "
                              disabled={safeTrim(l.status).toLowerCase() === "declined"}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => void setDecision(l.id, "decline")}
                              className="
                                rounded-lg border border-red-400/40 bg-red-400/10
                                px-4 py-2 text-sm font-semibold text-red-200
                                hover:bg-red-400/15
                              "
                              disabled={ap === "declined"}
                            >
                              Decline
                            </button>
                            <button
                              onClick={() => void setDecision(l.id, "defer")}
                              className="
                                rounded-lg border border-amber-400/40 bg-amber-400/10
                                px-4 py-2 text-sm font-semibold text-amber-200
                                hover:bg-amber-400/15
                              "
                            >
                              Defer
                            </button>
                          </div>
                        </div>

                        {/* parts */}
                        <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-4">
                          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
                            Parts
                          </div>

                          {la.length === 0 ? (
                            <div className="text-sm text-neutral-400">
                              No parts allocated to this line.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {la.map((a) => {
                                const partName =
                                  (a.parts?.name ?? "").trim() ||
                                  (a.parts?.sku ?? "").trim() ||
                                  (a.part_id
                                    ? `Part ${a.part_id.slice(0, 8)}`
                                    : "Part");

                                const qty =
                                  typeof a.qty === "number" ? a.qty : Number(a.qty);
                                const unit =
                                  typeof a.unit_cost === "number"
                                    ? a.unit_cost
                                    : Number(a.unit_cost);
                                const q = Number.isFinite(qty) ? qty : 0;
                                const u = Number.isFinite(unit) ? unit : 0;
                                const rowTotal = q * u;

                                return (
                                  <div
                                    key={a.id}
                                    className="
                                      flex flex-wrap items-center justify-between gap-3
                                      rounded-xl border border-white/10 bg-black/45 px-3 py-3
                                    "
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-white">
                                        {partName}
                                      </div>
                                      <div className="text-xs text-neutral-500">
                                        {a.location_id
                                          ? `Location: ${a.location_id}`
                                          : "No location"}
                                        {a._dirty ? " • Unsaved" : ""}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <label className="text-xs text-neutral-400">
                                        Qty
                                        <input
                                          inputMode="decimal"
                                          value={String(q)}
                                          onChange={(e) => {
                                            const n = asNumber(e.target.value);
                                            setAllocField(a.id, { qty: n ?? 0 });
                                          }}
                                          className={`${inputBase} ${inputFocus} ml-2 w-20`}
                                        />
                                      </label>

                                      <label className="text-xs text-neutral-400">
                                        Unit
                                        <input
                                          inputMode="decimal"
                                          value={String(u)}
                                          onChange={(e) => {
                                            const n = asNumber(e.target.value);
                                            setAllocField(a.id, { unit_cost: n ?? 0 });
                                          }}
                                          className={`${inputBase} ${inputFocus} ml-2 w-28`}
                                        />
                                      </label>

                                      <div className="w-24 text-right text-sm font-semibold text-white">
                                        {fmt(rowTotal)}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="mt-3 text-xs text-neutral-500">
                          Current: approval_state={l.approval_state ?? "null"} •
                          status={l.status ?? "null"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* right column */}
          <div className="space-y-4">
            {/* ✅ FIXED QUICK ADD CARD */}
            <div className={card}>
              <div
                className={`border-b ${divider} px-5 py-3 text-sm font-semibold text-neutral-200`}
              >
                Quick add job
              </div>
              <div className="px-5 py-4 text-sm text-neutral-400">
                Add missing lines while reviewing the quote (ex: Alignment after tie rod
                ends).
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() =>
                      openAddJobWithPrefill({
                        jobName: "",
                        notes: "",
                        laborHours: null,
                        partsPaste: "",
                        parts: null,
                      })
                    }
                    className="
                      w-full rounded-xl border border-[color:var(--copper)]/70 bg-[color:var(--copper)]/10
                      px-4 py-2 text-sm font-semibold text-[color:var(--copper)]
                      hover:bg-[color:var(--copper)]/15
                    "
                  >
                    + Add job line
                  </button>
                </div>
              </div>
            </div>

            <div className={card}>
              <div
                className={`border-b ${divider} px-5 py-3 text-sm font-semibold text-neutral-200`}
              >
                Totals
              </div>

              <div className="px-5 py-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Labor</span>
                  <span className="font-medium text-white">
                    {fmt(totals.laborTotal)}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-neutral-400">Parts</span>
                  <span className="font-medium text-white">
                    {fmt(totals.partsTotal)}
                  </span>
                </div>

                <div
                  className={`mt-3 flex items-center justify-between border-t ${divider} pt-3`}
                >
                  <span className="text-neutral-300">Subtotal</span>
                  <span className="font-semibold text-white">
                    {fmt(totals.subtotal)}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-neutral-400">
                    Tax {provinceCode ? `(${provinceCode})` : "(not set)"}
                  </span>
                  <span className="font-medium text-white">{fmt(totals.tax)}</span>
                </div>

                <div
                  className={`mt-3 flex items-center justify-between border-t ${divider} pt-3`}
                >
                  <span className="font-semibold text-white">Grand total</span>
                  <span className="text-lg font-bold" style={{ color: COPPER }}>
                    {fmt(totals.total)}
                  </span>
                </div>

                <div className="mt-4 text-xs text-neutral-500">
                  Tip: set shop province to enable CA tax, and shop labor rate to match
                  pricing.
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => void saveAllDirty()}
                    disabled={saving}
                    className="
                      w-full rounded-xl border border-[color:var(--copper)]/70 bg-[color:var(--copper)]/10
                      px-4 py-2 text-sm font-semibold text-[color:var(--copper)]
                      hover:bg-[color:var(--copper)]/15 disabled:opacity-60
                    "
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            </div>

            <div className={card}>
              <div
                className={`border-b ${divider} px-5 py-3 text-sm font-semibold text-neutral-200`}
              >
                Send to customer
              </div>
              <div className="px-5 py-4 text-sm text-neutral-400">
                Sends an email and creates a portal notification with the quote link.
                <div className="mt-3">
                  <button
                    onClick={() => void sendQuoteToCustomer()}
                    disabled={sending}
                    className="
                      w-full rounded-xl border border-white/10 bg-black/55
                      px-4 py-2 text-sm font-semibold text-white
                      hover:bg-black/70 disabled:opacity-60
                    "
                  >
                    {sending ? "Sending…" : "Send Quote"}
                  </button>
                </div>
                <div className="mt-3 text-xs text-neutral-500">
                  Portal link will be:{" "}
                  <span className="text-neutral-300">/portal/quotes/{woId}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-neutral-500">
          Work Order ID: {wo.id} • Status: {statusLabel(wo.status)}
        </div>

        <AddJobModal
          isOpen={addJobOpen}
          onClose={() => setAddJobOpen(false)}
          workOrderId={wo.id}
          vehicleId={(wo as unknown as { vehicle_id?: string | null }).vehicle_id ?? null}
          techId={currentUserId}
          shopId={wo.shop_id ?? null}
          onJobAdded={async () => {
            await reload();
          }}
        />
      </div>
    </div>
  );
}
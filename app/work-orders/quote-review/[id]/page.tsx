// app/work-orders/quote-review/[id]/page.tsx (NEW FILE)
// Advisor-facing: fully itemized + editable quote editor for a single WO.
// - Editable: complaint/cause/correction/description, labor_time
// - Shows parts allocations per line (qty + unit_cost editable)
// - Totals: labor + parts => subtotal + tax + grand total
// - Per-line actions: approve / decline / defer (updates status + approval_state)
// NOTE: This does NOT replace the customer portal approval UI; we’ll adjust portal separately.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";
import { formatCurrency } from "@/features/shared/lib/formatCurrency";
import { calculateTax, getTaxAmount, isProvinceCode, type ProvinceCode } from "@/features/integrations/tax";

type DB = Database;

type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type LineUpdate = DB["public"]["Tables"]["work_order_lines"]["Update"];

type Allocation = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type AllocationUpdate = DB["public"]["Tables"]["work_order_part_allocations"]["Update"];

type Part = DB["public"]["Tables"]["parts"]["Row"];

type AllocationWithPart = Allocation & {
  parts?: Pick<Part, "name" | "sku"> | null;
};

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

type EditableLine = Line & {
  _dirty?: boolean;
};

type EditableAlloc = AllocationWithPart & {
  _dirty?: boolean;
};

export default function AdvisorQuoteReviewDetailPage(): JSX.Element {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const woId = String(params?.id ?? "").trim();

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);

  const [lines, setLines] = useState<EditableLine[]>([]);
  const [allocs, setAllocs] = useState<EditableAlloc[]>([]);

  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!woId) return;

    setLoading(true);

    const { data: woRow, error: woErr } = await supabase.from("work_orders").select("*").eq("id", woId).maybeSingle();

    if (woErr) {
      toast.error(woErr.message);
      setWo(null);
      setLines([]);
      setAllocs([]);
      setLoading(false);
      return;
    }

    setWo(woRow ?? null);

    if (woRow?.shop_id) {
      const { data: shopRow, error: shopErr } = await supabase.from("shops").select("*").eq("id", woRow.shop_id).maybeSingle();
      if (shopErr) toast.error(shopErr.message);
      setShop(shopRow ?? null);
    } else {
      setShop(null);
    }

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

  const laborRate = useMemo(() => {
    // Prefer shops.labor_rate if present; fallback to 120
    const candidate = (shop as unknown as { labor_rate?: unknown } | null)?.labor_rate;
    const n = asNumber(candidate);
    return n ?? 120;
  }, [shop]);

  const provinceCode = useMemo<ProvinceCode | null>(() => {
    // Prefer shops.province_code / province if present; otherwise null => tax 0
    const s = shop as unknown as { province_code?: unknown; province?: unknown } | null;
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
      const unit = typeof a.unit_cost === "number" ? a.unit_cost : Number(a.unit_cost);
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
    setLines((prev) => prev.map((l) => (l.id === lineId ? ({ ...l, ...patch, _dirty: true } as EditableLine) : l)));
  }, []);

  const setAllocField = useCallback((allocId: string, patch: Partial<EditableAlloc>) => {
    setAllocs((prev) => prev.map((a) => (a.id === allocId ? ({ ...a, ...patch, _dirty: true } as EditableAlloc) : a)));
  }, []);

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

        const { error } = await supabase.from("work_order_lines").update(patch).eq("id", l.id);
        if (error) throw error;
      }

      for (const a of dirtyAllocs) {
        const patch: AllocationUpdate = {
          qty: a.qty,
          unit_cost: a.unit_cost,
          location_id: a.location_id,
        };

        const { error } = await supabase.from("work_order_part_allocations").update(patch).eq("id", a.id);
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

  async function setDecision(lineId: string, decision: "approve" | "decline" | "defer") {
    const patch: LineUpdate =
      decision === "approve"
        ? { approval_state: "approved", status: "queued" }
        : decision === "decline"
          ? { approval_state: "declined", status: "declined" }
          : { approval_state: null, status: "awaiting_approval" };

    const { error } = await supabase.from("work_order_lines").update(patch).eq("id", lineId);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(decision === "approve" ? "Line approved" : decision === "decline" ? "Line declined" : "Line deferred");
    await reload();
  }

  if (!woId) return <div className="p-6 text-destructive">Missing work order id.</div>;
  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!wo) return <div className="p-6 text-destructive">Work order not found.</div>;

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button onClick={() => router.back()} className="text-sm text-orange-500 hover:underline">
            ← Back
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void saveAllDirty()}
              disabled={saving}
              className="rounded border border-orange-500 px-3 py-1.5 text-sm text-orange-500 hover:bg-orange-500/10 disabled:opacity-60"
              title="Save all changes"
            >
              {saving ? "Saving…" : "Save"}
            </button>

            <a
              href={`/work-orders/${woId}`}
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted"
              title="Open the work order"
            >
              Open WO
            </a>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">
                Quote Review{" "}
                <span className="text-orange-500">{wo.custom_id ? `#${wo.custom_id}` : `#${wo.id.slice(0, 8)}`}</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Status: {statusLabel(wo.status)} {shop?.name ? `• ${shop.name}` : ""}
              </div>
            </div>

            <div className="text-right text-sm">
              <div className="text-muted-foreground">Labor rate</div>
              <div className="font-semibold">{fmt(laborRate)}/hr</div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-2 font-semibold">Line Items</div>

              {lines.length === 0 ? (
                <div className="px-4 py-3 text-muted-foreground">No lines yet.</div>
              ) : (
                <div className="divide-y divide-border">
                  {lines.map((l) => {
                    const la = lineAllocs.get(l.id) ?? [];
                    const laborHours = typeof l.labor_time === "number" ? l.labor_time : 0;
                    const laborAmt = laborHours * laborRate;

                    const partsAmt = la.reduce((sum, a) => {
                      const qty = typeof a.qty === "number" ? a.qty : Number(a.qty);
                      const unit = typeof a.unit_cost === "number" ? a.unit_cost : Number(a.unit_cost);
                      const q = Number.isFinite(qty) ? qty : 0;
                      const u = Number.isFinite(unit) ? unit : 0;
                      return sum + q * u;
                    }, 0);

                    const lineTotal = laborAmt + partsAmt;

                    const ap = safeTrim(l.approval_state).toLowerCase();
                    const st = safeTrim(l.status).toLowerCase();

                    const pillClass =
                      ap === "approved"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        : ap === "declined"
                          ? "border-red-500/30 bg-red-500/10 text-red-200"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-200";

                    return (
                      <div key={l.id} className="px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-semibold">Line</div>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pillClass}`}
                                title={`approval_state=${l.approval_state ?? "null"} status=${l.status ?? "null"}`}
                              >
                                {l.approval_state ? statusLabel(l.approval_state) : "pending"} • {statusLabel(l.status)}
                              </span>
                              {l._dirty ? (
                                <span className="text-xs text-orange-500">Unsaved</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Saved</span>
                              )}
                            </div>

                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              <label className="text-xs text-muted-foreground">
                                Description
                                <input
                                  value={l.description ?? ""}
                                  onChange={(e) => setLineField(l.id, { description: e.target.value })}
                                  className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                                />
                              </label>

                              <label className="text-xs text-muted-foreground">
                                Complaint
                                <input
                                  value={l.complaint ?? ""}
                                  onChange={(e) => setLineField(l.id, { complaint: e.target.value })}
                                  className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                                />
                              </label>

                              <label className="text-xs text-muted-foreground">
                                Cause
                                <input
                                  value={l.cause ?? ""}
                                  onChange={(e) => setLineField(l.id, { cause: e.target.value })}
                                  className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                                />
                              </label>

                              <label className="text-xs text-muted-foreground">
                                Correction
                                <input
                                  value={l.correction ?? ""}
                                  onChange={(e) => setLineField(l.id, { correction: e.target.value })}
                                  className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                                />
                              </label>

                              <label className="text-xs text-muted-foreground">
                                Labor hours
                                <input
                                  inputMode="decimal"
                                  value={typeof l.labor_time === "number" ? String(l.labor_time) : ""}
                                  onChange={(e) => {
                                    const n = asNumber(e.target.value);
                                    setLineField(l.id, { labor_time: n ?? 0 });
                                  }}
                                  className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                                />
                              </label>

                              <div className="text-xs text-muted-foreground">
                                Line total
                                <div className="mt-2 text-sm font-semibold">{fmt(lineTotal)}</div>
                              </div>
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-col gap-2">
                            <button
                              onClick={() => void setDecision(l.id, "approve")}
                              className="rounded border border-emerald-600 px-3 py-1 text-sm text-emerald-200 hover:bg-emerald-900/30"
                              disabled={st === "declined"}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => void setDecision(l.id, "decline")}
                              className="rounded border border-red-600 px-3 py-1 text-sm text-red-200 hover:bg-red-900/40"
                              disabled={ap === "declined"}
                            >
                              Decline
                            </button>
                            <button
                              onClick={() => void setDecision(l.id, "defer")}
                              className="rounded border border-amber-600 px-3 py-1 text-sm text-amber-200 hover:bg-amber-900/30"
                            >
                              Defer
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 rounded border border-border bg-muted/20 p-3">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Parts</div>

                          {la.length === 0 ? (
                            <div className="text-sm text-muted-foreground">No parts allocated to this line.</div>
                          ) : (
                            <div className="space-y-2">
                              {la.map((a) => {
                                const partName =
                                  (a.parts?.name ?? "").trim() ||
                                  (a.parts?.sku ?? "").trim() ||
                                  (a.part_id ? `Part ${a.part_id.slice(0, 8)}` : "Part");

                                const qty = typeof a.qty === "number" ? a.qty : Number(a.qty);
                                const unit = typeof a.unit_cost === "number" ? a.unit_cost : Number(a.unit_cost);
                                const q = Number.isFinite(qty) ? qty : 0;
                                const u = Number.isFinite(unit) ? unit : 0;
                                const rowTotal = q * u;

                                return (
                                  <div
                                    key={a.id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-background px-3 py-2"
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium">{partName}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {a.location_id ? `Location: ${a.location_id}` : "No location"}
                                        {a._dirty ? " • Unsaved" : ""}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <label className="text-xs text-muted-foreground">
                                        Qty
                                        <input
                                          inputMode="decimal"
                                          value={String(q)}
                                          onChange={(e) => {
                                            const n = asNumber(e.target.value);
                                            setAllocField(a.id, { qty: n ?? 0 });
                                          }}
                                          className="ml-2 w-20 rounded border border-border bg-background px-2 py-1 text-sm"
                                        />
                                      </label>

                                      <label className="text-xs text-muted-foreground">
                                        Unit
                                        <input
                                          inputMode="decimal"
                                          value={String(u)}
                                          onChange={(e) => {
                                            const n = asNumber(e.target.value);
                                            setAllocField(a.id, { unit_cost: n ?? 0 });
                                          }}
                                          className="ml-2 w-28 rounded border border-border bg-background px-2 py-1 text-sm"
                                        />
                                      </label>

                                      <div className="w-24 text-right text-sm font-semibold">{fmt(rowTotal)}</div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="mt-3 text-xs text-muted-foreground">
                          Current: approval_state={l.approval_state ?? "null"} • status={l.status ?? "null"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-2 font-semibold">Totals</div>

              <div className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Labor</span>
                  <span className="font-medium">{fmt(totals.laborTotal)}</span>
                </div>

                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted-foreground">Parts</span>
                  <span className="font-medium">{fmt(totals.partsTotal)}</span>
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">{fmt(totals.subtotal)}</span>
                </div>

                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted-foreground">Tax {provinceCode ? `(${provinceCode})` : "(not set)"}</span>
                  <span className="font-medium">{fmt(totals.tax)}</span>
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                  <span className="font-semibold">Grand total</span>
                  <span className="font-bold text-orange-500">{fmt(totals.total)}</span>
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                  Tip: set your shop province to enable CA tax, and shop labor rate to match your pricing.
                  For US/other markets, we’ll wire a shop-configured tax rate next.
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => void saveAllDirty()}
                    disabled={saving}
                    className="w-full rounded border border-orange-500 px-3 py-2 text-sm font-semibold text-orange-500 hover:bg-orange-500/10 disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-2 font-semibold">Next</div>
              <div className="px-4 py-3 text-sm text-muted-foreground">
                After advisor decisions are set, we’ll update the customer portal approval page to show the same itemized
                lines (approve/decline/defer) and display totals.
              </div>
              <div className="px-4 pb-4">
                <a
                  href={`/work-orders/${woId}/approve`}
                  className="block rounded border border-border px-3 py-2 text-center text-sm hover:bg-muted"
                >
                  Open customer portal approval page
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-muted-foreground">
          Work Order ID: {wo.id} • Status: {statusLabel(wo.status)}
        </div>
      </div>
    </div>
  );
}
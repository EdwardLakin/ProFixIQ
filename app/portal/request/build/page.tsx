// app/portal/request/build/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { Toaster, toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";
import LinkButton from "@shared/components/ui/LinkButton";

import SignaturePad, { openSignaturePad } from "@/features/shared/signaturePad/controller";
import LegalTerms from "@/features/shared/components/LegalTerms";
import { uploadSignatureImage } from "@/features/shared/lib/utils/uploadSignature";
import {
  buildDiagnosticRequestNotes,
  diagnosticRequestIsComplete,
} from "@/features/portal/lib/request/diagnosticDetails";

type DB = Database;

type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type QuoteLineRow = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"];
type BookingRow = DB["public"]["Tables"]["bookings"]["Row"];

const COPPER = "#C57A4A";

function cardClass() {
  return "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 backdrop-blur-md shadow-card";
}

function inputClass() {
  return "w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none focus:border-[color:var(--theme-border-soft)]";
}

function sectionTitle(s: string) {
  return <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">{s}</div>;
}

async function postJson<TResp>(
  url: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<{ ok: true; data: TResp } | { ok: false; error: string; status: number }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const j = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;

  if (!res.ok)
    return {
      ok: false,
      error: (typeof j?.error === "string" && j.error) || "Request failed",
      status: res.status,
    };

  return { ok: true, data: j as unknown as TResp };
}

function fmtMoney(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "â€”";
  return n.toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

function ymm(v: VehicleRow | null) {
  if (!v) return "";
  return [v.year ?? "", v.make ?? "", v.model ?? ""].filter(Boolean).join(" ").trim();
}

function safeTrim(s: unknown) {
  return typeof s === "string" ? s.trim() : "";
}

function rec(row: unknown): Record<string, unknown> {
  return (row && typeof row === "object" ? (row as Record<string, unknown>) : {}) as Record<string, unknown>;
}

function getOptString(row: unknown, key: string): string | null {
  const v = rec(row)[key];
  return typeof v === "string" ? v : null;
}

function getOptNumber(row: unknown, key: string): number | null {
  const v = rec(row)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function menuTitle(m: MenuItemRow): string {
  const name = getOptString(m, "name");
  const title = getOptString(m, "title");
  return (name || title || m.description || "Menu item").toString();
}

function lineTitle(l: WorkOrderLineRow): string {
  const desc = getOptString(l, "description");
  return (desc || l.complaint || "Line").toString();
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function modalShell(open: boolean) {
  return cx(
    "fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center",
    open ? "" : "pointer-events-none opacity-0",
  );
}

function modalBackdrop(open: boolean) {
  return cx("absolute inset-0 bg-[color:var(--theme-surface-overlay)] backdrop-blur-sm transition-opacity", open ? "opacity-100" : "opacity-0");
}

function modalCard(open: boolean) {
  return cx(
    "relative w-full max-w-2xl rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-4 shadow-[var(--theme-shadow-medium)] backdrop-blur-md transition-transform",
    open ? "translate-y-0" : "translate-y-6",
  );
}

function fmtBookingRange(b: BookingRow | null) {
  if (!b) return null;
  const s = typeof b.starts_at === "string" ? Date.parse(b.starts_at) : NaN;
  const e = typeof b.ends_at === "string" ? Date.parse(b.ends_at) : NaN;
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;

  const sd = new Date(s);
  const ed = new Date(e);
  const date = sd.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const st = sd.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const et = ed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} â€¢ ${st} â€“ ${et}`;
}

export default function PortalRequestBuildPage() {
  const supabase = createBrowserSupabase();
  const router = useRouter();
  const sp = useSearchParams();

  const workOrderId = sp.get("wo") ?? "";
  const bookingId = sp.get("booking") ?? sp.get("bookingId") ?? "";

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [wo, setWo] = useState<WorkOrderRow | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [booking, setBooking] = useState<BookingRow | null>(null);

  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [menuSearch, setMenuSearch] = useState("");

  const [lines, setLines] = useState<WorkOrderLineRow[]>([]);
  const [quoteLines, setQuoteLines] = useState<QuoteLineRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [customDesc, setCustomDesc] = useState("");
  const [customNotes, setCustomNotes] = useState("");

  const [qoDesc, setQoDesc] = useState("");
  const [qoNotes, setQoNotes] = useState("");
  const [qoQty, setQoQty] = useState("1");

  const [submitting, setSubmitting] = useState(false);

  const [diagnosticTiming, setDiagnosticTiming] = useState("");
  const [diagnosticFrequency, setDiagnosticFrequency] = useState("");
  const [diagnosticConditions, setDiagnosticConditions] = useState("");
  const [diagnosticWarnings, setDiagnosticWarnings] = useState("");
  const [diagnosticDrivable, setDiagnosticDrivable] = useState<"yes" | "no" | "unsure">("unsure");
  const [addingLine, setAddingLine] = useState(false);

  const [quoteKind, setQuoteKind] = useState<"repair" | "parts_only">("repair");
  const [addingQuote, setAddingQuote] = useState(false);

  // Review & Sign
  const [reviewOpen, setReviewOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  const filteredMenu = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    if (!q) return menuItems.slice(0, 40);

    return menuItems
      .filter((m) => {
        const hay = [menuTitle(m), m.description ?? "", m.category ?? "", m.service_key ?? ""].join(" ").toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [menuItems, menuSearch]);

  async function loadAll() {
    if (!workOrderId) {
      toast.error("Missing work order id.");
      router.replace("/portal/request/when");
      return;
    }
    if (!bookingId) {
      toast.error("Missing booking. Please pick a time again.");
      router.replace("/portal/request/when");
      return;
    }

    setRefreshing(true);

    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        toast.error("Please sign in.");
        router.replace("/portal/auth/sign-in");
        return;
      }

      const { data: c, error: cErr } = await supabase
        .from("customers")
        .select("id,user_id,shop_id,first_name,last_name,email,phone")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cErr) throw new Error(cErr.message);

      const cust = (c ?? null) as CustomerRow | null;
      if (!cust?.id) {
        toast.error("Customer profile not found.");
        router.replace("/portal/profile");
        return;
      }
      setCustomer(cust);

      const { data: w, error: wErr } = await supabase
        .from("work_orders")
        .select("*")
        .eq("id", workOrderId)
        .eq("customer_id", cust.id)
        .maybeSingle();

      if (wErr) throw new Error(wErr.message);
      if (!w) {
        toast.error("Work order not found.");
        router.replace("/portal/request/when");
        return;
      }
      setWo(w as WorkOrderRow);

      // Load booking (basic; schema currently doesnâ€™t link customer/wo)
      const { data: b, error: bErr } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId)
        .maybeSingle();

      if (bErr) throw new Error(bErr.message);
      if (!b) {
        toast.error("Booking not found. Please pick a time again.");
        router.replace("/portal/request/when");
        return;
      }
      // Minimal sanity: same shop
      const bShop = (b as BookingRow).shop_id ?? null;
      if (bShop && w.shop_id && bShop !== w.shop_id) {
        toast.error("Booking mismatch. Please pick a time again.");
        router.replace("/portal/request/when");
        return;
      }
      setBooking(b as BookingRow);

      if (w.vehicle_id) {
        const { data: v, error: vErr } = await supabase
          .from("vehicles")
          .select("id,customer_id,shop_id,year,make,model,vin,license_plate,mileage,color,created_at")
          .eq("id", w.vehicle_id)
          .maybeSingle();

        if (!vErr && v) setVehicle(v as unknown as VehicleRow);
      } else {
        setVehicle(null);
      }

      const { data: l, error: lErr } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("work_order_id", w.id)
        .order("created_at", { ascending: true });

      if (lErr) throw new Error(lErr.message);
      setLines((l ?? []) as unknown as WorkOrderLineRow[]);

      const { data: ql, error: qlErr } = await supabase
        .from("work_order_quote_lines")
        .select("*")
        .eq("work_order_id", w.id)
        .order("created_at", { ascending: true });

      if (qlErr) throw new Error(qlErr.message);
      setQuoteLines((ql ?? []) as unknown as QuoteLineRow[]);

      if (cust.shop_id) {
        const { data: mi, error: miErr } = await supabase
          .from("menu_items")
          .select("*")
          .eq("shop_id", cust.shop_id)
          .eq("is_active", true)
          .order("category", { ascending: true })
          .limit(500);

        if (miErr) throw new Error(miErr.message);

        const all = (mi ?? []) as unknown as MenuItemRow[];

        const vy = (vehicle?.year ?? null) as number | null;
        const vm = safeTrim(vehicle?.make ?? null);
        const vmo = safeTrim(vehicle?.model ?? null);

        const filtered = all.filter((m) => {
          const my = getOptNumber(m, "vehicle_year");
          const mm = safeTrim(getOptString(m, "vehicle_make"));
          const mmo = safeTrim(getOptString(m, "vehicle_model"));

          const hasAnyVehicleKey = my != null || !!mm || !!mmo;
          if (!hasAnyVehicleKey) return true;

          const yearOk = my == null || (vy != null && my === vy);
          const makeOk = !mm || (vm && mm.toLowerCase() === vm.toLowerCase());
          const modelOk = !mmo || (vmo && mmo.toLowerCase() === vmo.toLowerCase());

          return yearOk && makeOk && modelOk;
        });

        setMenuItems(filtered);
      } else {
        setMenuItems([]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load request.";
      toast.error(msg);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId, bookingId]);

  async function addMenuLine(menuItemId: string) {
    if (!wo?.id) return;

    const r = await postJson<{ line?: unknown }>("/api/portal/request/add-menu-line", {
      workOrderId: wo.id,
      menuItemId,
    }, crypto.randomUUID());

    if (!r.ok) {
      toast.error(r.error);
      return;
    }

    toast.success("Added menu item.");
    await loadAll();
  }

  async function addCustomLine() {
    if (!wo?.id || addingLine) return;

    const desc = customDesc.trim();
    const details = {
      concern: desc,
      timing: diagnosticTiming,
      frequency: diagnosticFrequency,
      conditions: diagnosticConditions,
      warningLights: diagnosticWarnings,
      drivable: diagnosticDrivable,
      additionalNotes: customNotes,
    };
    if (!diagnosticRequestIsComplete(details)) {
      toast.error("Describe the concern that needs diagnosis.");
      return;
    }

    setAddingLine(true);
    const r = await postJson<{ line?: unknown }>(
      "/api/portal/request/add-custom-line",
      {
        workOrderId: wo.id,
        description: `Diagnose: ${desc}`,
        notes: buildDiagnosticRequestNotes(details),
        lineType: "job",
        diagnostic: true,
      },
      crypto.randomUUID(),
    );

    if (!r.ok) {
      toast.error(r.error);
      setAddingLine(false);
      return;
    }

    toast.success("Diagnostic concern added.");
    setCustomDesc("");
    setCustomNotes("");
    setDiagnosticTiming("");
    setDiagnosticFrequency("");
    setDiagnosticConditions("");
    setDiagnosticWarnings("");
    setDiagnosticDrivable("unsure");
    await loadAll();
    setAddingLine(false);
  }

  async function addQuoteOnly() {
    if (!wo?.id || !wo.vehicle_id || addingQuote) return;

    const desc = qoDesc.trim();
    if (!desc) {
      toast.error("Enter a description for the quote request.");
      return;
    }

    const qtyN = Number(qoQty);
    const qty = Number.isFinite(qtyN) ? Math.max(1, Math.min(99, Math.trunc(qtyN))) : 1;

    setAddingQuote(true);
    const r = await postJson<{ quoteLineId?: string }>(
      "/api/portal/request/add-quote-only",
      {
        workOrderId: wo.id,
        vehicleId: wo.vehicle_id,
        requestKind: quoteKind,
        description: desc,
        notes: qoNotes.trim() || null,
        qty,
      },
      crypto.randomUUID(),
    );

    if (!r.ok) {
      toast.error(r.error);
      setAddingQuote(false);
      return;
    }

    toast.success("Sent to quote queue.");
    setQoDesc("");
    setQoNotes("");
    setQoQty("1");
    await loadAll();
    setAddingQuote(false);
  }

  // Known services submit immediately; diagnostic details live only on diagnostic lines.
  function beginSubmit() {
    if (!wo?.id || submitting) return;

    if (!bookingId) {
      toast.error("Missing booking. Please go back and pick a time again.");
      router.replace("/portal/request/when");
      return;
    }

    if (lines.length === 0 && quoteLines.length === 0) {
      toast.error("Add a service, diagnostic concern, or quote request first.");
      return;
    }

    setAgreed(false);
    setSigUrl(null);
    setReviewOpen(true);
  }

  async function finalizeSubmit(opts: { requireSignature?: boolean }) {
    if (!wo?.id || submitting || reviewBusy) return;

    if (!bookingId) {
      toast.error("Missing booking. Please go back and pick a time again.");
      router.replace("/portal/request/when");
      return;
    }

    if (!agreed) {
      toast.error("Please agree to the terms before submitting.");
      return;
    }

    setReviewBusy(true);
    setSubmitting(true);

    try {
      const uploadedSigUrl: string | null = sigUrl;

      if (!uploadedSigUrl && opts.requireSignature) {
        toast.error("Signature required.");
        return;
      }

      const r = await postJson<{
        ok?: boolean;
        bookingId?: string;
        workOrderId?: string;
      }>("/api/portal/request/submit", {
        workOrderId: wo.id,
        bookingId,
        customerAgreedAt: new Date().toISOString(),
        customerSignatureUrl: uploadedSigUrl,
      });

      if (!r.ok) {
        toast.error(r.error);
        return;
      }

      toast.success("Submitted.");
      setReviewOpen(false);
      router.replace("/portal/customer-appointments");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Submit failed.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
      setReviewBusy(false);
    }
  }

  async function captureSignature() {
    if (!wo?.id || reviewBusy) return;
    setReviewBusy(true);
    try {
      const base64: string | null = await openSignaturePad({
        shopName: "",
      });

      if (!base64) return;

      const uploaded = await uploadSignatureImage(base64, wo.id);
      setSigUrl(uploaded);
      toast.success("Signature saved.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save signature");
    } finally {
      setReviewBusy(false);
    }
  }

  if (loading) {
    return <div className={cardClass() + " mx-auto max-w-3xl text-sm text-[color:var(--theme-text-primary)]"}>Loadingâ€¦</div>;
  }

  if (!wo?.id || !customer?.id) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 text-[color:var(--theme-text-primary)]">
        <Toaster position="top-center" />
        <div className={cardClass()}>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)]">Build request</h1>
          <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">This request is missing or expired.</p>
          <div className="mt-4">
            <LinkButton href="/portal/request/when" size="sm">
              Start again
            </LinkButton>
          </div>
        </div>
      </div>
    );
  }

  const name =
    [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ").trim() || "Customer";

  const bookingLabel = fmtBookingRange(booking);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 text-[color:var(--theme-text-primary)]">
      <Toaster position="top-center" />

      <header className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div
              className="inline-flex items-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-1 text-[11px] uppercase tracking-[0.2em]"
              style={{ color: COPPER }}
            >
              Request
            </div>
            <h1 className="mt-2 text-lg font-blackops uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)]">
              Choose service
            </h1>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
              {name} â€¢ {vehicle ? ymm(vehicle) : "Vehicle not set"} â€¢ WO{" "}
              <span className="font-mono text-[color:var(--theme-text-secondary)]">{wo.id.slice(0, 8)}â€¦</span>
              {bookingLabel ? <span className="ml-2">â€¢ {bookingLabel}</span> : null}
            </p>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => void loadAll()} disabled={refreshing}>
              {refreshing ? "Refreshingâ€¦" : "Refresh"}
            </Button>
            <LinkButton href="/portal/request/when" variant="outline" size="sm">
              Back
            </LinkButton>
          </div>
        </div>
      </header>

      <section className={cardClass()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Current draft</h2>
          <div className="text-[0.75rem] text-[color:var(--theme-text-muted)]">
            Lines: {lines.length} â€¢ Quote requests: {quoteLines.length}
          </div>
        </div>

        {lines.length === 0 && quoteLines.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-secondary)]">
            Nothing added yet. Add menu items, custom lines, or quote requests below.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {lines.map((l) => {
              const title = lineTitle(l);
              const status = (l.status ?? "pending").toString();
              const est = getOptNumber(l, "price_estimate");

              return (
                <div key={l.id} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{title}</div>
                      <div className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                        Status: <span className="text-[color:var(--theme-text-secondary)]">{status}</span>
                        {l.menu_item_id ? (
                          <span className="ml-2 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-0.5 text-[0.7rem] uppercase tracking-[0.14em] text-[color:var(--theme-text-primary)]">
                            menu
                          </span>
                        ) : (
                          <span className="ml-2 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-0.5 text-[0.7rem] uppercase tracking-[0.14em] text-[color:var(--theme-text-primary)]">
                            custom
                          </span>
                        )}
                      </div>

                      {typeof l.notes === "string" && l.notes.trim().length > 0 ? (
                        <div className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">{l.notes}</div>
                      ) : null}
                    </div>

                    <div className="text-right text-xs text-[color:var(--theme-text-secondary)]">Est: {fmtMoney(est)}</div>
                  </div>
                </div>
              );
            })}

            {quoteLines.map((q) => {
              const title = (q.description ?? "Quote request").toString();
              const stage = (q.stage ?? "advisor_pending").toString();
              const qty = typeof q.qty === "number" && Number.isFinite(q.qty) ? q.qty : 1;

              return (
                <div key={q.id} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{title}</div>
                      <div className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                        Stage: <span className="text-[color:var(--theme-text-secondary)]">{stage}</span> â€¢ Qty{" "}
                        <span className="text-[color:var(--theme-text-secondary)]">{qty}</span>
                        <span className="ml-2 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-0.5 text-[0.7rem] uppercase tracking-[0.14em] text-[color:var(--theme-text-primary)]">
                          quote
                        </span>
                      </div>

                      {typeof q.notes === "string" && q.notes.trim().length > 0 ? (
                        <div className="mt-2 text-xs text-[color:var(--theme-text-muted)]">{q.notes}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className={cardClass() + " space-y-3"}>
        <div className="flex items-end justify-between gap-3">
          <div>
            {sectionTitle("Add menu items")}
            <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">Fixed pricing lines your shop already offers.</div>
          </div>
          <div className="w-full max-w-sm">
            <input className={inputClass()} placeholder="Search menuâ€¦" value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} />
          </div>
        </div>

        {filteredMenu.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-secondary)]">
            No menu items found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filteredMenu.map((m) => {
              const title = menuTitle(m);
              const hrs = (m.base_labor_hours ?? m.labor_hours ?? null) as number | null;
              const price = (m.total_price ?? m.base_price ?? null) as number | null;

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => void addMenuLine(m.id)}
                  className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-left transition hover:bg-[color:var(--theme-surface-inset)] active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{title}</div>
                      <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                        {m.category ? <span>{String(m.category)}</span> : <span>Menu</span>}
                        {hrs != null ? <span className="ml-2">â€¢ {hrs}h</span> : null}
                      </div>
                    </div>
                    <div className="text-xs text-[color:var(--theme-text-secondary)]">{fmtMoney(price)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className={cardClass() + " space-y-3"}>
        {sectionTitle("Something needs diagnosis")}
        <div className="text-xs text-[color:var(--theme-text-muted)]">
          These details are added only to this diagnostic line so the technician gets a useful complaint instead of a generic diagnosis request.
        </div>

        <input
          className={inputClass()}
          placeholder="What is the vehicle doing? Example: Steering wheel shakes at highway speed"
          value={customDesc}
          onChange={(e) => setCustomDesc(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input className={inputClass()} placeholder="When does it happen?" value={diagnosticTiming} onChange={(e) => setDiagnosticTiming(e.target.value)} />
          <select className={inputClass()} value={diagnosticFrequency} onChange={(e) => setDiagnosticFrequency(e.target.value)}>
            <option value="">How often?</option>
            <option value="Every time">Every time</option>
            <option value="Often">Often</option>
            <option value="Sometimes">Sometimes</option>
            <option value="Happened once">Happened once</option>
          </select>
          <input className={inputClass()} placeholder="Speed, temperature, braking, turningâ€¦" value={diagnosticConditions} onChange={(e) => setDiagnosticConditions(e.target.value)} />
          <input className={inputClass()} placeholder="Warning lights or fault codes" value={diagnosticWarnings} onChange={(e) => setDiagnosticWarnings(e.target.value)} />
        </div>
        <label className="block space-y-2 text-xs text-[color:var(--theme-text-secondary)]">
          <span>Does it feel safe to drive?</span>
          <select className={inputClass()} value={diagnosticDrivable} onChange={(e) => setDiagnosticDrivable(e.target.value as "yes" | "no" | "unsure")}>
            <option value="unsure">Unsure</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <textarea
          className={inputClass() + " min-h-[92px] resize-none"}
          placeholder="Anything else the technician should know?"
          value={customNotes}
          onChange={(e) => setCustomNotes(e.target.value)}
        />

        <div className="flex gap-2">
          <Button type="button" onClick={() => void addCustomLine()} disabled={addingLine}>
            {addingLine ? "Addingâ€¦" : "Add diagnostic concern"}
          </Button>
        </div>
      </section>

      <section className={cardClass() + " space-y-3"}>
        {sectionTitle("Request pricing instead")}
        <div className="text-xs text-[color:var(--theme-text-muted)]">
          Ask for a repair estimate or send a parts-only request directly to Parts for pickup.
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setQuoteKind("repair")} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${quoteKind === "repair" ? "border-[var(--accent-copper)] bg-[color:var(--theme-surface-subtle)]" : "border-[color:var(--theme-border-soft)]"}`}>Repair quote</button>
          <button type="button" onClick={() => setQuoteKind("parts_only")} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${quoteKind === "parts_only" ? "border-[var(--accent-copper)] bg-[color:var(--theme-surface-subtle)]" : "border-[color:var(--theme-border-soft)]"}`}>Parts for pickup</button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
          <input
            className={inputClass()}
            placeholder={quoteKind === "repair" ? "Example: Front brake pads and rotors" : "Example: Four winter tires, 275/65R18"}
            value={qoDesc}
            onChange={(e) => setQoDesc(e.target.value)}
          />
          {quoteKind === "parts_only" ? <input className={inputClass()} inputMode="numeric" placeholder="Qty" value={qoQty} onChange={(e) => setQoQty(e.target.value)} /> : null}
        </div>

        <textarea
          className={inputClass() + " min-h-[92px] resize-none"}
          placeholder="Optional notes (size, brand preference, etc.)"
          value={qoNotes}
          onChange={(e) => setQoNotes(e.target.value)}
        />

        <div className="flex gap-2">
          <Button type="button" onClick={() => void addQuoteOnly()} variant="outline" disabled={addingQuote}>
            {addingQuote ? "Sendingâ€¦" : quoteKind === "parts_only" ? "Send to Parts" : "Request repair quote"}
          </Button>
        </div>
      </section>

      <section className={cardClass()}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Review &amp; submit</div>
            <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
              Review the selected services and send the appointment request to the shop.
            </div>
          </div>

          <Button type="button" onClick={beginSubmit} disabled={submitting}>
            {submitting ? "Submittingâ€¦" : "Review & Submit"}
          </Button>
        </div>
      </section>

      <div className="pb-2 text-[0.75rem] text-[color:var(--theme-text-muted)]">
        Known services stay fast. Diagnostic questions appear only when a concern needs diagnosis.
      </div>

      {/* Review & Sign modal */}
      <div className={modalShell(reviewOpen)} aria-hidden={!reviewOpen}>
        <div className={modalBackdrop(reviewOpen)} onClick={() => setReviewOpen(false)} />
        <div className={modalCard(reviewOpen)} role="dialog" aria-modal="true">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-blackops text-[0.9rem] uppercase tracking-[0.18em]" style={{ color: COPPER }}>
                Review &amp; sign
              </div>
              <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                Confirm your requested services and agree to terms before submitting.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setReviewOpen(false)}
              className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-xs text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-overlay)]"
            >
              Close
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
              <div className="text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">Summary</div>
              <div className="mt-2 text-sm text-[color:var(--theme-text-primary)]">
                {name} â€¢ {vehicle ? ymm(vehicle) : "Vehicle not set"}
              </div>
              <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                {bookingLabel ? <span>{bookingLabel} â€¢ </span> : null}
                WO <span className="font-mono text-[color:var(--theme-text-secondary)]">{wo.id}</span> â€¢ Lines {lines.length} â€¢ Quote requests{" "}
                {quoteLines.length}
              </div>

            </div>

            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-xs text-[color:var(--theme-text-secondary)]">
              <div className="text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">Disclaimers</div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[color:var(--theme-text-secondary)]">
                <li>Prices and estimates are subject to change after inspection and diagnosis.</li>
                <li>This is a request and is not confirmed until the shop approves the appointment.</li>
                <li>Parts availability and additional findings may affect timing and total cost.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
              <LegalTerms onAgreeChange={setAgreed} defaultOpen />
            </div>

            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-[color:var(--theme-text-secondary)]">
                  Signature <span className="text-[color:var(--theme-text-muted)]">(recommended)</span>
                </div>
                <div className="text-[0.7rem] text-[color:var(--theme-text-muted)]">
                  {sigUrl ? (
                    <span className="text-emerald-200">Saved</span>
                  ) : (
                    <span className="text-[color:var(--theme-text-secondary)]">Not provided</span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => void captureSignature()} disabled={reviewBusy}>
                  {reviewBusy ? "Workingâ€¦" : sigUrl ? "Re-sign" : "Add signature"}
                </Button>

                <Button
                  type="button"
                  onClick={() => void finalizeSubmit({ requireSignature: false })}
                  disabled={submitting || reviewBusy || !agreed}
                >
                  {submitting ? "Submittingâ€¦" : "Agree & Submit request"}
                </Button>

                <span className="text-[0.7rem] text-[color:var(--theme-text-muted)]">Staff will review and approve the appointment.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mount once for openSignaturePad */}
      <SignaturePad />
    </div>
  );
}


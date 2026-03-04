// app/portal/request/build/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Toaster, toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";
import LinkButton from "@shared/components/ui/LinkButton";

import SignaturePad, { openSignaturePad } from "@/features/shared/signaturePad/controller";
import LegalTerms from "@/features/shared/components/LegalTerms";
import { uploadSignatureImage } from "@/features/shared/lib/utils/uploadSignature";

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
  return "rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-md shadow-card";
}

function inputClass() {
  return "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-white/20";
}

function sectionTitle(s: string) {
  return <div className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">{s}</div>;
}

async function postJson<TResp>(
  url: string,
  body: unknown,
): Promise<{ ok: true; data: TResp } | { ok: false; error: string; status: number }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
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
  return cx("absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity", open ? "opacity-100" : "opacity-0");
}

function modalCard(open: boolean) {
  return cx(
    "relative w-full max-w-2xl rounded-3xl border border-white/10 bg-black/70 p-4 shadow-[0_0_40px_rgba(0,0,0,0.85)] backdrop-blur-md transition-transform",
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
  return `${date} • ${st} – ${et}`;
}

// Intake helpers (stored into work_orders.notes without schema changes)
function buildIntakeNotesBlock(input: {
  concern: string;
  details: string;
  contactPref: string;
  mileage: string;
}) {
  const lines: string[] = [];
  lines.push("PORTAL INTAKE");
  lines.push(`Concern: ${input.concern.trim()}`);
  if (input.details.trim()) lines.push(`Details: ${input.details.trim()}`);
  if (input.contactPref.trim()) lines.push(`Contact: ${input.contactPref.trim()}`);
  if (input.mileage.trim()) lines.push(`Mileage: ${input.mileage.trim()}`);
  return lines.join("\n");
}

function mergeNotes(existing: string | null | undefined, intakeBlock: string) {
  const base = (existing ?? "").trim();
  // Replace prior PORTAL INTAKE block if present
  const marker = "PORTAL INTAKE";
  if (!base) return intakeBlock;

  const idx = base.indexOf(marker);
  if (idx >= 0) {
    const before = base.slice(0, idx).trimEnd();
    return before ? `${before}\n\n${intakeBlock}` : intakeBlock;
  }

  return `${base}\n\n${intakeBlock}`;
}

export default function PortalRequestBuildPage() {
  const supabase = createClientComponentClient<DB>();
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

  // NEW: Intake form flow
  const [intakeConcern, setIntakeConcern] = useState("");
  const [intakeDetails, setIntakeDetails] = useState("");
  const [intakeContactPref, setIntakeContactPref] = useState("Text or call");
  const [intakeMileage, setIntakeMileage] = useState("");
  const [intakeSaving, setIntakeSaving] = useState(false);
  const [intakeSavedAt, setIntakeSavedAt] = useState<string | null>(null);

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

      // Load booking (basic; schema currently doesn’t link customer/wo)
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

      // Hydrate intake fields from notes if already saved
      const existingNotes = (w as WorkOrderRow).notes ?? null;
      if (typeof existingNotes === "string" && existingNotes.includes("PORTAL INTAKE")) {
        // very light parse (best-effort)
        const lines = existingNotes.split("\n").map((x) => x.trim());
        const getVal = (prefix: string) => {
          const hit = lines.find((l) => l.toLowerCase().startsWith(prefix.toLowerCase()));
          if (!hit) return "";
          const idx = hit.indexOf(":");
          return idx >= 0 ? hit.slice(idx + 1).trim() : "";
        };
        const c0 = getVal("Concern");
        const d0 = getVal("Details");
        const p0 = getVal("Contact");
        const m0 = getVal("Mileage");

        if (c0) setIntakeConcern(c0);
        if (d0) setIntakeDetails(d0);
        if (p0) setIntakeContactPref(p0);
        if (m0) setIntakeMileage(m0);
      }

      if (w.vehicle_id) {
        const { data: v, error: vErr } = await supabase
          .from("vehicles")
          .select("id,customer_id,shop_id,year,make,model,vin,,license_plate,mileage,color,created_at")
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

  async function saveIntake() {
    if (!wo?.id || intakeSaving) return;

    const concern = intakeConcern.trim();
    if (!concern) {
      toast.error("Please enter your main concern.");
      return;
    }

    setIntakeSaving(true);
    try {
      const intakeBlock = buildIntakeNotesBlock({
        concern,
        details: intakeDetails,
        contactPref: intakeContactPref,
        mileage: intakeMileage,
      });

      const merged = mergeNotes(wo.notes ?? null, intakeBlock);

      const { data: updated, error } = await supabase
        .from("work_orders")
        .update({ notes: merged })
        .eq("id", wo.id)
        .select("*")
        .maybeSingle();

      if (error) throw error;

      if (updated) setWo(updated as WorkOrderRow);
      setIntakeSavedAt(new Date().toISOString());
      toast.success("Intake saved.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save intake.");
    } finally {
      setIntakeSaving(false);
    }
  }

  async function addMenuLine(menuItemId: string) {
    if (!wo?.id) return;

    const r = await postJson<{ line?: unknown }>("/api/portal/request/add-menu-line", {
      workOrderId: wo.id,
      menuItemId,
    });

    if (!r.ok) {
      toast.error(r.error);
      return;
    }

    toast.success("Added menu item.");
    await loadAll();
  }

  async function addCustomLine() {
    if (!wo?.id) return;

    const desc = customDesc.trim();
    if (!desc) {
      toast.error("Enter a description for the custom line.");
      return;
    }

    const r = await postJson<{ line?: unknown }>("/api/portal/request/add-custom-line", {
      workOrderId: wo.id,
      description: desc,
      notes: customNotes.trim() || null,
    });

    if (!r.ok) {
      toast.error(r.error);
      return;
    }

    toast.success("Added custom line.");
    setCustomDesc("");
    setCustomNotes("");
    await loadAll();
  }

  async function addQuoteOnly() {
    if (!wo?.id) return;

    const desc = qoDesc.trim();
    if (!desc) {
      toast.error("Enter a description for the quote request.");
      return;
    }

    const qtyN = Number(qoQty);
    const qty = Number.isFinite(qtyN) ? Math.max(1, Math.min(99, Math.trunc(qtyN))) : 1;

    const r = await postJson<{ quoteLine?: unknown }>("/api/portal/request/add-quote-only", {
      workOrderId: wo.id,
      description: desc,
      notes: qoNotes.trim() || null,
      qty,
    });

    if (!r.ok) {
      toast.error(r.error);
      return;
    }

    toast.success("Sent to quote queue.");
    setQoDesc("");
    setQoNotes("");
    setQoQty("1");
    await loadAll();
  }

  // Open review gate (requires intake)
  function beginSubmit() {
    if (!wo?.id || submitting) return;

    if (!bookingId) {
      toast.error("Missing booking. Please go back and pick a time again.");
      router.replace("/portal/request/when");
      return;
    }

    if (!intakeConcern.trim()) {
      toast.error("Please complete the intake form first.");
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
    return <div className={cardClass() + " mx-auto max-w-3xl text-sm text-neutral-200"}>Loading…</div>;
  }

  if (!wo?.id || !customer?.id) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 text-white">
        <Toaster position="top-center" />
        <div className={cardClass()}>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">Build request</h1>
          <p className="mt-2 text-sm text-neutral-400">This request is missing or expired.</p>
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
    <div className="mx-auto w-full max-w-3xl space-y-5 text-white">
      <Toaster position="top-center" />

      <header className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div
              className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em]"
              style={{ color: COPPER }}
            >
              Request
            </div>
            <h1 className="mt-2 text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
              Intake &amp; request
            </h1>
            <p className="mt-1 text-xs text-neutral-400">
              {name} • {vehicle ? ymm(vehicle) : "Vehicle not set"} • WO{" "}
              <span className="font-mono text-neutral-300">{wo.id.slice(0, 8)}…</span>
              {bookingLabel ? <span className="ml-2">• {bookingLabel}</span> : null}
            </p>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => void loadAll()} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
            <LinkButton href="/portal/request/when" variant="outline" size="sm">
              Back
            </LinkButton>
          </div>
        </div>
      </header>

      {/* NEW: Intake form flow */}
      <section className={cardClass() + " space-y-3"}>
        <div className="flex items-start justify-between gap-3">
          <div>
            {sectionTitle("Intake form")}
            <div className="mt-1 text-xs text-neutral-500">
              Tell us what’s going on. This helps the shop triage your request faster.
            </div>
          </div>
          <div className="text-[0.75rem] text-neutral-500">
            {intakeSavedAt ? <span className="text-emerald-200">Saved</span> : <span className="text-neutral-400">Not saved yet</span>}
          </div>
        </div>

        <input
          className={inputClass()}
          placeholder="Main concern (required) — e.g., ‘Brake pedal feels soft’"
          value={intakeConcern}
          onChange={(e) => setIntakeConcern(e.target.value)}
        />

        <textarea
          className={inputClass() + " min-h-[92px] resize-none"}
          placeholder="Details (optional) — noises, when it happens, warning lights, etc."
          value={intakeDetails}
          onChange={(e) => setIntakeDetails(e.target.value)}
        />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select
            className={inputClass()}
            value={intakeContactPref}
            onChange={(e) => setIntakeContactPref(e.target.value)}
          >
            <option value="Text or call">Text or call</option>
            <option value="Text only">Text only</option>
            <option value="Call only">Call only</option>
            <option value="Email">Email</option>
          </select>

          <input
            className={inputClass()}
            inputMode="numeric"
            placeholder="Mileage (optional)"
            value={intakeMileage}
            onChange={(e) => setIntakeMileage(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void saveIntake()} disabled={intakeSaving}>
            {intakeSaving ? "Saving…" : "Save intake"}
          </Button>
          <span className="text-[0.75rem] text-neutral-500">
            Saved into the work order notes as <span className="text-neutral-300">PORTAL INTAKE</span>.
          </span>
        </div>
      </section>

      <section className={cardClass()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">Current draft</h2>
          <div className="text-[0.75rem] text-neutral-500">
            Lines: {lines.length} • Quote requests: {quoteLines.length}
          </div>
        </div>

        {lines.length === 0 && quoteLines.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/25 p-3 text-sm text-neutral-300">
            Nothing added yet. Add menu items, custom lines, or quote requests below.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {lines.map((l) => {
              const title = lineTitle(l);
              const status = (l.status ?? "pending").toString();
              const est = getOptNumber(l, "price_estimate");

              return (
                <div key={l.id} className="rounded-xl border border-white/10 bg-black/35 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-100">{title}</div>
                      <div className="mt-0.5 text-xs text-neutral-400">
                        Status: <span className="text-neutral-300">{status}</span>
                        {l.menu_item_id ? (
                          <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.7rem] uppercase tracking-[0.14em] text-neutral-200">
                            menu
                          </span>
                        ) : (
                          <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.7rem] uppercase tracking-[0.14em] text-neutral-200">
                            custom
                          </span>
                        )}
                      </div>

                      {typeof l.notes === "string" && l.notes.trim().length > 0 ? (
                        <div className="mt-2 text-xs text-neutral-400">{l.notes}</div>
                      ) : null}
                    </div>

                    <div className="text-right text-xs text-neutral-400">Est: {fmtMoney(est)}</div>
                  </div>
                </div>
              );
            })}

            {quoteLines.map((q) => {
              const title = (q.description ?? "Quote request").toString();
              const stage = (q.stage ?? "advisor_pending").toString();
              const qty = typeof q.qty === "number" && Number.isFinite(q.qty) ? q.qty : 1;

              return (
                <div key={q.id} className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-100">{title}</div>
                      <div className="mt-0.5 text-xs text-neutral-400">
                        Stage: <span className="text-neutral-300">{stage}</span> • Qty{" "}
                        <span className="text-neutral-300">{qty}</span>
                        <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.7rem] uppercase tracking-[0.14em] text-neutral-200">
                          quote
                        </span>
                      </div>

                      {typeof q.notes === "string" && q.notes.trim().length > 0 ? (
                        <div className="mt-2 text-xs text-neutral-500">{q.notes}</div>
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
            <div className="mt-1 text-xs text-neutral-500">Fixed pricing lines your shop already offers.</div>
          </div>
          <div className="w-full max-w-sm">
            <input className={inputClass()} placeholder="Search menu…" value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} />
          </div>
        </div>

        {filteredMenu.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/25 p-3 text-sm text-neutral-300">
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
                  className="rounded-xl border border-white/10 bg-black/35 p-3 text-left transition hover:bg-black/45 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-100">{title}</div>
                      <div className="mt-1 text-xs text-neutral-400">
                        {m.category ? <span>{String(m.category)}</span> : <span>Menu</span>}
                        {hrs != null ? <span className="ml-2">• {hrs}h</span> : null}
                      </div>
                    </div>
                    <div className="text-xs text-neutral-300">{fmtMoney(price)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className={cardClass() + " space-y-3"}>
        {sectionTitle("Add custom line")}
        <div className="text-xs text-neutral-500">
          For concerns you already know. We’ll estimate labor and route parts quoting as needed.
        </div>

        <input
          className={inputClass()}
          placeholder="Example: Replace rear differential input u-joint"
          value={customDesc}
          onChange={(e) => setCustomDesc(e.target.value)}
        />
        <textarea
          className={inputClass() + " min-h-[92px] resize-none"}
          placeholder="Optional notes (symptoms, urgency, noises, etc.)"
          value={customNotes}
          onChange={(e) => setCustomNotes(e.target.value)}
        />

        <div className="flex gap-2">
          <Button type="button" onClick={() => void addCustomLine()}>
            Add custom line
          </Button>
        </div>
      </section>

      <section className={cardClass() + " space-y-3"}>
        {sectionTitle("Quote-only request")}
        <div className="text-xs text-neutral-500">
          Request pricing without committing to a work order line yet. Parts will be priced and returned to your portal.
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
          <input
            className={inputClass()}
            placeholder="Example: Replace tires (quote only)"
            value={qoDesc}
            onChange={(e) => setQoDesc(e.target.value)}
          />
          <input className={inputClass()} inputMode="numeric" placeholder="Qty" value={qoQty} onChange={(e) => setQoQty(e.target.value)} />
        </div>

        <textarea
          className={inputClass() + " min-h-[92px] resize-none"}
          placeholder="Optional notes (size, brand preference, etc.)"
          value={qoNotes}
          onChange={(e) => setQoNotes(e.target.value)}
        />

        <div className="flex gap-2">
          <Button type="button" onClick={() => void addQuoteOnly()} variant="outline">
            Send quote request
          </Button>
        </div>
      </section>

      <section className={cardClass()}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">Review &amp; submit</div>
            <div className="mt-1 text-xs text-neutral-500">
              You’ll review terms and submit your intake + request to the shop.
            </div>
          </div>

          <Button type="button" onClick={beginSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : "Review & Submit"}
          </Button>
        </div>
      </section>

      <div className="pb-2 text-[0.75rem] text-neutral-500">
        Tip: Menu items are pre-priced. Custom and quote-only lines can trigger parts pricing and AI assistance.
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
              <div className="mt-1 text-xs text-neutral-300">
                Confirm your intake + request details and agree to terms before submitting.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setReviewOpen(false)}
              className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-neutral-200 hover:bg-black/70"
            >
              Close
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
              <div className="text-[0.7rem] uppercase tracking-[0.16em] text-neutral-400">Summary</div>
              <div className="mt-2 text-sm text-neutral-100">
                {name} • {vehicle ? ymm(vehicle) : "Vehicle not set"}
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                {bookingLabel ? <span>{bookingLabel} • </span> : null}
                WO <span className="font-mono text-neutral-300">{wo.id}</span> • Lines {lines.length} • Quote requests{" "}
                {quoteLines.length}
              </div>

              <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
                <div className="text-[0.7rem] uppercase tracking-[0.16em] text-neutral-400">Intake</div>
                <div className="mt-2 text-sm text-neutral-100">{intakeConcern.trim() || "—"}</div>
                {intakeDetails.trim() ? <div className="mt-1 text-xs text-neutral-400">{intakeDetails.trim()}</div> : null}
                <div className="mt-2 text-xs text-neutral-500">
                  Contact: <span className="text-neutral-300">{intakeContactPref || "—"}</span>
                  {intakeMileage.trim() ? (
                    <>
                      {" "}
                      • Mileage: <span className="text-neutral-300">{intakeMileage.trim()}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-neutral-300">
              <div className="text-[0.7rem] uppercase tracking-[0.16em] text-neutral-400">Disclaimers</div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-neutral-300">
                <li>Prices and estimates are subject to change after inspection and diagnosis.</li>
                <li>This is a request and is not confirmed until the shop approves the appointment.</li>
                <li>Parts availability and additional findings may affect timing and total cost.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <LegalTerms onAgreeChange={setAgreed} defaultOpen />
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-neutral-300">
                  Signature <span className="text-neutral-500">(recommended)</span>
                </div>
                <div className="text-[0.7rem] text-neutral-500">
                  {sigUrl ? (
                    <span className="text-emerald-200">Saved</span>
                  ) : (
                    <span className="text-neutral-400">Not provided</span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => void captureSignature()} disabled={reviewBusy}>
                  {reviewBusy ? "Working…" : sigUrl ? "Re-sign" : "Add signature"}
                </Button>

                <Button
                  type="button"
                  onClick={() => void finalizeSubmit({ requireSignature: false })}
                  disabled={submitting || reviewBusy || !agreed}
                >
                  {submitting ? "Submitting…" : "Agree & Submit request"}
                </Button>

                <span className="text-[0.7rem] text-neutral-500">Staff will review and approve the appointment.</span>
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
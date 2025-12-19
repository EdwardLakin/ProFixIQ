// app/portal/request/build/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Toaster, toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";
import LinkButton from "@shared/components/ui/LinkButton";

type DB = Database;

type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type QuoteLineRow = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"];

const COPPER = "#C57A4A";

function cardClass() {
  return "rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-md shadow-card";
}

function inputClass() {
  return "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-white/20";
}

function sectionTitle(s: string) {
  return (
    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
      {s}
    </div>
  );
}

async function postJson<TResp>(
  url: string,
  body: unknown,
): Promise<
  { ok: true; data: TResp } | { ok: false; error: string; status: number }
> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const j = (await res.json().catch(() => ({}))) as { error?: string } & Record<
    string,
    unknown
  >;

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
  return (row && typeof row === "object" ? (row as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
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

export default function PortalRequestBuildPage() {
  const supabase = createClientComponentClient<DB>();
  const router = useRouter();
  const sp = useSearchParams();

  const workOrderId = sp.get("wo") ?? "";

  // ✅ Option B: carry bookingId from when page (NOT startsAt)
  const bookingId =
    sp.get("booking") ??
    sp.get("bookingId") ??
    "";

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [wo, setWo] = useState<WorkOrderRow | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);

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

  const filteredMenu = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    if (!q) return menuItems.slice(0, 40);

    return menuItems
      .filter((m) => {
        const hay = [
          menuTitle(m),
          m.description ?? "",
          m.category ?? "",
          m.service_key ?? "",
        ]
          .join(" ")
          .toLowerCase();

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
  }, [workOrderId]);

  async function addMenuLine(menuItemId: string) {
    if (!wo?.id) return;

    const r = await postJson<{ line?: unknown }>(
      "/api/portal/request/add-menu-line",
      { workOrderId: wo.id, menuItemId },
    );

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

    const r = await postJson<{ line?: unknown }>(
      "/api/portal/request/add-custom-line",
      {
        workOrderId: wo.id,
        description: desc,
        notes: customNotes.trim() || null,
      },
    );

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
    const qty = Number.isFinite(qtyN)
      ? Math.max(1, Math.min(99, Math.trunc(qtyN)))
      : 1;

    const r = await postJson<{ quoteLine?: unknown }>(
      "/api/portal/request/add-quote-only",
      { workOrderId: wo.id, description: desc, notes: qoNotes.trim() || null, qty },
    );

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

  async function onSubmit() {
    if (!wo?.id || submitting) return;

    // ✅ Option B: bookingId must be present (slot already reserved)
    if (!bookingId) {
      toast.error("Missing booking. Please go back and pick a time again.");
      router.replace("/portal/request/when");
      return;
    }

    setSubmitting(true);
    try {
      const r = await postJson<{ ok?: boolean; bookingId?: string; workOrderId?: string }>(
        "/api/portal/request/submit",
        { workOrderId: wo.id, bookingId },
      );

      if (!r.ok) {
        toast.error(r.error);
        return;
      }

      toast.success("Submitted.");
      router.replace("/portal/customer-appointments");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Submit failed.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className={cardClass() + " mx-auto max-w-3xl text-sm text-neutral-200"}>
        Loading…
      </div>
    );
  }

  if (!wo?.id || !customer?.id) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 text-white">
        <Toaster position="top-center" />
        <div className={cardClass()}>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Build request
          </h1>
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
    [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ").trim() ||
    "Customer";

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
              Build your request
            </h1>
            <p className="mt-1 text-xs text-neutral-400">
              {name} • {vehicle ? ymm(vehicle) : "Vehicle not set"} • WO{" "}
              <span className="font-mono text-neutral-300">{wo.id.slice(0, 8)}…</span>
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
            <input
              className={inputClass()}
              placeholder="Search menu…"
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
            />
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
          <input
            className={inputClass()}
            inputMode="numeric"
            placeholder="Qty"
            value={qoQty}
            onChange={(e) => setQoQty(e.target.value)}
          />
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
            <div className="text-sm font-semibold text-neutral-100">Submit request</div>
            <div className="mt-1 text-xs text-neutral-500">
              Submitting will finalize your draft and keep the reserved booking.
            </div>
          </div>

          <Button type="button" onClick={() => void onSubmit()} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit request"}
          </Button>
        </div>
      </section>

      <div className="pb-2 text-[0.75rem] text-neutral-500">
        Tip: Menu items are pre-priced. Custom and quote-only lines can trigger parts pricing and AI assistance.
      </div>
    </div>
  );
}
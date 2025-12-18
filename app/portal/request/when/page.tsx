"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Toaster, toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";
import LinkButton from "@shared/components/ui/LinkButton";

type DB = Database;

type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type ShopRow = Pick<DB["public"]["Tables"]["shops"]["Row"], "id" | "slug" | "timezone">;

type ShopHoursRow = DB["public"]["Tables"]["shop_hours"]["Row"];

// If your shop_hours uses different column names, adjust only these 3 helpers:
function getWeekday(h: ShopHoursRow): number | null {
  const v = (h as unknown as { weekday?: number | null }).weekday;
  return typeof v === "number" ? v : null;
}
function getOpen(h: ShopHoursRow): string | null {
  const v = (h as unknown as { open_time?: string | null; open?: string | null }).open_time ?? (h as unknown as { open?: string | null }).open ?? null;
  return typeof v === "string" ? v : null;
}
function getClose(h: ShopHoursRow): string | null {
  const v = (h as unknown as { close_time?: string | null; close?: string | null }).close_time ?? (h as unknown as { close?: string | null }).close ?? null;
  return typeof v === "string" ? v : null;
}

type VisitType = "waiter" | "drop_off";

const COPPER = "#C57A4A";

function cardClass() {
  return "rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-md shadow-card";
}

function inputClass() {
  return "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-white/20";
}

function pillClass(active: boolean) {
  return active
    ? "border-white/15 bg-white/10 text-neutral-50"
    : "border-white/10 bg-black/30 text-neutral-200 hover:bg-black/45";
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function parseHmToMinutes(hm: string): number | null {
  // accepts "HH:MM:SS" or "HH:MM"
  const parts = hm.split(":").map((x) => x.trim());
  if (parts.length < 2) return null;
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function minutesToLabel(mins: number) {
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  const h12 = ((hh + 11) % 12) + 1;
  const ampm = hh >= 12 ? "PM" : "AM";
  const mmStr = mm.toString().padStart(2, "0");
  return `${h12}:${mmStr} ${ampm}`;
}

type Slot = {
  startsAtIso: string; // ISO
  label: string;
};

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
  if (!res.ok) {
    return { ok: false, error: j?.error || "Request failed", status: res.status };
  }
  return { ok: true, data: j as unknown as TResp };
}

export default function PortalRequestWhenPage() {
  const supabase = createClientComponentClient<DB>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [shop, setShop] = useState<ShopRow | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [shopHours, setShopHours] = useState<ShopHoursRow[]>([]);

  const [vehicleId, setVehicleId] = useState<string>("");
  const [date, setDate] = useState<string>(() => toIsoDate(new Date()));
  const [visitType, setVisitType] = useState<VisitType>("drop_off");
  const [selectedSlotIso, setSelectedSlotIso] = useState<string>("");

  const [starting, setStarting] = useState(false);

  // Load auth -> customer -> shop -> vehicles -> shop hours
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userErr || !user) {
        toast.error("Please sign in to request service.");
        router.replace("/portal/auth/sign-in");
        return;
      }

      const { data: c, error: cErr } = await supabase
        .from("customers")
        .select("id,user_id,shop_id,first_name,last_name,email,phone")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (cErr) {
        toast.error(cErr.message);
        setCustomer(null);
        setLoading(false);
        return;
      }

      const cust = (c ?? null) as CustomerRow | null;
      setCustomer(cust);

      if (!cust?.shop_id) {
        setShop(null);
        setVehicles([]);
        setShopHours([]);
        setLoading(false);
        return;
      }

      const { data: s, error: sErr } = await supabase
        .from("shops")
        .select("id,slug,timezone")
        .eq("id", cust.shop_id)
        .maybeSingle();

      if (cancelled) return;

      if (sErr || !s) {
        toast.error("Unable to load your shop.");
        setShop(null);
        setVehicles([]);
        setShopHours([]);
        setLoading(false);
        return;
      }

      setShop(s as ShopRow);

      const { data: v, error: vErr } = await supabase
        .from("vehicles")
        .select("id,customer_id,shop_id,year,make,model,vin,license_plate,mileage,color,created_at")
        .eq("customer_id", cust.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (vErr) {
        toast.error(vErr.message);
        setVehicles([]);
      } else {
        const vv = (v ?? []) as unknown as VehicleRow[];
        setVehicles(vv);
        if (!vehicleId && vv[0]?.id) setVehicleId(vv[0].id);
      }

      const { data: h, error: hErr } = await supabase
        .from("shop_hours")
        .select("*")
        .eq("shop_id", s.id);

      if (cancelled) return;

      if (hErr) {
        toast.error("Unable to load shop hours.");
        setShopHours([]);
      } else {
        setShopHours((h ?? []) as ShopHoursRow[]);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router]);

  const dateOptions = useMemo(() => {
    const base = new Date();
    const days = Array.from({ length: 21 }).map((_, i) => addDays(base, i));
    return days.map((d) => {
      const iso = toIsoDate(d);
      const label = d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      return { iso, label };
    });
  }, []);

  const slots: Slot[] = useMemo(() => {
    // Basic: 1-hour slots between open/close for that weekday
    if (!date) return [];
    if (!shopHours.length) return [];

    const d = new Date(`${date}T00:00:00`);
    const jsDay = d.getDay(); // 0 Sun ... 6 Sat

    const todays = shopHours.filter((h) => getWeekday(h) === jsDay);
    if (!todays.length) return [];

    // pick first row for the day (if multiple, future: merge)
    const row = todays[0];
    const open = getOpen(row);
    const close = getClose(row);

    if (!open || !close) return [];

    const openM = parseHmToMinutes(open);
    const closeM = parseHmToMinutes(close);
    if (openM == null || closeM == null) return [];

    // If shop crosses midnight (rare), ignore for now
    if (closeM <= openM) return [];

    const startOfDay = new Date(`${date}T00:00:00.000`);
    const out: Slot[] = [];
    for (let m = openM; m + 60 <= closeM; m += 60) {
      const slotStart = new Date(startOfDay);
      slotStart.setMinutes(m, 0, 0);

      out.push({
        startsAtIso: slotStart.toISOString(),
        label: minutesToLabel(m),
      });
    }

    return out;
  }, [date, shopHours]);

  // Clear slot if date changes
  useEffect(() => {
    setSelectedSlotIso("");
  }, [date]);

  const canStart = Boolean(customer?.id && shop?.id && vehicleId && selectedSlotIso);

  async function onStart() {
    if (!canStart || starting) return;

    setStarting(true);
    try {
      const payload = {
        vehicleId,
        startsAt: selectedSlotIso,
        visitType,
      };

      const r = await postJson<{ workOrderId?: string; work_order_id?: string }>(
        "/api/portal/request/start",
        payload,
      );

      if (!r.ok) {
        toast.error(r.error);
        return;
      }

      const id = r.data.workOrderId ?? r.data.work_order_id ?? "";
      if (!id) {
        toast.error("Start failed: missing work order id.");
        return;
      }

      router.push(`/portal/request/build?wo=${encodeURIComponent(id)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Start failed.";
      toast.error(msg);
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className={cardClass() + " mx-auto max-w-xl text-sm text-neutral-200"}>
        Loading…
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-xl space-y-3 text-white">
        <Toaster position="top-center" />
        <div className={cardClass()}>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Request service
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            We couldn’t find your customer profile yet.
          </p>
          <div className="mt-4 flex gap-2">
            <LinkButton href="/portal/profile" variant="outline" size="sm">
              Go to profile
            </LinkButton>
            <LinkButton href="/portal/vehicles" size="sm">
              Add a vehicle
            </LinkButton>
          </div>
        </div>
      </div>
    );
  }

  if (!shop?.id) {
    return (
      <div className="mx-auto max-w-xl space-y-3 text-white">
        <Toaster position="top-center" />
        <div className={cardClass()}>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Request service
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Your portal account isn’t linked to a shop yet.
          </p>
          <div className="mt-4 flex gap-2">
            <LinkButton href="/portal/profile" variant="outline" size="sm">
              Go to profile
            </LinkButton>
            <LinkButton href="/portal/customer-appointments" size="sm">
              My appointments
            </LinkButton>
          </div>
        </div>
      </div>
    );
  }

  const customerName =
    [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ").trim() || "Customer";

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 text-white">
      <Toaster position="top-center" />

      <header className="space-y-1">
        <div
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em]"
          style={{ color: COPPER }}
        >
          Request
        </div>
        <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
          Pick a time
        </h1>
        <p className="text-xs text-neutral-400">
          {customerName} • Shop: <span className="text-neutral-300">{shop.slug}</span>
        </p>
      </header>

      <section className={cardClass() + " space-y-4"}>
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
            Vehicle
          </div>
          {vehicles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/25 p-3 text-sm text-neutral-300">
              No vehicles found. Add one first.
              <div className="mt-3">
                <LinkButton href="/portal/vehicles" size="sm">
                  Add vehicle
                </LinkButton>
              </div>
            </div>
          ) : (
            <select
              className={inputClass()}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              {vehicles.map((v) => {
                const label =
                  [v.year ?? "", v.make ?? "", v.model ?? ""].filter(Boolean).join(" ").trim() ||
                  "Vehicle";
                const vin = v.vin ? ` • VIN ${String(v.vin).slice(-6)}` : "";
                return (
                  <option key={v.id} value={v.id}>
                    {label}
                    {vin}
                  </option>
                );
              })}
            </select>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
            Date
          </div>
          <select className={inputClass()} value={date} onChange={(e) => setDate(e.target.value)}>
            {dateOptions.map((d) => (
              <option key={d.iso} value={d.iso}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
              Time
            </div>
            <div className="text-[0.75rem] text-neutral-500">1-hour slots</div>
          </div>

          {slots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/25 p-3 text-sm text-neutral-300">
              No hours available for this day.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {slots.map((s) => {
                const active = selectedSlotIso === s.startsAtIso;
                return (
                  <button
                    key={s.startsAtIso}
                    type="button"
                    onClick={() => setSelectedSlotIso(s.startsAtIso)}
                    className={
                      "rounded-xl border px-3 py-2 text-sm transition " + pillClass(active)
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
            Visit type
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={"rounded-xl border px-3 py-2 text-sm transition " + pillClass(visitType === "waiter")}
              onClick={() => setVisitType("waiter")}
            >
              Waiter
              <div className="mt-1 text-[0.75rem] text-neutral-400">
                You plan to wait at the shop.
              </div>
            </button>
            <button
              type="button"
              className={"rounded-xl border px-3 py-2 text-sm transition " + pillClass(visitType === "drop_off")}
              onClick={() => setVisitType("drop_off")}
            >
              Drop off
              <div className="mt-1 text-[0.75rem] text-neutral-400">
                Leave the vehicle for service.
              </div>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            onClick={() => void onStart()}
            disabled={!canStart || starting || vehicles.length === 0}
            className="min-w-[180px]"
          >
            {starting ? "Starting…" : "Next: build request"}
          </Button>

          <LinkButton href="/portal/customer-appointments" variant="outline" size="sm">
            Back
          </LinkButton>
        </div>

        <p className="text-[0.75rem] text-neutral-500">
          Next you’ll build your service request (menu items, custom lines, and quote-only requests).
        </p>
      </section>
    </div>
  );
}

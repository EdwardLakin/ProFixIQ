"use client";

import {
  ArrowLeft,
  Clock3,
  MapPin,
  Save,
  Search,
  UserRound,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

function key(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `mobile-intake-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type SuggestedVehicle = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  license_plate: string | null;
};
type SuggestedCustomer = {
  id: string;
  name: string | null;
  phone: string | null;
  vehicles: SuggestedVehicle[];
};

type IntakeResult = {
  error?: string;
  customerId?: string;
  vehicleId?: string;
  bookingId?: string;
  serviceVisitId?: string;
};

function vehicleLabel(vehicle: SuggestedVehicle): string {
  return (
    [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
    vehicle.license_plate ||
    "Vehicle"
  );
}

function parseVehicle(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const maybeYear = Number(parts[0]);
  const hasYear =
    Number.isInteger(maybeYear) && maybeYear >= 1900 && maybeYear <= 2100;
  const offset = hasYear ? 1 : 0;
  return {
    year: hasYear ? maybeYear : null,
    make: parts[offset] || null,
    model: parts.slice(offset + 1).join(" ") || null,
  };
}

const ETA_OPTIONS = [15, 30, 45, 60, 90];

export default function RapidServiceIntake() {
  const router = useRouter();
  const operationKey = useRef(key());
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [plate, setPlate] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postal, setPostal] = useState("");
  const [concern, setConcern] = useState("");
  const [etaMinutes, setEtaMinutes] = useState(30);
  const [quotedPrice, setQuotedPrice] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [configuredServiceModel, setConfiguredServiceModel] = useState<
    "shop" | "mobile" | "both"
  >("mobile");
  const [serviceMode, setServiceMode] = useState<"shop" | "mobile">("mobile");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedCustomer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/mobile/service/settings", {
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        const value = Number(body?.settings?.default_visit_minutes);
        if (Number.isFinite(value) && value >= 5) setDurationMinutes(value);
        const model = body?.settings?.service_model;
        if (model === "shop" || model === "mobile" || model === "both") {
          setConfiguredServiceModel(model);
          if (model !== "both") setServiceMode(model);
        }
      })
      .catch(() => undefined);
  }, []);

  const searchValue = (phone.trim() || customerName.trim()).slice(0, 80);
  useEffect(() => {
    if (searchValue.length < 2 || customerId) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(
        `/api/mobile/service/intake?q=${encodeURIComponent(searchValue)}`,
        {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        },
      )
        .then((response) =>
          response.ok ? response.json() : { customers: [] },
        )
        .then((body) =>
          setSuggestions(
            Array.isArray(body?.customers) ? body.customers : [],
          ),
        )
        .catch(() => undefined);
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [customerId, searchValue]);

  const canSave = useMemo(
    () =>
      !busy &&
      customerName.trim().length > 0 &&
      phone.trim().length > 0 &&
      (vehicleId != null ||
        vehicle.trim().length > 0 ||
        plate.trim().length > 0) &&
      (serviceMode === "shop" || address.trim().length > 0) &&
      concern.trim().length > 0,
    [
      address,
      busy,
      concern,
      customerName,
      phone,
      plate,
      serviceMode,
      vehicle,
      vehicleId,
    ],
  );

  function selectCustomer(
    customer: SuggestedCustomer,
    selectedVehicle?: SuggestedVehicle,
  ) {
    setCustomerId(customer.id);
    setCustomerName(customer.name || "");
    setPhone(customer.phone || "");
    const chosen = selectedVehicle ?? customer.vehicles[0];
    if (chosen) {
      setVehicleId(chosen.id);
      setVehicle(vehicleLabel(chosen));
      setPlate(chosen.license_plate || "");
    }
    setSuggestions([]);
  }

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const parsedVehicle = parseVehicle(vehicle);
    const startsAt = new Date(Date.now() + etaMinutes * 60_000).toISOString();
    try {
      const response = await fetch("/api/mobile/service/intake", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationKey.current,
        },
        body: JSON.stringify({
          customerId,
          customerName: customerName.trim(),
          phone: phone.trim(),
          vehicleId,
          vehicleYear: parsedVehicle.year,
          vehicleMake: parsedVehicle.make,
          vehicleModel: parsedVehicle.model,
          vehiclePlate: plate.trim() || null,
          serviceMode,
          addressLine1: serviceMode === "mobile" ? address.trim() : null,
          city: serviceMode === "mobile" ? city.trim() || null : null,
          provinceState:
            serviceMode === "mobile" ? province.trim() || null : null,
          postalCode: serviceMode === "mobile" ? postal.trim() || null : null,
          concern: concern.trim(),
          startsAt,
          durationMinutes,
          quotedPrice: quotedPrice.trim() ? Number(quotedPrice) : null,
          operationKey: operationKey.current,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | IntakeResult
        | null;
      if (!response.ok) {
        throw new Error(body?.error || "Service call could not be saved.");
      }
      if (
        !body?.serviceVisitId ||
        !body.bookingId ||
        !body.customerId ||
        !body.vehicleId
      ) {
        throw new Error(
          "Service call was saved without its canonical handoff identities.",
        );
      }
      router.replace(
        `/mobile/service/call/${encodeURIComponent(body.serviceVisitId)}`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Service call could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-3 px-3 pb-28 pt-3 text-[color:var(--theme-text-primary)] sm:px-4">
      <header className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950 p-4 text-white shadow-card">
        <Link
          href="/mobile/service"
          className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/[0.07]"
          aria-label="Back to Mobile Service"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-sky-300">
            Rapid intake
          </div>
          <h1 className="text-xl font-extrabold">New service call</h1>
          <p className="text-xs text-slate-300">
            Capture the conversation, not a work-order form.
          </p>
        </div>
      </header>

      <section className="relative space-y-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
          <UserRound className="h-4 w-4" /> Customer
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            autoFocus
            value={customerName}
            onChange={(event) => {
              setCustomerName(event.target.value);
              setCustomerId(null);
              setVehicleId(null);
            }}
            placeholder="Name"
            autoComplete="name"
            className="min-h-12 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-base"
          />
          <input
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setCustomerId(null);
            }}
            placeholder="Phone"
            inputMode="tel"
            autoComplete="tel"
            className="min-h-12 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-base"
          />
        </div>
        {suggestions.length ? (
          <div className="absolute left-4 right-4 top-[7.8rem] z-30 overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] shadow-[var(--theme-shadow-strong)]">
            {suggestions.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => selectCustomer(customer)}
                className="flex w-full items-center justify-between gap-2 border-b border-[color:var(--theme-border-soft)] px-3 py-2.5 text-left last:border-b-0"
              >
                <span>
                  <strong className="block text-sm">
                    {customer.name || "Customer"}
                  </strong>
                  <span className="text-xs text-[color:var(--theme-text-secondary)]">
                    {customer.phone || "No phone"}
                  </span>
                </span>
                <Search className="h-4 w-4 text-[color:var(--theme-text-muted)]" />
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
          <Wrench className="h-4 w-4" /> Vehicle & concern
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
          <input
            value={vehicle}
            onChange={(event) => {
              setVehicle(event.target.value);
              setVehicleId(null);
            }}
            placeholder="2017 Ford Expedition"
            className="min-h-12 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-base"
          />
          <input
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
            placeholder="Plate"
            autoCapitalize="characters"
            className="min-h-12 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-base"
          />
        </div>
        <textarea
          value={concern}
          onChange={(event) => setConcern(event.target.value)}
          placeholder="What's wrong?  e.g. Rear tire leaking, screw near shoulder"
          rows={2}
          className="w-full resize-none rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-base"
        />
      </section>

      {configuredServiceModel === "both" ? (
        <section className="space-y-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
          <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
            Service location
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setServiceMode("mobile")}
              className={`min-h-12 rounded-2xl border px-3 text-sm font-extrabold ${
                serviceMode === "mobile"
                  ? "border-sky-400 bg-sky-500/15 text-sky-200"
                  : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
              }`}
            >
              We go there
            </button>
            <button
              type="button"
              onClick={() => setServiceMode("shop")}
              className={`min-h-12 rounded-2xl border px-3 text-sm font-extrabold ${
                serviceMode === "shop"
                  ? "border-sky-400 bg-sky-500/15 text-sky-200"
                  : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
              }`}
            >
              Customer comes here
            </button>
          </div>
        </section>
      ) : null}

      {serviceMode === "mobile" ? (
        <section className="space-y-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
          <MapPin className="h-4 w-4" /> Where
        </div>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Service address"
          autoComplete="street-address"
          className="min-h-12 w-full rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-base"
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="City"
            className="min-h-11 min-w-0 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 text-sm"
          />
          <input
            value={province}
            onChange={(event) => setProvince(event.target.value)}
            placeholder="Province / State"
            className="min-h-11 min-w-0 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 text-sm"
          />
          <input
            value={postal}
            onChange={(event) => setPostal(event.target.value)}
            placeholder="Postal / ZIP"
            autoCapitalize="characters"
            className="min-h-11 min-w-0 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 text-sm"
          />
        </div>
      </section>
      ) : (
        <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
            <MapPin className="h-4 w-4" /> At the shop
          </div>
          <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
            This call uses shop scheduling/capacity. No customer service address is required.
          </p>
        </section>
      )}

      <section className="space-y-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
          <Clock3 className="h-4 w-4" /> ETA & price
        </div>
        <div className="flex flex-wrap gap-2">
          {ETA_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => setEtaMinutes(minutes)}
              className={`min-h-10 rounded-full border px-3 text-sm font-bold ${
                etaMinutes === minutes
                  ? "border-sky-400 bg-sky-500/15 text-sky-200"
                  : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
              }`}
            >
              {minutes < 60
                ? `${minutes} min`
                : minutes === 60
                  ? "1 hr"
                  : "1½ hr"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-[color:var(--theme-text-secondary)]">
            Quoted price
            <div className="mt-1 flex min-h-12 items-center rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3">
              <span className="mr-1 text-sm">$</span>
              <input
                value={quotedPrice}
                onChange={(event) => setQuotedPrice(event.target.value)}
                inputMode="decimal"
                placeholder="Optional"
                className="min-w-0 flex-1 bg-transparent text-base outline-none"
              />
            </div>
          </label>
          <label className="text-xs text-[color:var(--theme-text-secondary)]">
            Time allowed
            <select
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
              className="mt-1 min-h-12 w-full rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-base"
            >
              {[30, 45, 60, 90, 120, 180].map((value) => (
                <option key={value} value={value}>
                  {value < 60 ? `${value} min` : `${value / 60} hr`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/95 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:left-auto sm:right-4 sm:w-[38rem] sm:rounded-t-2xl sm:border-x">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void submit()}
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 text-base font-extrabold text-white disabled:opacity-40"
        >
          <Save className="h-5 w-5" />
          {busy ? "Saving call…" : `Save call · ETA ${etaMinutes} min`}
        </button>
      </div>
    </main>
  );
}

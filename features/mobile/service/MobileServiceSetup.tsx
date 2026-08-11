"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Package,
  Route,
  Truck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ServiceModel = "shop" | "mobile" | "both";

export default function MobileServiceSetup() {
  const router = useRouter();
  const [serviceModel, setServiceModel] = useState<ServiceModel>("mobile");
  const [soloMode, setSoloMode] = useState(true);
  const [dispatchEnabled, setDispatchEnabled] = useState(false);
  const [fieldOperator, setFieldOperator] = useState(true);
  const [operatorCount, setOperatorCount] = useState(1);
  const [serviceVehicles, setServiceVehicles] = useState(true);
  const [truckInventory, setTruckInventory] = useState(false);
  const [truckName, setTruckName] = useState("Service Truck");
  const [unitNumber, setUnitNumber] = useState("");
  const [defaultVisitMinutes, setDefaultVisitMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canConfigure, setCanConfigure] = useState(true);

  useEffect(() => {
    void fetch("/api/mobile/service/settings", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!body) return;
        setCanConfigure(body.canConfigure !== false);
        const settings = body.settings;
        if (settings) {
          setServiceModel(settings.service_model);
          setSoloMode(Boolean(settings.solo_mode));
          setDispatchEnabled(Boolean(settings.dispatch_enabled));
          setOperatorCount(Number(settings.field_operator_count_target || 1));
          setServiceVehicles(Boolean(settings.service_vehicles_enabled));
          setTruckInventory(Boolean(settings.truck_inventory_enabled));
          setDefaultVisitMinutes(Number(settings.default_visit_minutes || 60));
        }
        setFieldOperator(Boolean(body.currentActorFieldOperator));
        if (body.serviceVehicle) {
          setTruckName(body.serviceVehicle.name || "Service Truck");
          setUnitNumber(body.serviceVehicle.unit_number || "");
        }
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/service/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceModel,
          soloMode,
          dispatchEnabled: soloMode ? false : dispatchEnabled,
          serviceVehiclesEnabled: serviceVehicles,
          truckInventoryEnabled: truckInventory,
          defaultVisitMinutes,
          fieldOperatorCountTarget: operatorCount,
          enableCurrentActorFieldOperator: fieldOperator,
          serviceVehicleName: serviceVehicles ? truckName : null,
          serviceVehicleUnitNumber: serviceVehicles ? unitNumber : null,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          body?.error || "Mobile Service setup could not be saved.",
        );
      }
      router.replace("/mobile/service?setup=complete");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Mobile Service setup could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-3 pb-8 pt-3 text-[color:var(--theme-text-primary)] sm:px-4">
      <header className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950 p-4 text-white shadow-card">
        <Link
          href="/mobile/service"
          className="inline-grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-white/[0.07]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-sky-300">
            Mobile V1 setup
          </div>
          <h1 className="text-xl font-extrabold">How do you work?</h1>
        </div>
      </header>

      <section className="space-y-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
        <h2 className="font-extrabold">Where is service performed?</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["shop", "Customers come to us"],
              ["mobile", "We go to customers"],
              ["both", "Both"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setServiceModel(value)}
              className={`min-h-14 rounded-2xl border px-3 text-sm font-bold ${
                serviceModel === value
                  ? "border-sky-400 bg-sky-500/15 text-sky-200"
                  : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
        <div className="flex items-center gap-2">
          <UsersRound className="h-5 w-5" />
          <h2 className="font-extrabold">Field team</h2>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--theme-surface-subtle)] p-3">
          <span>
            <strong className="block text-sm">I perform field work</strong>
            <span className="text-xs text-[color:var(--theme-text-secondary)]">
              Explicit field capability; your owner/admin role does not change.
            </span>
          </span>
          <input
            type="checkbox"
            checked={fieldOperator}
            onChange={(event) => setFieldOperator(event.target.checked)}
            className="h-5 w-5"
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">Solo operator</span>
          <input
            type="checkbox"
            checked={soloMode}
            onChange={(event) => {
              const checked = event.target.checked;
              setSoloMode(checked);
              if (checked) {
                setOperatorCount(1);
                setDispatchEnabled(false);
              }
            }}
            className="h-5 w-5"
          />
        </label>
        <label className="block text-xs text-[color:var(--theme-text-secondary)]">
          Field operators
          <input
            type="number"
            min={1}
            max={500}
            value={operatorCount}
            disabled={soloMode}
            onChange={(event) => {
              const nextCount = Math.max(1, Number(event.target.value) || 1);
              setOperatorCount(nextCount);
              if (nextCount > 1) setDispatchEnabled(true);
            }}
            className="mt-1 min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-base"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--theme-surface-subtle)] p-3">
          <span>
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Route className="h-4 w-4" /> Use dispatch/team assignment
            </span>
            <span className="mt-0.5 block text-xs text-[color:var(--theme-text-secondary)]">
              New calls stay unassigned for dispatch instead of automatically
              going to the person who answered the call.
            </span>
          </span>
          <input
            type="checkbox"
            disabled={soloMode}
            checked={!soloMode && dispatchEnabled}
            onChange={(event) => setDispatchEnabled(event.target.checked)}
            className="h-5 w-5"
          />
        </label>
      </section>

      <section className="space-y-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          <h2 className="font-extrabold">Service vehicle</h2>
        </div>
        <label className="flex items-center justify-between">
          <span className="text-sm font-semibold">Track a service truck/van</span>
          <input
            type="checkbox"
            checked={serviceVehicles}
            onChange={(event) => setServiceVehicles(event.target.checked)}
            className="h-5 w-5"
          />
        </label>
        {serviceVehicles ? (
          <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
            <input
              value={truckName}
              onChange={(event) => setTruckName(event.target.value)}
              placeholder="Service Truck"
              className="min-h-11 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3"
            />
            <input
              value={unitNumber}
              onChange={(event) => setUnitNumber(event.target.value)}
              placeholder="Unit #"
              className="min-h-11 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3"
            />
          </div>
        ) : null}
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--theme-surface-subtle)] p-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Package className="h-4 w-4" /> Truck carries inventory
          </span>
          <input
            type="checkbox"
            disabled={!serviceVehicles}
            checked={truckInventory && serviceVehicles}
            onChange={(event) => setTruckInventory(event.target.checked)}
            className="h-5 w-5"
          />
        </label>
      </section>

      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
        <label className="block text-xs text-[color:var(--theme-text-secondary)]">
          Default time reserved for a call
          <select
            value={defaultVisitMinutes}
            onChange={(event) =>
              setDefaultVisitMinutes(Number(event.target.value))
            }
            className="mt-1 min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-base"
          >
            {[30, 45, 60, 90, 120, 180].map((value) => (
              <option key={value} value={value}>
                {value < 60 ? `${value} min` : `${value / 60} hr`}
              </option>
            ))}
          </select>
        </label>
      </section>

      {!canConfigure ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Only an owner or admin can change Mobile Service setup.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      <button
        type="button"
        disabled={!canConfigure || busy}
        onClick={() => void save()}
        className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 text-base font-extrabold text-white disabled:opacity-40"
      >
        <CheckCircle2 className="h-5 w-5" />
        {busy ? "Saving…" : "Save Mobile setup"}
      </button>
    </main>
  );
}

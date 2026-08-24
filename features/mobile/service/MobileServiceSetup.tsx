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
type FieldTeamMember = {
  profileId: string;
  name: string;
  vehicleId: string | null;
};
type FieldVehicle = {
  id: string;
  name: string;
  unitNumber: string | null;
};

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
  const [standaloneFieldWorkspace, setStandaloneFieldWorkspace] =
    useState(false);
  const [canConfigure, setCanConfigure] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [fieldTeam, setFieldTeam] = useState<FieldTeamMember[]>([]);
  const [fieldVehicles, setFieldVehicles] = useState<FieldVehicle[]>([]);

  useEffect(() => {
    let active = true;
    setSettingsLoaded(false);
    setError(null);

    void fetch("/api/mobile/service/settings", {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          [key: string]: unknown;
        } | null;
        if (!response.ok) {
          throw new Error(
            body?.error || "Field Service setup could not be loaded.",
          );
        }
        if (!body) {
          throw new Error("Field Service setup returned an invalid response.");
        }
        return body;
      })
      .then((body) => {
        if (!active) return;
        const standalone = body.standaloneFieldWorkspace === true;
        setStandaloneFieldWorkspace(standalone);
        setCanConfigure(body.canConfigure !== false);
        const settings = body.settings as
          | Record<string, string | number | boolean | null>
          | null
          | undefined;
        if (settings) {
          const configuredModel = settings.service_model;
          if (
            configuredModel === "shop" ||
            configuredModel === "mobile" ||
            configuredModel === "both"
          ) {
            setServiceModel(configuredModel);
          }
          setSoloMode(Boolean(settings.solo_mode));
          setDispatchEnabled(Boolean(settings.dispatch_enabled));
          setOperatorCount(Number(settings.field_operator_count_target || 1));
          setServiceVehicles(Boolean(settings.service_vehicles_enabled));
          setTruckInventory(Boolean(settings.truck_inventory_enabled));
          setDefaultVisitMinutes(Number(settings.default_visit_minutes || 60));
        }
        setFieldOperator(Boolean(body.currentActorFieldOperator));
        setFieldTeam(
          Array.isArray(body.fieldTeam)
            ? (body.fieldTeam as FieldTeamMember[])
            : [],
        );
        setFieldVehicles(
          Array.isArray(body.fieldVehicles)
            ? (body.fieldVehicles as FieldVehicle[])
            : [],
        );
        const serviceVehicle = body.serviceVehicle as
          | { name?: string | null; unit_number?: string | null }
          | null
          | undefined;
        if (serviceVehicle) {
          setTruckName(serviceVehicle.name || "Service Truck");
          setUnitNumber(serviceVehicle.unit_number || "");
        }
        if (standalone) {
          setServiceModel("mobile");
          setSoloMode(true);
          setDispatchEnabled(false);
          setFieldOperator(true);
          setOperatorCount(1);
          setServiceVehicles(true);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Field Service setup could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setSettingsLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [loadAttempt]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/service/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceModel: standaloneFieldWorkspace ? "mobile" : serviceModel,
          soloMode: standaloneFieldWorkspace ? true : soloMode,
          dispatchEnabled: standaloneFieldWorkspace
            ? false
            : soloMode
              ? false
              : dispatchEnabled,
          serviceVehiclesEnabled: standaloneFieldWorkspace
            ? true
            : serviceVehicles,
          truckInventoryEnabled: truckInventory,
          defaultVisitMinutes,
          fieldOperatorCountTarget: standaloneFieldWorkspace
            ? 1
            : operatorCount,
          enableCurrentActorFieldOperator: standaloneFieldWorkspace
            ? true
            : fieldOperator,
          serviceVehicleName:
            standaloneFieldWorkspace || serviceVehicles ? truckName : null,
          serviceVehicleUnitNumber:
            standaloneFieldWorkspace || serviceVehicles ? unitNumber : null,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          body?.error || "Field Service setup could not be saved.",
        );
      }
      router.replace("/mobile/service?setup=complete");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Field Service setup could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function assignTruck(profileId: string, serviceVehicleId: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/service/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, serviceVehicleId }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        fieldTeam?: FieldTeamMember[];
        fieldVehicles?: FieldVehicle[];
      } | null;
      if (!response.ok) {
        throw new Error(body?.error || "Truck assignment could not be saved.");
      }
      setFieldTeam(body?.fieldTeam ?? []);
      setFieldVehicles(body?.fieldVehicles ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Truck assignment could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!settingsLoaded) {
    return (
      <main className="mx-auto w-full max-w-2xl px-3 pb-8 pt-3 sm:px-4">
        <div className="h-40 animate-pulse rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]" />
      </main>
    );
  }

  if (error && !canConfigure) {
    return (
      <main className="mx-auto w-full max-w-2xl px-3 pb-8 pt-3 sm:px-4">
        <section
          role="alert"
          className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-5 text-sm text-rose-700 dark:text-rose-200"
        >
          <h1 className="text-lg font-extrabold">Field setup did not load</h1>
          <p className="mt-2">{error}</p>
          <button
            type="button"
            onClick={() => setLoadAttempt((value) => value + 1)}
            className="mt-4 min-h-11 rounded-xl bg-[var(--accent-copper)] px-4 font-bold text-[color:var(--theme-text-on-accent)]"
          >
            Retry
          </button>
        </section>
      </main>
    );
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
            Field Service setup
          </div>
          <h1 className="text-xl font-extrabold">How do you work?</h1>
        </div>
      </header>

      <section className="space-y-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
        <h2 className="font-extrabold">
          {standaloneFieldWorkspace
            ? "Standalone Field workspace"
            : "Where is service performed?"}
        </h2>
        {standaloneFieldWorkspace ? (
          <p className="text-sm text-[color:var(--theme-text-secondary)]">
            This Field subscription belongs to you. It is not controlled by a
            Shop role, and all Field tools are available to the owner.
          </p>
        ) : (
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
        )}
      </section>

      {standaloneFieldWorkspace ? (
        <section className="space-y-2 rounded-3xl border border-sky-400/30 bg-sky-500/10 p-4 shadow-card">
          <div className="flex items-center gap-2">
            <UsersRound className="h-5 w-5" />
            <h2 className="font-extrabold">Owner operator</h2>
          </div>
          <p className="text-sm text-[color:var(--theme-text-secondary)]">
            Your account is the Field owner and operator. There is no separate
            Shop administrator required to unlock or assign your tools.
          </p>
        </section>
      ) : (
        <section className="space-y-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
          <div className="flex items-center gap-2">
            <UsersRound className="h-5 w-5" />
            <h2 className="font-extrabold">Field team</h2>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--theme-surface-subtle)] p-3">
            <span>
              <strong className="block text-sm">I perform field work</strong>
              <span className="text-xs text-[color:var(--theme-text-secondary)]">
                Explicit field capability;
                {" your owner/admin role does not change."}
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
      )}

      <section className="space-y-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          <h2 className="font-extrabold">Service vehicle</h2>
        </div>
        <label className="flex items-center justify-between">
          <span className="text-sm font-semibold">
            {standaloneFieldWorkspace
              ? "My Truck (required)"
              : "Track a service truck/van"}
          </span>
          <input
            type="checkbox"
            checked={standaloneFieldWorkspace || serviceVehicles}
            disabled={standaloneFieldWorkspace}
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

      {!standaloneFieldWorkspace &&
      canConfigure &&
      fieldTeam.length > 0 &&
      fieldVehicles.length > 0 ? (
        <section className="space-y-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
          <div className="flex items-center gap-2">
            <UsersRound className="h-5 w-5" />
            <h2 className="font-extrabold">Field truck assignments</h2>
          </div>
          <p className="text-xs text-[color:var(--theme-text-secondary)]">
            Assign each enabled Field operator to the truck shown in their My
            Truck workspace.
          </p>
          <div className="space-y-2">
            {fieldTeam.map((member) => (
              <label
                key={member.profileId}
                className="grid gap-1 rounded-2xl bg-[color:var(--theme-surface-subtle)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,1fr)] sm:items-center"
              >
                <span className="text-sm font-semibold">{member.name}</span>
                <select
                  value={member.vehicleId ?? ""}
                  disabled={busy}
                  onChange={(event) => {
                    if (event.target.value) {
                      void assignTruck(member.profileId, event.target.value);
                    }
                  }}
                  className="min-h-11 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-base"
                >
                  <option value="" disabled>
                    Choose a truck
                  </option>
                  {fieldVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.name}
                      {vehicle.unitNumber ? ` · ${vehicle.unitNumber}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      ) : null}

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

      {!canConfigure && !standaloneFieldWorkspace ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Only an owner or admin can change Field Service setup.
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
        {busy ? "Saving…" : "Save Field setup"}
      </button>
    </main>
  );
}

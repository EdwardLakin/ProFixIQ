"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Toaster, toast } from "sonner";
import { Button } from "@shared/components/ui/Button";
import SharedServiceRequestBuilder, {
  type DiagnosticRequestDraft,
  type RequestCatalogItem,
} from "@/features/portal/components/request/SharedServiceRequestBuilder";

type Unit = {
  fleet_id: string;
  vehicle_id: string;
  nickname: string | null;
  vehicles:
    | {
        id: string;
        unit_number: string | null;
        year: number | null;
        make: string | null;
        model: string | null;
        vin: string | null;
        license_plate: string | null;
        engine_hours: number | null;
        mileage: string | null;
      }
    | Array<{
        id: string;
        unit_number: string | null;
        year: number | null;
        make: string | null;
        model: string | null;
        vin: string | null;
        license_plate: string | null;
        engine_hours: number | null;
        mileage: string | null;
      }>;
};

type MenuItem = {
  id: string;
  name: string | null;
  description: string | null;
  category: string | null;
  base_labor_hours: number | null;
  labor_hours: number | null;
  base_price: number | null;
  total_price: number | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
};

type InspectionTemplate = {
  id: string;
  template_name: string;
  description: string | null;
  labor_hours: number | null;
  vehicle_type: string | null;
  tags: string[] | null;
};

type ProgramTask = {
  id: string;
  description: string;
  default_labor_hours: number | null;
  display_order: number;
};

type PmPackage = {
  id: string;
  name: string;
  cadence: string;
  interval_km: number | null;
  interval_hours: number | null;
  interval_days: number | null;
  notes: string | null;
  tasks: ProgramTask[];
};

type BuilderContext = {
  fleetId: string;
  shopId: string;
  units: Unit[];
  menuItems: MenuItem[];
  inspections: InspectionTemplate[];
  pmPackages: PmPackage[];
};

type DraftLine = {
  clientId: string;
  lineKind: RequestCatalogItem["kind"] | "diagnostic" | "custom";
  description: string;
  notes?: string | null;
  quantity: number;
  requestedLaborHours?: number | null;
  unitPriceSnapshot?: number | null;
  sourceMenuItemId?: string | null;
  sourceInspectionTemplateId?: string | null;
  sourceFleetProgramId?: string | null;
  sourceSnapshot: Record<string, unknown>;
};

const cardClass =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card";
const inputClass =
  "w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none";

function unitLabel(unit: Unit) {
  const vehicle = unitVehicle(unit);
  return (
    unit.nickname ||
    vehicle?.unit_number ||
    vehicle?.license_plate ||
    vehicle?.vin ||
    "Fleet unit"
  );
}

function unitVehicle(unit: Unit) {
  return Array.isArray(unit.vehicles)
    ? (unit.vehicles[0] ?? null)
    : unit.vehicles;
}

function intervalLabel(pkg: PmPackage) {
  const intervals = [
    pkg.interval_km ? `${pkg.interval_km.toLocaleString()} km` : null,
    pkg.interval_hours ? `${pkg.interval_hours.toLocaleString()} hours` : null,
    pkg.interval_days ? `${pkg.interval_days} days` : null,
  ].filter(Boolean);
  return intervals.join(" / ") || pkg.cadence;
}

function menuAppliesToUnit(item: MenuItem, unit: Unit) {
  const vehicle = unitVehicle(unit);
  const yearMatches =
    item.vehicle_year == null || item.vehicle_year === vehicle?.year;
  const makeMatches =
    !item.vehicle_make ||
    item.vehicle_make.toLowerCase() === (vehicle?.make ?? "").toLowerCase();
  const modelMatches =
    !item.vehicle_model ||
    item.vehicle_model.toLowerCase() === (vehicle?.model ?? "").toLowerCase();
  return yearMatches && makeMatches && modelMatches;
}

export default function FleetRequestBuilderPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [context, setContext] = useState<BuilderContext | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState(
    searchParams.get("unitId") ?? "",
  );
  const [requestedForDate, setRequestedForDate] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const fleetId = searchParams.get("fleetId");
        const query = fleetId ? `?fleetId=${encodeURIComponent(fleetId)}` : "";
        const response = await fetch(
          `/api/fleet/request-builder/context${query}`,
          {
            cache: "no-store",
          },
        );
        const body = (await response.json().catch(() => ({}))) as
          | BuilderContext
          | { error?: string };

        if (!response.ok || !("units" in body)) {
          throw new Error(
            "error" in body && body.error
              ? body.error
              : "Failed to load fleet request builder.",
          );
        }

        if (cancelled) return;
        setContext(body);
        setSelectedUnitId(
          (current) => current || body.units[0]?.vehicle_id || "",
        );
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to load fleet request builder.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const selectedUnit = useMemo(
    () =>
      context?.units.find((unit) => unit.vehicle_id === selectedUnitId) ?? null,
    [context?.units, selectedUnitId],
  );

  const menuCatalog = useMemo<RequestCatalogItem[]>(() => {
    if (!context || !selectedUnit) return [];
    return context.menuItems
      .filter((item) => menuAppliesToUnit(item, selectedUnit))
      .map((item) => ({
        id: item.id,
        kind: "menu",
        title: item.name || item.description || "Menu service",
        description: item.description,
        category: item.category,
        laborHours: item.base_labor_hours ?? item.labor_hours,
        price: item.total_price ?? item.base_price,
      }));
  }, [context, selectedUnit]);

  const inspectionCatalog = useMemo<RequestCatalogItem[]>(
    () =>
      (context?.inspections ?? []).map((inspection) => ({
        id: inspection.id,
        kind: "inspection",
        title: inspection.template_name,
        description: inspection.description,
        category: inspection.vehicle_type || "Inspection",
        laborHours: inspection.labor_hours,
        price: null,
      })),
    [context?.inspections],
  );

  const pmCatalog = useMemo<RequestCatalogItem[]>(
    () =>
      (context?.pmPackages ?? []).map((pkg) => ({
        id: pkg.id,
        kind: "pm_package",
        title: pkg.name,
        description: pkg.notes,
        category: "PM package",
        laborHours: pkg.tasks.reduce(
          (sum, task) => sum + (task.default_labor_hours ?? 0),
          0,
        ),
        price: null,
        intervalLabel: intervalLabel(pkg),
      })),
    [context?.pmPackages],
  );

  function addCatalogItem(item: RequestCatalogItem) {
    const menu = context?.menuItems.find(
      (candidate) => candidate.id === item.id,
    );
    const inspection = context?.inspections.find(
      (candidate) => candidate.id === item.id,
    );
    const pmPackage = context?.pmPackages.find(
      (candidate) => candidate.id === item.id,
    );

    setLines((current) => [
      ...current,
      {
        clientId: crypto.randomUUID(),
        lineKind: item.kind,
        description: item.title,
        notes: item.description,
        quantity: 1,
        requestedLaborHours: item.laborHours,
        unitPriceSnapshot: item.price,
        sourceMenuItemId: menu?.id ?? null,
        sourceInspectionTemplateId: inspection?.id ?? null,
        sourceFleetProgramId: pmPackage?.id ?? null,
        sourceSnapshot: pmPackage
          ? {
              cadence: pmPackage.cadence,
              intervalKm: pmPackage.interval_km,
              intervalHours: pmPackage.interval_hours,
              intervalDays: pmPackage.interval_days,
              tasks: pmPackage.tasks,
            }
          : {
              title: item.title,
              category: item.category,
              laborHours: item.laborHours,
              price: item.price,
            },
      },
    ]);
    toast.success(`${item.title} added.`);
  }

  function addDiagnostic(draft: DiagnosticRequestDraft) {
    setLines((current) => [
      ...current,
      {
        clientId: crypto.randomUUID(),
        lineKind: "diagnostic",
        description: draft.description,
        notes: draft.notes,
        quantity: 1,
        requestedLaborHours: 1,
        unitPriceSnapshot: null,
        sourceSnapshot: {
          diagnosticMinimumHours: 1,
          details: draft.details,
        },
      },
    ]);
    toast.success("Diagnostic concern added.");
  }

  async function submit() {
    if (!context || !selectedUnit || lines.length === 0 || submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/fleet/request-builder/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleetId: context.fleetId,
          vehicleId: selectedUnit.vehicle_id,
          title:
            lines.length === 1
              ? lines[0]?.description
              : `${unitLabel(selectedUnit)} service request`,
          summary: lines.map((line) => line.description).join("; "),
          requestedForDate: requestedForDate || null,
          operationKey: crypto.randomUUID(),
          lines: lines.map(({ clientId: _clientId, ...line }) => line),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        serviceRequestId?: string;
        error?: string;
      };

      if (!response.ok || !body.serviceRequestId) {
        throw new Error(
          body.error || "Failed to submit fleet service request.",
        );
      }

      toast.success("Fleet service request sent to the shop.");
      router.replace(
        pathname.startsWith("/fleet/")
          ? "/fleet/service-requests"
          : "/portal/fleet/service-requests",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to submit fleet service request.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className={cardClass}>Loading fleet service catalog…</div>;
  }

  if (!context || context.units.length === 0) {
    return (
      <div className={cardClass}>
        <Toaster position="top-center" />
        No active units are available for service requests.
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 text-[color:var(--theme-text-primary)]">
      <Toaster position="top-center" />
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
          Fleet service request
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Build work for a unit</h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
          Choose a unit, add structured work, and send it to the advisor for
          pricing and confirmation.
        </p>
      </header>

      <section className={`${cardClass} grid gap-3 sm:grid-cols-2`}>
        <label className="space-y-2 text-xs text-[color:var(--theme-text-secondary)]">
          <span>Unit</span>
          <select
            className={inputClass}
            value={selectedUnitId}
            onChange={(event) => {
              setSelectedUnitId(event.target.value);
              setLines([]);
            }}
          >
            {context.units.map((unit) => {
              const vehicle = unitVehicle(unit);
              return (
                <option key={unit.vehicle_id} value={unit.vehicle_id}>
                  {unitLabel(unit)} —{" "}
                  {[vehicle?.year, vehicle?.make, vehicle?.model]
                    .filter(Boolean)
                    .join(" ")}
                </option>
              );
            })}
          </select>
        </label>
        <label className="space-y-2 text-xs text-[color:var(--theme-text-secondary)]">
          <span>Requested date</span>
          <input
            className={inputClass}
            type="date"
            value={requestedForDate}
            onInput={(event) => setRequestedForDate(event.currentTarget.value)}
          />
        </label>
      </section>

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Current request</div>
            <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
              {selectedUnit ? unitLabel(selectedUnit) : "Select a unit"} •{" "}
              {lines.length} structured line{lines.length === 1 ? "" : "s"}
            </div>
          </div>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || lines.length === 0}
          >
            {submitting ? "Submitting…" : "Send to advisor"}
          </Button>
        </div>
        {lines.length > 0 ? (
          <div className="mt-4 space-y-2">
            {lines.map((line) => (
              <div
                key={line.clientId}
                className="flex items-start justify-between gap-3 rounded-xl border border-[color:var(--theme-border-soft)] p-3"
              >
                <div>
                  <div className="text-sm font-medium">{line.description}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                    {line.lineKind.replace("_", " ")}
                    {line.unitPriceSnapshot == null ? " • advisor pricing" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setLines((current) =>
                      current.filter(
                        (candidate) => candidate.clientId !== line.clientId,
                      ),
                    )
                  }
                  className="text-xs text-[color:var(--theme-text-secondary)] underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-3 text-sm text-[color:var(--theme-text-secondary)]">
            Add a menu service, diagnostic concern, inspection, or PM package
            below.
          </div>
        )}
      </section>

      <SharedServiceRequestBuilder
        menuItems={menuCatalog}
        inspections={inspectionCatalog}
        pmPackages={pmCatalog}
        onAddCatalogItem={addCatalogItem}
        onAddDiagnostic={addDiagnostic}
      />
    </main>
  );
}

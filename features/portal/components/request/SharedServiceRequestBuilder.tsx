"use client";

import { useMemo, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import {
  buildDiagnosticRequestNotes,
  diagnosticRequestIsComplete,
  type DiagnosticDetails,
} from "@/features/portal/lib/request/diagnosticDetails";

export type RequestCatalogItem = {
  id: string;
  kind: "menu" | "inspection" | "pm_package";
  title: string;
  description?: string | null;
  category?: string | null;
  laborHours?: number | null;
  price?: number | null;
  intervalLabel?: string | null;
};

export type DiagnosticRequestDraft = {
  description: string;
  notes: string;
  details: DiagnosticDetails;
};

type Props = {
  menuItems: RequestCatalogItem[];
  inspections?: RequestCatalogItem[];
  pmPackages?: RequestCatalogItem[];
  currency?: string;
  diagnosticMinimumHours?: number;
  busyItemId?: string | null;
  diagnosticBusy?: boolean;
  onAddCatalogItem: (item: RequestCatalogItem) => void | Promise<void>;
  onAddDiagnostic: (draft: DiagnosticRequestDraft) => void | Promise<void>;
};

const cardClass =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 backdrop-blur-md shadow-card";
const inputClass =
  "w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none focus:border-[color:var(--theme-border-soft)]";

function money(value: number | null | undefined, currency: string) {
  if (typeof value !== "number" || !Number.isFinite(value))
    return "Advisor pricing";
  return value.toLocaleString(undefined, { style: "currency", currency });
}

function CatalogSection({
  title,
  help,
  emptyLabel,
  items,
  search,
  onSearch,
  currency,
  busyItemId,
  onAdd,
}: {
  title: string;
  help: string;
  emptyLabel: string;
  items: RequestCatalogItem[];
  search?: string;
  onSearch?: (value: string) => void;
  currency: string;
  busyItemId?: string | null;
  onAdd: (item: RequestCatalogItem) => void | Promise<void>;
}) {
  return (
    <section className={`${cardClass} space-y-3`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
            {title}
          </div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
            {help}
          </div>
        </div>
        {onSearch ? (
          <div className="w-full max-w-sm">
            <input
              className={inputClass}
              placeholder="Search services…"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
            />
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-3 text-sm text-[color:var(--theme-text-secondary)]">
          {emptyLabel}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <button
              key={`${item.kind}:${item.id}`}
              type="button"
              disabled={busyItemId === item.id}
              onClick={() => void onAdd(item)}
              className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-left transition hover:bg-[color:var(--theme-surface-panel)] disabled:opacity-60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                    {item.title}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                    {item.category ||
                      (item.kind === "pm_package" ? "PM package" : item.kind)}
                    {item.laborHours != null ? (
                      <span className="ml-2">• {item.laborHours}h</span>
                    ) : null}
                    {item.intervalLabel ? (
                      <span className="ml-2">• {item.intervalLabel}</span>
                    ) : null}
                  </div>
                  {item.description ? (
                    <div className="mt-2 line-clamp-2 text-xs text-[color:var(--theme-text-muted)]">
                      {item.description}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-xs text-[color:var(--theme-text-secondary)]">
                  {busyItemId === item.id
                    ? "Adding…"
                    : money(item.price, currency)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default function SharedServiceRequestBuilder({
  menuItems,
  inspections = [],
  pmPackages = [],
  currency = "CAD",
  diagnosticMinimumHours = 1,
  busyItemId = null,
  diagnosticBusy = false,
  onAddCatalogItem,
  onAddDiagnostic,
}: Props) {
  const [search, setSearch] = useState("");
  const [concern, setConcern] = useState("");
  const [timing, setTiming] = useState("");
  const [frequency, setFrequency] = useState("");
  const [conditions, setConditions] = useState("");
  const [warningLights, setWarningLights] = useState("");
  const [drivable, setDrivable] = useState<"yes" | "no" | "unsure">("unsure");
  const [additionalNotes, setAdditionalNotes] = useState("");

  const filteredMenu = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return menuItems.slice(0, 60);
    return menuItems
      .filter((item) =>
        [item.title, item.description, item.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 60);
  }, [menuItems, search]);

  async function submitDiagnostic() {
    const details: DiagnosticDetails = {
      concern,
      timing,
      frequency,
      conditions,
      warningLights,
      drivable,
      additionalNotes,
    };

    if (!diagnosticRequestIsComplete(details)) return;

    await onAddDiagnostic({
      description: `Diagnose: ${concern.trim()}`,
      notes: buildDiagnosticRequestNotes(details),
      details,
    });

    setConcern("");
    setTiming("");
    setFrequency("");
    setConditions("");
    setWarningLights("");
    setDrivable("unsure");
    setAdditionalNotes("");
  }

  return (
    <div className="space-y-5">
      <CatalogSection
        title="Menu services"
        help="Shop-authored services and prices that apply to the selected vehicle or unit."
        emptyLabel="No matching menu items are available."
        items={filteredMenu}
        search={search}
        onSearch={setSearch}
        currency={currency}
        busyItemId={busyItemId}
        onAdd={onAddCatalogItem}
      />

      {inspections.length > 0 ? (
        <CatalogSection
          title="Inspection requests"
          help="Request one of the shop or fleet inspection templates for this unit."
          emptyLabel="No inspection templates are available."
          items={inspections}
          currency={currency}
          busyItemId={busyItemId}
          onAdd={onAddCatalogItem}
        />
      ) : null}

      {pmPackages.length > 0 ? (
        <CatalogSection
          title="PM packages"
          help="Fleet-authored packages are submitted for advisor pricing and confirmation."
          emptyLabel="No PM packages are available."
          items={pmPackages}
          currency={currency}
          busyItemId={busyItemId}
          onAdd={onAddCatalogItem}
        />
      ) : null}

      <section className={`${cardClass} space-y-3`}>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
          Something needs diagnosis
        </div>
        <div className="text-xs text-[color:var(--theme-text-muted)]">
          The shop will quote at least {diagnosticMinimumHours} diagnostic hour
          {diagnosticMinimumHours === 1 ? "" : "s"}. The technician receives the
          details below.
        </div>

        <input
          className={inputClass}
          placeholder="What is the vehicle doing?"
          value={concern}
          onChange={(event) => setConcern(event.target.value)}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            className={inputClass}
            placeholder="When does it happen?"
            value={timing}
            onChange={(event) => setTiming(event.target.value)}
          />
          <select
            className={inputClass}
            value={frequency}
            onChange={(event) => setFrequency(event.target.value)}
          >
            <option value="">How often?</option>
            <option value="Every time">Every time</option>
            <option value="Often">Often</option>
            <option value="Sometimes">Sometimes</option>
            <option value="Happened once">Happened once</option>
          </select>
          <input
            className={inputClass}
            placeholder="Speed, temperature, braking, turning…"
            value={conditions}
            onChange={(event) => setConditions(event.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Warning lights or fault codes"
            value={warningLights}
            onChange={(event) => setWarningLights(event.target.value)}
          />
        </div>
        <label className="block space-y-2 text-xs text-[color:var(--theme-text-secondary)]">
          <span>Does it feel safe to drive?</span>
          <select
            className={inputClass}
            value={drivable}
            onChange={(event) =>
              setDrivable(event.target.value as "yes" | "no" | "unsure")
            }
          >
            <option value="unsure">Unsure</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <textarea
          className={`${inputClass} min-h-[92px] resize-none`}
          placeholder="Anything else the technician should know?"
          value={additionalNotes}
          onChange={(event) => setAdditionalNotes(event.target.value)}
        />
        <Button
          type="button"
          onClick={() => void submitDiagnostic()}
          disabled={diagnosticBusy || !concern.trim()}
        >
          {diagnosticBusy ? "Adding…" : "Add diagnostic concern"}
        </Button>
      </section>
    </div>
  );
}

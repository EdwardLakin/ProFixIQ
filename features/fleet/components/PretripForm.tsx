"use client";

import { FormEvent, useMemo, useState } from "react";

type Props = {
  unitId: string;
  fleetId?: string | null;
  driverHint: string | null;
};

type DefectKey =
  | "brakes"
  | "tires"
  | "lights"
  | "steering"
  | "suspension"
  | "fluids"
  | "body"
  | "safetyEquipment";
type DefectState = "ok" | "defect" | "na";

const DEFECT_ITEMS: { key: DefectKey; label: string }[] = [
  { key: "brakes", label: "Brakes / air system" },
  { key: "tires", label: "Tires, wheels & rims" },
  { key: "lights", label: "Lights & signals" },
  { key: "steering", label: "Steering" },
  { key: "suspension", label: "Suspension" },
  { key: "fluids", label: "Leaks (oil, coolant, fuel)" },
  { key: "body", label: "Body, mirrors, glass" },
  { key: "safetyEquipment", label: "Safety equipment" },
];

function initialDefects() {
  return DEFECT_ITEMS.reduce(
    (result, item) => ({ ...result, [item.key]: "ok" as DefectState }),
    {} as Record<DefectKey, DefectState>,
  );
}

export default function PretripForm({ unitId, fleetId, driverHint }: Props) {
  const [driverName, setDriverName] = useState(driverHint ?? "");
  const [odometer, setOdometer] = useState("");
  const [engineHours, setEngineHours] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [showCorrectionReason, setShowCorrectionReason] = useState(false);
  const [defects, setDefects] = useState<Record<DefectKey, DefectState>>(initialDefects);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");

  const defectsPresent = useMemo(
    () => Object.values(defects).some((value) => value === "defect"),
    [defects],
  );
  const canSubmit = driverName.trim().length > 0 && !submitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/fleet/pretrip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId,
          fleetId: fleetId ?? null,
          driverName,
          odometer: odometer || null,
          engineHours: engineHours || null,
          readingCorrectionReason: correctionReason || null,
          location: location || null,
          notes: notes || null,
          defects,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        hasDefects?: boolean;
        defectCount?: number;
        requiresCorrectionReason?: boolean;
      };
      if (!response.ok) {
        if (body.requiresCorrectionReason) setShowCorrectionReason(true);
        throw new Error(body.error || "Failed to save pre-trip");
      }

      setMessageKind("success");
      setStatusMessage(
        body.hasDefects
          ? `Pre-trip saved. ${body.defectCount ?? 0} defect${body.defectCount === 1 ? "" : "s"} tracked on this unit and sent to the manager queue.`
          : "Pre-trip saved. Today’s requirement is complete and the unit reading updated PM forecasts.",
      );
      setNotes("");
      setCorrectionReason("");
      setShowCorrectionReason(false);
      setDefects(initialDefects());
    } catch (error) {
      console.error("[PretripForm] submit", error);
      setMessageKind("error");
      setStatusMessage(error instanceof Error ? error.message : "Failed to save pre-trip.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] p-4 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
      <header className="flex items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">Today’s pre-trip</p>
          <p className="mt-1 text-sm text-[color:var(--theme-text-primary)]">Complete the walk-around once for this assigned unit.</p>
        </div>
        <span className={defectsPresent ? "rounded-full bg-red-500/15 px-3 py-1 text-[10px] font-semibold uppercase text-red-200" : "rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold uppercase text-emerald-200"}>
          {defectsPresent ? "Defects marked" : "All OK"}
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
          Driver
          <input value={driverName} onChange={(event) => setDriverName(event.target.value)} className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)]" />
        </label>
        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
          Odometer (km)
          <input type="number" min="0" step="1" value={odometer} onChange={(event) => setOdometer(event.target.value)} className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)]" />
        </label>
        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
          Engine hours
          <input type="number" min="0" step="0.1" value={engineHours} onChange={(event) => setEngineHours(event.target.value)} className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)]" />
        </label>
      </div>

      <label className="block space-y-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
        Location / route
        <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Calgary Yard A – AM linehaul" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)]" />
      </label>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">Walk-around checklist</h2>
          <span className="text-[11px] text-[color:var(--theme-text-muted)]">Tap: OK → defect → N/A</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {DEFECT_ITEMS.map((item) => {
            const value = defects[item.key];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setDefects((current) => ({
                  ...current,
                  [item.key]: value === "ok" ? "defect" : value === "defect" ? "na" : "ok",
                }))}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm ${value === "defect" ? "border-red-400/50 bg-red-500/10 text-red-100" : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"}`}
              >
                <span>{item.label}</span>
                <span className="text-[10px] font-semibold uppercase">{value === "na" ? "N/A" : value}</span>
              </button>
            );
          })}
        </div>
      </section>

      <label className="block space-y-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
        Notes
        <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Describe the exact location, sound, leak, warning light, or condition." className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)]" />
      </label>

      {showCorrectionReason ? (
        <label className="block space-y-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
          Reading correction reason
          <textarea required rows={2} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Explain the meter replacement, rollover, or previous entry error." className="w-full rounded-xl border border-amber-300/30 bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)]" />
        </label>
      ) : null}

      <div className="border-t border-[color:var(--theme-border-soft)] pt-4">
        <button type="submit" disabled={!canSubmit} className="min-h-11 w-full rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60">
          {submitting ? "Saving pre-trip…" : "Submit today’s pre-trip"}
        </button>
        <p className="mt-2 text-center text-[11px] text-[color:var(--theme-text-muted)]">
          Defects are tracked to this unit. Fleet managers—not drivers—decide whether to defer, resolve, or create service work.
        </p>
        {statusMessage ? (
          <p role="status" className={`mt-3 rounded-xl p-3 text-sm ${messageKind === "error" ? "bg-red-500/10 text-red-200" : "bg-emerald-500/10 text-emerald-100"}`}>
            {statusMessage}
          </p>
        ) : null}
      </div>
    </form>
  );
}

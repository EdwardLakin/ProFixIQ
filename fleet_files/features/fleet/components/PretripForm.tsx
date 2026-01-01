// features/fleet/components/PretripForm.tsx
"use client";

import { FormEvent, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Props = {
  unitId: string;
  driverHint: string | null;
  // optional – currently unused, but kept so existing callers compile
  supabase?: SupabaseClient<DB>;
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

export default function PretripForm({ unitId, driverHint }: Props) {
  const [driverName, setDriverName] = useState(driverHint ?? "");
  const [odometer, setOdometer] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [defects, setDefects] = useState<Record<DefectKey, DefectState>>(() =>
    DEFECT_ITEMS.reduce(
      (acc, item) => ({ ...acc, [item.key]: "ok" as DefectState }),
      {} as Record<DefectKey, DefectState>,
    ),
  );

  const [submitting, setSubmitting] = useState(false);
  const [convertBusy, setConvertBusy] = useState(false);
  const [pretripId, setPretripId] = useState<string | null>(null);
  const [hasDefects, setHasDefects] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const defectsPresent = useMemo(
    () => Object.values(defects).some((s) => s === "defect"),
    [defects],
  );

  const canSubmit = !!driverName && !submitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/fleet/pretrip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId,
          driverName,
          odometer: odometer || null,
          location: location || null,
          notes: notes || null,
          defects,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to save pre-trip");
      }

      const data: { id: string; hasDefects: boolean } = await res.json();

      setPretripId(data.id);
      setHasDefects(data.hasDefects ?? defectsPresent);
      setStatusMessage("Pre-trip saved.");

      // optional: clear form except driver + location
      setNotes("");
    } catch (err: any) {
      console.error(err);
      setStatusMessage(err?.message || "Failed to save pre-trip.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConvert = async () => {
    if (!pretripId) return;
    setConvertBusy(true);
    setStatusMessage(null);

    try {
      const res = await fetch(
        "/api/fleet/pretrip/convert-to-service-request",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pretripId }),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to create service request");
      }

      setStatusMessage("Service request created from pre-trip defects.");
    } catch (err: any) {
      console.error(err);
      setStatusMessage(err?.message || "Failed to create service request.");
    } finally {
      setConvertBusy(false);
    }
  };

  const renderDefectPill = (key: DefectKey, label: string) => {
    const value = defects[key];

    const base =
      "inline-flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs font-medium border transition shadow-[0_10px_24px_rgba(0,0,0,0.85)]";

    const className =
      value === "defect"
        ? `${base} border-[color:var(--accent-copper)]/70 bg-black/70 text-[color:var(--accent-copper-light)]`
        : value === "na"
          ? `${base} border-neutral-700 bg-black/30 text-neutral-400`
          : `${base} border-[color:var(--metal-border-soft)] bg-black/40 text-neutral-300`;

    return (
      <button
        key={key}
        type="button"
        className={className}
        onClick={() => {
          // cycle: ok -> defect -> na -> ok
          const next: DefectState =
            value === "ok" ? "defect" : value === "defect" ? "na" : "ok";
          setDefects((prev) => ({ ...prev, [key]: next }));
        }}
      >
        <span>{label}</span>
        <span className="rounded-full border border-white/10 bg-black/40 px-2 py-[1px] text-[10px] uppercase tracking-[0.16em]">
          {value === "defect"
            ? "DEFECT"
            : value === "na"
              ? "N/A"
              : "OK"}
        </span>
      </button>
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/70 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl"
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
            Daily Pre-trip
          </p>
          <p className="mt-1 text-sm text-neutral-200">
            Unit{" "}
            <span className="font-mono text-xs text-neutral-100">
              {unitId}
            </span>
          </p>
        </div>

        {defectsPresent ? (
          <span className="accent-chip px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
            Defects Marked
          </span>
        ) : (
          <span className="rounded-full border border-emerald-500/50 bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
            All OK
          </span>
        )}
      </header>

      {/* Driver + basics */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Driver
          </label>
          <input
            type="text"
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/80 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
            placeholder="Driver name"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Odometer
          </label>
          <input
            type="number"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/80 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
            placeholder="km"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Location / Route
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/80 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
            placeholder="e.g. Calgary Yard A – AM linehaul"
          />
        </div>
      </div>

      {/* Quick defect toggles */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Walk-around checklist
          </p>
          <p className="text-[11px] text-neutral-500">
            Tap items to mark{" "}
            <span className="text-[color:var(--accent-copper-light)]">
              DEFECT
            </span>{" "}
            or N/A.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {DEFECT_ITEMS.map((item) =>
            renderDefectPill(item.key, item.label),
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/80 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
          placeholder="Anything the shop should know before this unit goes out..."
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center rounded-xl bg-[color:var(--accent-copper)] px-4 py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(193,102,59,0.4)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Saving pre-trip…" : "Submit pre-trip"}
        </button>

        {/* Convert → service request */}
        {pretripId && (hasDefects || defectsPresent) && (
          <button
            type="button"
            onClick={handleConvert}
            disabled={convertBusy}
            className="inline-flex items-center justify-center rounded-xl border border-[color:var(--accent-copper-light)] bg-black/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper-light)] shadow-[0_0_18px_rgba(193,102,59,0.35)] transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {convertBusy
              ? "Converting defects…"
              : "Convert defects → service request"}
          </button>
        )}

        {statusMessage && (
          <p className="text-xs text-neutral-400">{statusMessage}</p>
        )}
      </div>
    </form>
  );
}
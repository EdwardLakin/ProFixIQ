"use client";

import { FormEvent, useMemo, useState } from "react";
import { Camera, Check, Mic, ShieldCheck, X } from "lucide-react";

import type {
  FleetPretripTemplate,
  FleetTrailerOption,
} from "@/features/fleet/types/driverPortal";

type Props = {
  unitId: string;
  fleetId?: string | null;
  driverHint: string | null;
  template: FleetPretripTemplate;
  trailers: FleetTrailerOption[];
  defectMode?: boolean;
};

type Answer = {
  status?: "ok" | "defect" | "na";
  value?: string;
};

type EvidenceEntry = {
  key: string;
  itemId: string | null;
  mediaType: "photo" | "voice";
  file: File;
};

function initialAnswers(
  template: FleetPretripTemplate,
): Record<string, Answer> {
  const entries = template.sections.flatMap((section) =>
    section.items.map(
      (item) =>
        [
          item.id,
          item.type === "pass_fail" ? { status: "ok" as const } : { value: "" },
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
}

export default function PretripForm({
  unitId,
  fleetId,
  driverHint,
  template,
  trailers,
  defectMode = false,
}: Props) {
  const [odometer, setOdometer] = useState("");
  const [engineHours, setEngineHours] = useState("");
  const [trailerVehicleId, setTrailerVehicleId] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [showCorrectionReason, setShowCorrectionReason] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    initialAnswers(template),
  );
  const [evidence, setEvidence] = useState<EvidenceEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"success" | "error">(
    "success",
  );

  const failedItems = useMemo(
    () =>
      template.sections
        .flatMap((section) => section.items)
        .filter((item) => answers[item.id]?.status === "defect"),
    [answers, template.sections],
  );
  const canSubmit = Boolean(driverHint?.trim()) && !submitting && !submitted;

  function replaceItemEvidence(
    itemId: string,
    mediaType: "photo" | "voice",
    file: File | null,
  ) {
    setEvidence((current) => {
      const remaining = current.filter(
        (entry) => !(entry.itemId === itemId && entry.mediaType === mediaType),
      );
      if (!file) return remaining;
      return [
        ...remaining,
        {
          key: `${itemId}:${mediaType}:${file.name}:${file.lastModified}`,
          itemId,
          mediaType,
          file,
        },
      ];
    });
  }

  function addGeneralEvidence(
    mediaType: "photo" | "voice",
    files: FileList | null,
  ) {
    if (!files?.length) return;
    setEvidence((current) => [
      ...current,
      ...Array.from(files).map((file) => ({
        key: `general:${mediaType}:${file.name}:${file.lastModified}`,
        itemId: null,
        mediaType,
        file,
      })),
    ]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setStatusMessage(null);

    try {
      const payload = {
        unitId,
        fleetId: fleetId ?? null,
        trailerVehicleId: trailerVehicleId || null,
        templateAssignmentId: template.assignmentId,
        odometer: odometer || null,
        engineHours: engineHours || null,
        readingCorrectionReason: correctionReason || null,
        location: location || null,
        notes: notes || null,
        answers,
        evidenceMeta: evidence.map((entry) => ({
          itemId: entry.itemId,
          mediaType: entry.mediaType,
        })),
      };
      const formData = new FormData();
      formData.set("payload", JSON.stringify(payload));
      for (const entry of evidence) formData.append("evidence", entry.file);

      const response = await fetch("/api/fleet/pretrip", {
        method: "POST",
        body: formData,
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
      setSubmitted(true);
      setStatusMessage(
        body.hasDefects
          ? `Inspection submitted. ${body.defectCount ?? 0} reported item${body.defectCount === 1 ? " is" : "s are"} now with dispatch for review.`
          : "Inspection submitted. Today’s requirement is complete.",
      );
    } catch (error) {
      console.error("[PretripForm] submit", error);
      setMessageKind("error");
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to save pre-trip.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[var(--theme-shadow-medium)] sm:p-5"
    >
      <header className="flex flex-col gap-3 border-b border-[color:var(--theme-border-soft)] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-500 dark:text-sky-300">
            {defectMode ? "Report what you found" : "Today’s pre-trip"}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{template.name}</h2>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            {template.vehicleType} · Version {template.version}
          </p>
        </div>
        <span
          className={`w-fit rounded-full px-3 py-1 text-[10px] font-semibold uppercase ${
            failedItems.length
              ? "bg-red-500/10 text-red-700 dark:text-red-200"
              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
          }`}
        >
          {failedItems.length
            ? `${failedItems.length} item${failedItems.length === 1 ? "" : "s"} reported`
            : "All passing"}
        </span>
      </header>

      <p className="rounded-2xl bg-sky-400/[0.08] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">
        Report only what you see. Dispatch reviews your report; Fleet
        managers—not drivers—own any resulting repair decision.
      </p>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
          Driver
          <input
            value={driverHint ?? ""}
            readOnly
            aria-readonly="true"
            className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm font-normal text-[color:var(--theme-input-text)]"
          />
        </label>
        {trailers.length ? (
          <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            Trailer (optional)
            <select
              value={trailerVehicleId}
              onChange={(event) => setTrailerVehicleId(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm font-normal text-[color:var(--theme-input-text)]"
            >
              <option value="">No trailer attached</option>
              {trailers.map((trailer) => (
                <option key={trailer.id} value={trailer.id}>
                  {trailer.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
          Odometer (km)
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={odometer}
            onChange={(event) => setOdometer(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm font-normal text-[color:var(--theme-input-text)]"
          />
        </label>
        <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
          Engine hours
          <input
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={engineHours}
            onChange={(event) => setEngineHours(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm font-normal text-[color:var(--theme-input-text)]"
          />
        </label>
      </section>

      <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
        Location / route
        <input
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Yard, route, or current location"
          className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm font-normal text-[color:var(--theme-input-text)]"
        />
      </label>

      <div className="space-y-5">
        {template.sections.map((section) => (
          <section key={section.id}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
              {section.title}
            </h3>
            <div className="space-y-2">
              {section.items.map((item) => {
                const answer = answers[item.id] ?? {};
                const attached = evidence.find(
                  (entry) => entry.itemId === item.id,
                );

                if (item.type === "pass_fail") {
                  const status = answer.status ?? "ok";
                  const needsPhoto =
                    status === "defect" && item.failureActions.requirePhoto;
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-3 ${
                        status === "defect"
                          ? "border-red-400/35 bg-red-400/[0.08]"
                          : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">
                          {item.label}
                        </span>
                        <div
                          className="flex shrink-0 gap-1"
                          role="group"
                          aria-label={`${item.label} result`}
                        >
                          {(["ok", "defect", "na"] as const).map((value) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() =>
                                setAnswers((current) => ({
                                  ...current,
                                  [item.id]: { status: value },
                                }))
                              }
                              aria-pressed={status === value}
                              className={`flex min-h-10 min-w-10 items-center justify-center rounded-xl border px-2 text-[10px] font-semibold uppercase ${
                                status === value
                                  ? value === "defect"
                                    ? "border-red-400 bg-red-500 text-white"
                                    : value === "ok"
                                      ? "border-emerald-400 bg-emerald-500 text-white"
                                      : "border-slate-400 bg-slate-500 text-white"
                                  : "border-[color:var(--theme-border-soft)] text-[color:var(--theme-text-muted)]"
                              }`}
                            >
                              {value === "ok" ? (
                                <Check className="h-4 w-4" />
                              ) : value === "defect" ? (
                                <X className="h-4 w-4" />
                              ) : (
                                "N/A"
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                      {needsPhoto ? (
                        <label className="mt-3 block rounded-xl border border-dashed border-red-400/35 p-3 text-xs font-semibold text-red-700 dark:text-red-100">
                          Photo required for this item
                          <input
                            required
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(event) =>
                              replaceItemEvidence(
                                item.id,
                                "photo",
                                event.target.files?.[0] ?? null,
                              )
                            }
                            className="mt-2 block w-full text-xs font-normal"
                          />
                        </label>
                      ) : null}
                    </div>
                  );
                }

                if (item.type === "number") {
                  return (
                    <label
                      key={item.id}
                      className="block rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3 text-sm font-medium"
                    >
                      {item.label}
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          required={item.required}
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={answer.value ?? ""}
                          onChange={(event) =>
                            setAnswers((current) => ({
                              ...current,
                              [item.id]: { value: event.target.value },
                            }))
                          }
                          className="min-w-0 flex-1 rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm"
                        />
                        {item.unit ? (
                          <span className="text-xs text-[color:var(--theme-text-muted)]">
                            {item.unit}
                          </span>
                        ) : null}
                      </div>
                    </label>
                  );
                }

                const mediaType = item.type === "photo" ? "photo" : "voice";
                return (
                  <label
                    key={item.id}
                    className="block rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3 text-sm font-medium"
                  >
                    <span className="flex items-center gap-2">
                      {item.type === "photo" ? (
                        <Camera className="h-4 w-4 text-sky-500" />
                      ) : (
                        <Mic className="h-4 w-4 text-sky-500" />
                      )}
                      {item.label}
                      {item.required ? (
                        <span className="text-red-500">*</span>
                      ) : null}
                    </span>
                    <input
                      required={item.required}
                      type="file"
                      accept={item.type === "photo" ? "image/*" : "audio/*"}
                      capture={
                        item.type === "photo" ? "environment" : undefined
                      }
                      onChange={(event) =>
                        replaceItemEvidence(
                          item.id,
                          mediaType,
                          event.target.files?.[0] ?? null,
                        )
                      }
                      className="mt-2 block w-full text-xs font-normal"
                    />
                    {attached ? (
                      <span className="mt-1 block truncate text-[10px] text-[color:var(--theme-text-muted)]">
                        {attached.file.name}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <section className="grid gap-2 sm:grid-cols-2">
        <label className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3 text-xs font-semibold">
          <span className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-sky-500" /> Add supporting photos
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(event) =>
              addGeneralEvidence("photo", event.target.files)
            }
            className="mt-2 block w-full text-xs font-normal"
          />
        </label>
        <label className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3 text-xs font-semibold">
          <span className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-sky-500" /> Add a voice note
          </span>
          <input
            type="file"
            accept="audio/*"
            onChange={(event) =>
              addGeneralEvidence("voice", event.target.files)
            }
            className="mt-2 block w-full text-xs font-normal"
          />
        </label>
      </section>

      {evidence.length ? (
        <div className="flex flex-wrap gap-2">
          {evidence.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() =>
                setEvidence((current) =>
                  current.filter((candidate) => candidate.key !== entry.key),
                )
              }
              className="rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[10px]"
              title="Remove attachment"
            >
              {entry.mediaType === "photo" ? "Photo" : "Voice"}:{" "}
              {entry.file.name} ×
            </button>
          ))}
        </div>
      ) : null}

      <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
        What did you notice?
        <textarea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Describe the location, sound, leak, warning light, or condition. Do not diagnose it."
          className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm font-normal text-[color:var(--theme-input-text)]"
        />
      </label>

      {showCorrectionReason ? (
        <label className="block rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs font-semibold text-amber-800 dark:text-amber-100">
          Reading correction reason
          <textarea
            required
            rows={2}
            value={correctionReason}
            onChange={(event) => setCorrectionReason(event.target.value)}
            placeholder="Explain the meter replacement, rollover, or previous entry error."
            className="mt-2 w-full rounded-xl border border-amber-300/30 bg-[color:var(--theme-input-bg)] px-3 py-2 text-sm font-normal text-[color:var(--theme-input-text)]"
          />
        </label>
      ) : null}

      <div className="border-t border-[color:var(--theme-border-soft)] pt-4">
        <button
          type="submit"
          disabled={!canSubmit}
          className="min-h-14 w-full rounded-2xl bg-sky-300 px-4 py-3 text-base font-semibold text-slate-950 disabled:opacity-60"
        >
          {submitting
            ? "Submitting…"
            : submitted
              ? "Inspection submitted"
              : "Submit inspection"}
        </button>
        <p className="mt-2 text-center text-[11px] text-[color:var(--theme-text-muted)]">
          Your job is to report the condition. Dispatch decides what happens
          next.
        </p>
        {statusMessage ? (
          <p
            role="status"
            className={`mt-3 flex items-start gap-2 rounded-xl p-3 text-sm ${
              messageKind === "error"
                ? "bg-red-500/10 text-red-700 dark:text-red-200"
                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-100"
            }`}
          >
            {messageKind === "success" ? (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            ) : null}
            {statusMessage}
          </p>
        ) : null}
      </div>
    </form>
  );
}

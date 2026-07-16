"use client";

import { useState } from "react";
import { createAdvisorDraftLine } from "@/features/work-orders/mobile/advisorOffline";
import type { AdvisorWorkOrderDraftLine } from "@/features/work-orders/mobile/advisorOfflineTypes";

export function AdvisorDraftLines({
  lines,
  onChange,
  disabled = false,
}: {
  lines: AdvisorWorkOrderDraftLine[];
  onChange: (lines: AdvisorWorkOrderDraftLine[]) => void;
  disabled?: boolean;
}) {
  const [complaint, setComplaint] = useState("");
  const [jobType, setJobType] =
    useState<AdvisorWorkOrderDraftLine["jobType"]>("diagnosis");
  const [laborTime, setLaborTime] = useState("");

  const add = () => {
    const value = complaint.trim();
    if (!value || disabled) return;
    const labor = laborTime.trim() ? Number(laborTime) : null;
    onChange([
      ...lines,
      createAdvisorDraftLine({
        lineType: "job",
        complaint: value,
        jobType,
        laborTime: Number.isFinite(labor) ? labor : null,
      }),
    ]);
    setComplaint("");
    setLaborTime("");
  };

  return (
    <section className="glass-card rounded-2xl border border-[color:var(--theme-border-soft)] px-3 py-3 text-[color:var(--theme-text-primary)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-medium uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Draft job lines
          </p>
          <p className="mt-1 text-[0.7rem] text-[color:var(--theme-text-muted)]">
            Temporary lines stay on this device until the draft is created
            online.
          </p>
        </div>
        <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-1 text-[0.65rem]">
          {lines.length}
        </span>
      </div>

      {lines.length > 0 && (
        <ul className="mt-3 space-y-2">
          {lines.map((line, index) => (
            <li
              key={line.tempId}
              className="flex items-start justify-between gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {index + 1}. {line.complaint}
                </p>
                <p className="mt-1 text-[0.65rem] text-[color:var(--theme-text-muted)]">
                  {line.jobType ?? "diagnosis"}
                  {line.laborTime != null ? ` · ${line.laborTime} hr` : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange(lines.filter((item) => item.tempId !== line.tempId))
                }
                className="text-[0.68rem] text-red-300 disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <input
          className="input col-span-2"
          placeholder="Customer concern or requested work"
          value={complaint}
          disabled={disabled}
          onChange={(event) => setComplaint(event.target.value)}
        />
        <select
          className="input"
          value={jobType}
          disabled={disabled}
          onChange={(event) =>
            setJobType(
              event.target.value as AdvisorWorkOrderDraftLine["jobType"],
            )
          }
        >
          <option value="diagnosis">Diagnosis</option>
          <option value="inspection">Inspection</option>
          <option value="maintenance">Maintenance</option>
          <option value="repair">Repair</option>
        </select>
        <input
          className="input"
          type="number"
          min="0"
          max="1000"
          step="0.1"
          placeholder="Labor hours"
          value={laborTime}
          disabled={disabled}
          onChange={(event) => setLaborTime(event.target.value)}
        />
        <button
          type="button"
          disabled={disabled || !complaint.trim()}
          onClick={add}
          className="col-span-2 rounded-full border border-[var(--accent-copper)] px-3 py-2 text-xs font-semibold text-[var(--accent-copper-light)] disabled:opacity-40"
        >
          Add temporary line
        </button>
      </div>
    </section>
  );
}

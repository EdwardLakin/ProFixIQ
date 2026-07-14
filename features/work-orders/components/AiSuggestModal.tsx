"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import ModalShell from "@/features/shared/components/ModalShell";

type JobType = "diagnosis" | "repair" | "maintenance" | "inspection" | "tech-suggested";

type RawSuggestion = {
  name: string;
  laborHours: number;
  jobType: JobType;
  notes: string;
  aiComplaint?: string;
  aiCause?: string;
  aiCorrection?: string;
};

type UiSuggestion = RawSuggestion & { id: string; selected: boolean };

type AiSuggestModalProps = {
  open: boolean;
  onClose: () => void;
  workOrderId: string;
  vehicleId?: string | null;
  vehicleLabel?: string | null;
  initialComplaint?: string | null;
  onAdded?: (count: number) => void;
};

function normalizeJobType(t: JobType): "diagnosis" | "repair" | "maintenance" | "inspection" {
  if (t === "tech-suggested") return "diagnosis";
  if (t === "diagnosis" || t === "repair" || t === "maintenance" || t === "inspection") return t;
  return "diagnosis";
}

export function AiSuggestModal(props: AiSuggestModalProps) {
  const {
    open,
    onClose,
    workOrderId,
    vehicleId,
    vehicleLabel,
    initialComplaint,
    onAdded,
  } = props;

  const [complaint, setComplaint] = useState(initialComplaint ?? "");
  const [step, setStep] = useState<"input" | "results">("input");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<UiSuggestion[]>([]);

  useEffect(() => {
    if (!open) return;
    setComplaint(initialComplaint ?? "");
    setStep("input");
    setSuggestions([]);
    setLoading(false);
  }, [open, initialComplaint]);

  if (!open) return null;

  const handleGetSuggestions = async () => {
    if (!workOrderId) {
      toast.error("Create and save the work order first.");
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        workOrderId,
        complaint: complaint.trim() || null,
      };

      if (vehicleId) {
        body.vehicleId = {
          id: vehicleId,
          year: null,
          make: null,
          model: null,
        };
      }

      const res = await fetch("/api/work-orders/suggest-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as
        | { suggestions?: RawSuggestion[]; error?: string }
        | undefined;

      if (!res.ok || !json?.suggestions) {
        throw new Error(json?.error || "AI suggestions failed");
      }

      const ui: UiSuggestion[] = json.suggestions.map((s, idx) => ({
        ...s,
        id: `${idx}`,
        selected: true,
        jobType: normalizeJobType(s.jobType) as any,
      }));

      if (ui.length === 0) {
        toast.info("No specific suggestions. Try adding a complaint first.");
      }

      setSuggestions(ui);
      setStep("results");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not get AI suggestions.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSelected = async () => {
    const selected = suggestions.filter((s) => s.selected);
    if (selected.length === 0) {
      toast.info("Select at least one job to add.");
      return;
    }

    setLoading(true);
    try {
      const items = selected.map((s) => ({
        description: s.name,
        serviceCode: undefined,
        jobType: normalizeJobType(s.jobType),
        laborHours: s.laborHours,
        notes: s.notes,
        aiComplaint: s.aiComplaint ?? (complaint.trim() || undefined),
        aiCause: s.aiCause,
        aiCorrection: s.aiCorrection,
      }));

      const res = await fetch("/api/work-orders/add-suggested-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          vehicleId: vehicleId ?? null,
          items,
        }),
      });

      const json = (await res.json()) as
        | { ok?: boolean; inserted?: number; error?: string }
        | undefined;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to add suggested lines.");
      }

      const count = json.inserted ?? selected.length;
      toast.success(`Added ${count} AI suggested job${count === 1 ? "" : "s"}.`);

      onAdded?.(count);

      window.dispatchEvent(new CustomEvent("wo:line-added"));
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Could not add suggested lines to work order.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (id: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s)),
    );
  };

  const btnLabel =
    step === "input"
      ? loading
        ? "Thinking…"
        : "Suggest Jobs"
      : loading
        ? "Adding…"
        : "Add Selected";

  const handlePrimary = async () => {
    if (step === "input") await handleGetSuggestions();
    else await handleAddSelected();
  };

  return (
    <ModalShell
      isOpen={open}
      onClose={onClose}
      title="AI: Suggest Services"
      size="md"
      onSubmit={handlePrimary}
      submitText={btnLabel}
      footerLeft={
        step === "results" ? (
          <button
            type="button"
            onClick={() => {
              setStep("input");
              setSuggestions([]);
            }}
            className="text-xs text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
          >
            Start over
          </button>
        ) : null
      }
    >
      <div className="space-y-3">
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent-copper-light)]">
            AI quick build
          </div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Turn the concern into suggested jobs, then add the ones you want into the work order.
          </div>
        </div>

        <div>
          <p className="text-xs text-[color:var(--theme-text-secondary)]">
            Describe the concern. We’ll suggest jobs and add them as{" "}
            <span className="font-semibold text-[color:var(--theme-text-primary)]">
              quote lines (awaiting approval)
            </span>
            .
          </p>
          {vehicleLabel && (
            <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
              Using context for:{" "}
              <span className="font-mono text-[color:var(--theme-text-primary)]">{vehicleLabel}</span>
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
            Customer concern
          </label>
          <textarea
            rows={3}
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            placeholder="Example: Customer reports vibration at highway speeds, no dash lights on. Recently replaced front tires."
            className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
          />
        </div>

        {step === "results" && (
          <div className="max-h-56 space-y-2 overflow-y-auto rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-2">
            {suggestions.length === 0 ? (
              <p className="text-xs text-[color:var(--theme-text-muted)]">
                No suggestions yet. Try adjusting the complaint text.
              </p>
            ) : (
              suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleToggle(s.id)}
                  className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs ${
                    s.selected
                      ? "border border-orange-500/80 bg-orange-500/10"
                      : "border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={s.selected}
                    onChange={() => handleToggle(s.id)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]"
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="font-medium text-[color:var(--theme-text-primary)]">
                        {s.name}
                      </span>
                      <span className="rounded-full border border-[color:var(--theme-border-soft)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                        {normalizeJobType(s.jobType).replace("-", " ")}
                      </span>
                      <span className="text-[10px] text-[color:var(--theme-text-secondary)]">
                        ~{s.laborHours}h
                      </span>
                    </div>
                    {s.notes && (
                      <p className="mt-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
                        {s.notes}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
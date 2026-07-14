"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ModalShell from "@/features/shared/components/ModalShell";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  vehicle?: {
    year?: string | null;
    make?: string | null;
    model?: string | null;
    engine?: string | null;
    fuelType?: string | null;
    drivetrain?: string | null;
    transmission?: string | null;
  } | null;
  onApplied?: (payload: {
    summary: string;
    commonRepairs: string;
    laborHours: number | null;
    applyCause: string | null;
    applyCorrection: string | null;
  }) => void | Promise<void>;
};

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type DtcAnalysisSummary = {
  dtc: string | null;
  title: string | null;
  description: string | null;
  diagnosis: string | null;
  commonRepairs: string[];
  recommendedTests: string[];
  confidence: "low" | "medium" | "high" | null;
  applyCause: string | null;
  applyCorrection: string | null;
  laborHours: number | null;
};

type DtcSuggestResponse = {
  reply: string;
  summary: DtcAnalysisSummary;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function confidenceTone(
  confidence: DtcAnalysisSummary["confidence"],
): string {
  if (confidence === "high") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  }
  if (confidence === "medium") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  }
  if (confidence === "low") {
    return "border-red-500/40 bg-red-500/10 text-red-100";
  }
  return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)]";
}

function buildSummaryText(summary: DtcAnalysisSummary): string {
  const parts: string[] = [];

  if (summary.title) parts.push(summary.title);
  if (summary.description) parts.push(summary.description);
  if (summary.diagnosis) parts.push(summary.diagnosis);

  if (summary.recommendedTests.length > 0) {
    parts.push(
      `Recommended tests: ${summary.recommendedTests.join("; ")}.`
    );
  }

  return parts.join("\n\n").trim();
}

function buildCommonRepairsText(summary: DtcAnalysisSummary): string {
  if (summary.commonRepairs.length === 0) {
    return summary.applyCorrection ?? "";
  }

  return summary.commonRepairs
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
}

export default function DtcSuggestionModal({
  isOpen,
  onClose,
  jobId,
  vehicle,
  onApplied,
}: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [dtcCode, setDtcCode] = useState("");
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [summary, setSummary] = useState<DtcAnalysisSummary | null>(null);

  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);

  useEffect(() => {
    if (!isOpen || !jobId) return;

    let cancelled = false;

    (async () => {
      setLoadingThread(true);
      setUserInput("");

      try {
        const res = await fetch(
          `/api/work-orders/dtc-suggest?jobId=${encodeURIComponent(jobId)}`,
          { method: "GET" },
        );

        const json = (await res.json()) as
          | {
              dtcCode?: string | null;
              messages?: Array<{ role: ChatRole; content: string }>;
              summary?: DtcAnalysisSummary | null;
              error?: string;
            }
          | undefined;

        if (!res.ok) {
          throw new Error(json?.error || "Failed to load DTC thread.");
        }

        if (cancelled) return;

        setDtcCode(json?.dtcCode ?? "");
        setMessages(
          Array.isArray(json?.messages)
            ? json.messages.map((m) => ({
                id: uid(),
                role: m.role,
                content: m.content,
              }))
            : [],
        );
        setSummary(json?.summary ?? null);
      } catch (error) {
        if (!cancelled) {
          console.error("[DtcSuggestionModal] load failed", error);
          setDtcCode("");
          setMessages([]);
          setSummary(null);
        }
      } finally {
        if (!cancelled) setLoadingThread(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, jobId]);

  useEffect(() => {
    if (!isOpen) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isOpen, messages, summary, loadingThread]);

  async function askAssistant(args: {
    code?: string | null;
    message: string;
  }) {
    if (!jobId) {
      toast.error("Missing job id.");
      return;
    }

    const trimmedMessage = args.message.trim();
    const trimmedCode = (args.code ?? "").trim().toUpperCase();

    if (!trimmedMessage) {
      toast.error("Enter a DTC or test result first.");
      return;
    }

    const outgoingUser: ChatMessage = {
      id: uid(),
      role: "user",
      content: trimmedMessage,
    };

    const nextMessages = [...messages, outgoingUser];
    setMessages(nextMessages);
    setUserInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/work-orders/dtc-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          code: trimmedCode || null,
          userMessage: trimmedMessage,
          history: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const json = (await res.json()) as DtcSuggestResponse | { error?: string };

      if (!res.ok || !("reply" in json) || !json.reply) {
        throw new Error(
          "error" in json && json.error
            ? json.error
            : "Failed to get DTC guidance.",
        );
      }

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: json.reply,
        },
      ]);
      setSummary(json.summary);
      setDtcCode(trimmedCode || dtcCode);
    } catch (error) {
      console.error("[DtcSuggestionModal] ask failed", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not continue diagnosis.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleStart() {
    const code = dtcCode.trim().toUpperCase();
    if (!code) {
      toast.error("Enter a DTC code first.");
      return;
    }

    const vehicleLabel = [vehicle?.year, vehicle?.make, vehicle?.model]
      .filter(Boolean)
      .join(" ")
      .trim();

    const starter = vehicleLabel
      ? `DTC ${code} on ${vehicleLabel}. Start diagnosis.`
      : `DTC ${code}. Start diagnosis.`;

    await askAssistant({
      code,
      message: starter,
    });
  }

  async function handleContinue() {
    const code = dtcCode.trim().toUpperCase();
    const message = userInput.trim();

    if (!message) {
      toast.error("Add your test results or observations.");
      return;
    }

    await askAssistant({
      code,
      message,
    });
  }

  async function handleApplyToJob() {
    if (!summary) {
      toast.error("No diagnostic summary to apply yet.");
      return;
    }

    const applyCause = (summary.applyCause ?? "").trim();
    const applyCorrection = (summary.applyCorrection ?? "").trim();

    if (!applyCause && !applyCorrection && summary.laborHours == null) {
      toast.error("Nothing returned yet to apply to the job.");
      return;
    }

    setSaving(true);
    try {
      const updates: DB["public"]["Tables"]["work_order_lines"]["Update"] = {
        cause: applyCause || null,
        correction: applyCorrection || null,
        labor_time: summary.laborHours ?? null,
      };

      const { error } = await supabase
        .from("work_order_lines")
        .update(updates)
        .eq("id", jobId);

      if (error) throw error;

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("dtc:summary-ready", {
            detail: {
              workOrderLineId: jobId,
              cause: applyCause,
              correction: applyCorrection,
              laborTime: summary.laborHours,
            },
          }),
        );
      }

      if (onApplied) {
        await onApplied({
          summary: buildSummaryText(summary),
          commonRepairs: buildCommonRepairsText(summary),
          laborHours: summary.laborHours,
          applyCause: summary.applyCause,
          applyCorrection: summary.applyCorrection,
        });
      }

      toast.success("Diagnostic summary applied to job.");
      onClose();
    } catch (error) {
      console.error("[DtcSuggestionModal] apply failed", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to apply to job.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function sendToCauseCorrection() {
    if (!summary) {
      toast.error("No summary ready yet.");
      return;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("dtc:summary-ready", {
          detail: {
            workOrderLineId: jobId,
            cause: summary.applyCause ?? "",
            correction: summary.applyCorrection ?? "",
            laborTime: summary.laborHours,
          },
        }),
      );
    }

    if (onApplied) {
      await onApplied({
        summary: buildSummaryText(summary),
        commonRepairs: buildCommonRepairsText(summary),
        laborHours: summary.laborHours,
        applyCause: summary.applyCause,
        applyCorrection: summary.applyCorrection,
      });
    }

    onClose();
  }

  const vehicleLabel = [vehicle?.year, vehicle?.make, vehicle?.model]
    .filter(Boolean)
    .join(" ")
    .trim();

  const vehicleMeta = [
    vehicle?.engine,
    vehicle?.fuelType,
    vehicle?.drivetrain,
    vehicle?.transmission,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="DTC DIAGNOSTIC ASSIST"
      size="xl"
      hideFooter
      bodyScrollable={false}
    >
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Vehicle context
            </div>
            <div className="mt-2 text-sm text-[color:var(--theme-text-primary)]">
              {vehicleLabel || "No vehicle linked"}
            </div>
            <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
              {vehicleMeta || "Using work order context"}
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <label className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              DTC code
            </label>
            <input
              value={dtcCode}
              onChange={(e) => setDtcCode(e.target.value.toUpperCase())}
              placeholder="P0420 / SPN FMI / OEM code"
              className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/50"
            />

            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={busy || loadingThread}
              className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-[var(--accent-copper-soft)]/70 bg-[var(--accent-copper-faint)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper-light)] transition hover:bg-[var(--accent-copper-soft)]/20 disabled:opacity-60"
            >
              {busy && messages.length === 0 ? "Analyzing…" : "Start diagnosis"}
            </button>
          </div>

          {summary ? (
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                  Current summary
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${confidenceTone(summary.confidence)}`}
                >
                  {summary.confidence ?? "unknown"} confidence
                </span>
              </div>

              {summary.title ? (
                <div className="mt-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  {summary.title}
                </div>
              ) : null}

              {summary.description ? (
                <div className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
                  {summary.description}
                </div>
              ) : null}

              {summary.diagnosis ? (
                <div className="mt-3 text-sm text-[color:var(--theme-text-primary)]">
                  {summary.diagnosis}
                </div>
              ) : null}

              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => void sendToCauseCorrection()}
                  className="inline-flex w-full items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)]"
                >
                  Send to Cause / Correction
                </button>

                <button
                  type="button"
                  onClick={() => void handleApplyToJob()}
                  disabled={saving}
                  className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-on-accent)] shadow-[0_0_18px_rgba(197,122,74,0.45)] transition hover:brightness-110 disabled:opacity-60"
                >
                  {saving ? "Applying…" : "Apply summary to job"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex min-h-[540px] flex-col overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="border-b border-[color:var(--theme-border-soft)] px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Diagnostic conversation
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {loadingThread ? (
              <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading saved thread…</div>
            ) : messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
                Start with a DTC code, then keep feeding it test results.
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={
                      msg.role === "assistant"
                        ? "mr-8 rounded-2xl border border-[var(--accent-copper-soft)]/25 bg-[var(--accent-copper-faint)] px-4 py-3 text-sm text-[color:var(--theme-text-primary)]"
                        : "ml-8 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-primary)]"
                    }
                  >
                    <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                      {msg.role === "assistant" ? "AI diagnostic assist" : "You"}
                    </div>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                ))}

                {busy ? (
                  <div className="mr-8 rounded-2xl border border-[var(--accent-copper-soft)]/25 bg-[var(--accent-copper-faint)] px-4 py-3 text-sm text-[color:var(--theme-text-primary)]">
                    Thinking through code logic, vehicle context, and your latest test results…
                  </div>
                ) : null}

                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="border-t border-[color:var(--theme-border-soft)] px-4 py-4">
            <label className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Add test result or observation
            </label>
            <textarea
              rows={4}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Example: Rear O2 stays near 0.72V. Fuel trims +18 at idle. No exhaust leak found ahead of catalyst."
              className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/50"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleContinue()}
                disabled={busy || loadingThread || messages.length === 0}
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-60"
              >
                {busy ? "Working…" : "Continue diagnosis"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setSummary(null);
                  setUserInput("");
                  setDtcCode("");
                }}
                disabled={busy}
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)] transition hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-60"
              >
                Reset local view
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
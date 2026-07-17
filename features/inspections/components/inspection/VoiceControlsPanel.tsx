"use client";

import ModalShell from "@/features/shared/components/ModalShell";
import { Button } from "@shared/components/ui/Button";

type VoiceControlsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  voiceState: "idle" | "connecting" | "listening" | "error";
  isHeld: boolean;
};

const COMMAND_GROUPS = [
  {
    title: "Findings",
    description: "Work in any order. Name the item or area you are checking.",
    examples: [
      "Left front tire pressure 34 psi, tread 6 millimetres.",
      "Right rear shock leaking, fail.",
      "Front brake pads 8 millimetres, pass.",
      "All exterior lights pass.",
    ],
  },
  {
    title: "Parts and labour",
    description: "Add estimate details in the same sentence as the finding.",
    examples: [
      "Recommend right front wheel bearing, one bearing, 1.4 hours.",
      "Fail rear brake pads, add one pad set and 1.2 hours.",
      "Add two front tires to the left front tire finding.",
    ],
  },
  {
    title: "Corrections",
    description: "Correct the most recent finding naturally.",
    examples: [
      "Change that to recommend.",
      "Add note: worn on the outer edge.",
      "Correction: the measurement was 5 millimetres.",
    ],
  },
  {
    title: "Voice session",
    description: "The session stays free-form until you hold or stop it.",
    examples: [
      "Buster hold.",
      "Buster resume.",
      "Buster stop listening.",
    ],
  },
] as const;

function stateLabel(
  voiceState: VoiceControlsPanelProps["voiceState"],
  isHeld: boolean,
): string {
  if (isHeld) return "On hold";
  if (voiceState === "listening") return "Free-form listening";
  if (voiceState === "connecting") return "Connecting";
  if (voiceState === "error") return "Needs attention";
  return "Not listening";
}

export default function VoiceControlsPanel({
  isOpen,
  onClose,
  voiceState,
  isHeld,
}: VoiceControlsPanelProps): JSX.Element {
  const active = voiceState === "listening" || voiceState === "connecting";

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="VOICE CONTROLS"
      size="md"
      hideFooter
    >
      <div
        className="max-h-[76vh] space-y-4 overflow-y-auto pr-1"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
          <div className="border-b border-[color:var(--theme-border-soft)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand-primary)_22%,transparent),transparent)] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper-light)]">
                  Buster free-form voice
                </div>
                <h2 className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
                  Inspect your way
                </h2>
              </div>
              <span
                className={[
                  "shrink-0 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                  active && !isHeld
                    ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
                    : isHeld
                      ? "border-amber-400/35 bg-amber-500/10 text-amber-200"
                      : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] text-[color:var(--theme-text-secondary)]",
                ].join(" ")}
              >
                {stateLabel(voiceState, isHeld)}
              </span>
            </div>
            <p className="mt-2 text-sm leading-5 text-[color:var(--theme-text-secondary)]">
              Start listening once, then call out findings in any order. Buster
              matches each phrase to the inspection item you name. It never
              forces a sequence or advances you through a checklist.
            </p>
          </div>

          <div className="grid gap-3 p-3 sm:grid-cols-2">
            {COMMAND_GROUPS.map((group) => (
              <section
                key={group.title}
                className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-3"
              >
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-primary)]">
                  {group.title}
                </h3>
                <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                  {group.description}
                </p>
                <div className="mt-3 space-y-2">
                  {group.examples.map((example) => (
                    <div
                      key={example}
                      className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs leading-5 text-[color:var(--theme-text-primary)]"
                    >
                      “{example}”
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-3 text-xs leading-5 text-sky-100">
          <span className="font-semibold">Best results:</span> identify the
          corner, component or section when shop conversation could be
          ambiguous. You can combine several measurements and findings in one
          sentence.
        </div>

        <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
          Audio is processed only while voice capture is active. The visible
          status on the inspection screen always shows whether Buster is
          listening, held or stopped.
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="copper" size="sm" onClick={onClose}>
            Back to inspection
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

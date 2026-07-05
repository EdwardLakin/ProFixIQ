import React from "react";
import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";

type GuidedHighlight = {
  active?: boolean;
  highlightKey?: string;
  title?: string;
  description?: string;
};

type Props = {
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  guided?: GuidedHighlight | null;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  testId?: string;
  variant?: "copper" | "workspace";
};

export function GuidedSetupCardShell({
  eyebrow,
  title,
  description,
  guided,
  actions,
  children,
  testId,
  variant = "copper",
}: Props) {
  const cardClassName =
    variant === "workspace"
      ? "rounded-2xl border border-sky-500/20 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.08),rgba(15,23,42,0.92)_38%,rgba(2,6,23,0.96))] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.55)]"
      : "rounded-2xl border border-[color:var(--desktop-border)] bg-[radial-gradient(circle_at_top_left,rgba(197,122,74,0.13),rgba(15,23,42,0.92)_36%,rgba(2,6,23,0.96))] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.55)]";

  const card = (
    <section data-testid={testId} className={cardClassName}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/85">
            {eyebrow}
          </div>
          <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
          <div className="mt-3 space-y-2 text-sm text-neutral-300">
            {description}
          </div>
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
        ) : null}
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );

  if (guided?.active) {
    return (
      <OnboardingHighlightFrame
        active
        highlightKey={guided.highlightKey}
        title={guided.title ?? title}
        description={
          guided.description ??
          "Use this card to complete the guided setup step."
        }
      >
        {card}
      </OnboardingHighlightFrame>
    );
  }

  return card;
}

export default GuidedSetupCardShell;

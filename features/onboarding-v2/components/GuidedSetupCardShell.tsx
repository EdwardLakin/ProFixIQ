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
      ? "rounded-2xl border border-sky-500/20 bg-[var(--theme-gradient-panel)] p-4 shadow-[var(--theme-shadow-medium)]"
      : "rounded-2xl border border-[color:var(--desktop-border)] bg-[var(--theme-gradient-panel)] p-4 shadow-[var(--theme-shadow-medium)]";

  const card = (
    <section data-testid={testId} className={cardClassName}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/85">
            {eyebrow}
          </div>
          <h2 className="mt-2 text-xl font-semibold text-[color:var(--theme-text-primary)]">{title}</h2>
          <div className="mt-3 space-y-2 text-sm text-[color:var(--theme-text-secondary)]">
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

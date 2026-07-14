"use client";

import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  children: ReactNode;
  active?: boolean;
  highlightKey?: string;
};

export function OnboardingHighlightFrame({ title, description, children, active = true, highlightKey }: Props) {
  if (!active) return <>{children}</>;

  return (
    <section
      data-onboarding-highlight={highlightKey}
      className="rounded-2xl border border-orange-300/50 bg-transparent p-2 shadow-[0_0_0_1px_rgba(251,146,60,0.16),0_0_28px_rgba(251,146,60,0.16)]"
    >
      <div className="mb-2 rounded-xl border border-orange-300/25 bg-[color:var(--theme-surface-inset)] px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/80">Upload/setup here</div>
        <h2 className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">{title}</h2>
        <p className="mt-1 text-xs text-orange-100/75">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default OnboardingHighlightFrame;

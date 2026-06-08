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
      className="rounded-2xl border border-orange-400/40 bg-orange-950/20 p-4 shadow-lg shadow-orange-950/20"
    >
      <div className="mb-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/80">Upload/setup here</div>
        <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm text-orange-100/80">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default OnboardingHighlightFrame;

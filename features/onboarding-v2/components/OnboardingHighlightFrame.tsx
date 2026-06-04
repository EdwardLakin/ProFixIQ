"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  active: boolean;
  highlightKey: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function OnboardingHighlightFrame({ active, highlightKey, title, description, children }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [active, highlightKey]);

  return (
    <div
      ref={ref}
      data-onboarding-highlight={highlightKey}
      className={active ? "rounded-2xl border border-[rgba(197,122,74,0.65)] bg-[rgba(197,122,74,0.08)] p-2 shadow-[0_0_0_1px_rgba(197,122,74,0.18),0_24px_80px_rgba(197,122,74,0.16)]" : undefined}
    >
      {active ? (
        <div className="mb-2 rounded-xl border border-[rgba(197,122,74,0.45)] bg-[linear-gradient(135deg,rgba(197,122,74,0.22),rgba(15,23,42,0.88))] p-3 text-sm text-orange-50">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/80">Upload/setup here</div>
          <div className="mt-1 font-semibold text-white">{title}</div>
          <div className="mt-1 text-xs text-orange-100/80">{description}</div>
        </div>
      ) : null}
      {children}
    </div>
  );
}

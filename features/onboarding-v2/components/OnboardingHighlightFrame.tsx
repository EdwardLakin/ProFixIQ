import type { ReactNode } from "react";

type OnboardingHighlightFrameProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function OnboardingHighlightFrame({
  eyebrow = "Guided onboarding",
  title = "Optional setup assistant",
  description = "Use this card when you want guided data setup. It does not redirect sign-in, switch shops, or change production workflows.",
  children,
  className = "",
}: OnboardingHighlightFrameProps) {
  return (
    <section
      data-onboarding-optional="true"
      className={`rounded-2xl border border-orange-300/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.88),rgba(2,6,23,0.96))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.42)] ${className}`}
    >
      <div className="mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-200/80">{eyebrow}</div>
        <h2 className="mt-1 text-base font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-300">{description}</p>
      </div>
      {children}
    </section>
  );
}

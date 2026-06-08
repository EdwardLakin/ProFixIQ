import type { ReactNode } from "react";

export function OnboardingHighlightFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-orange-300/20 bg-[linear-gradient(135deg,rgba(251,146,60,0.12),rgba(15,23,42,0.72))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/80">Guided setup focus</p>
        <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm text-neutral-300">{description}</p>
      </div>
      {children}
    </section>
  );
}

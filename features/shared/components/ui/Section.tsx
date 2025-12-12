"use client";

import { cn } from "@shared/lib/utils";

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  ariaLabel?: string;
}

export default function Section({ children, className, id, ariaLabel }: SectionProps) {
  return (
    <section
      id={id}
      aria-label={ariaLabel || id || undefined}
      className={cn(
        "relative w-full px-4 sm:px-6",
        "py-12 md:py-16 lg:py-24",
        "fade-in",
        className,
      )}
    >
      {/* background texture */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {/* base */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "var(--metal-bg)" }}
        />

        {/* soft top glow */}
        <div
          className="absolute left-1/2 top-0 h-64 w-[900px] -translate-x-1/2 blur-3xl opacity-25"
          style={{ backgroundColor: "rgba(193, 102, 59, 0.18)" }}
        />

        {/* subtle gradient sweep */}
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "linear-gradient(120deg, rgba(255,255,255,0.08), rgba(255,255,255,0.0) 40%)",
          }}
        />

        {/* micro lines */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.05), rgba(0,0,0,0.10) 1px, rgba(0,0,0,0.20) 3px, rgba(255,255,255,0.02) 4px)",
          }}
        />

        {/* top/bottom dividers */}
        <div
          className="absolute left-0 right-0 top-0 h-px"
          style={{ backgroundColor: "rgba(148,163,184,0.18)" }}
        />
        <div
          className="absolute left-0 right-0 bottom-0 h-px"
          style={{ backgroundColor: "rgba(148,163,184,0.14)" }}
        />
      </div>

      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </section>
  );
}
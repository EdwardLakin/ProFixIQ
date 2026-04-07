"use client";

import type { ReactNode } from "react";

type PageShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export default function PageShell({
  title,
  description,
  actions,
  children,
}: PageShellProps) {
  return (
    <div className="space-y-6">
      <header
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-4 py-4 backdrop-blur-xl md:px-5"
        style={{
          borderColor:
            "color-mix(in srgb, var(--brand-primary, #C1663B) 28%, var(--metal-border-soft, rgba(148,163,184,0.3)))",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--brand-secondary, #0F172A) 82%, black), rgba(0,0,0,0.78))",
          boxShadow:
            "0 18px 45px rgba(0,0,0,0.45), 0 0 24px color-mix(in srgb, var(--brand-primary, #C1663B) 14%, transparent)",
        }}
      >
        <div>
          <h1
            className="text-xl tracking-[0.08em]"
            style={{
              fontFamily: "var(--font-blackops), system-ui, sans-serif",
              color: "var(--brand-accent, #E39A6E)",
            }}
          >
            {title}
          </h1>

          {description ? (
            <p
              className="mt-1 max-w-2xl text-sm"
              style={{
                color:
                  "color-mix(in srgb, var(--brand-primary, #C1663B) 22%, #cbd5e1)",
              }}
            >
              {description}
            </p>
          ) : null}
        </div>

        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>

      <div className="rounded-2xl">{children}</div>
    </div>
  );
}

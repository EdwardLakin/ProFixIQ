"use client";

import type { ReactNode } from "react";

type PageShellProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export default function PageShell({
  title,
  description,
  eyebrow,
  actions,
  children,
}: PageShellProps) {
  return (
    <div className="space-y-6">
      <header
        className="flex flex-wrap items-center justify-between gap-4 border px-4 py-4 backdrop-blur-xl md:px-5"
        style={{
          borderColor: "var(--theme-card-border,#334155)",
          background: "var(--theme-card-bg,#111827)",
          borderRadius: "var(--theme-radius-xl,1rem)",
          boxShadow: "var(--theme-shadow-medium,0_18px_45px_rgba(0,0,0,0.45))",
        }}
      >
        <div>
          {eyebrow ? (
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: "var(--theme-text-muted,#64748B)" }}
            >
              {eyebrow}
            </p>
          ) : null}

          <h1
            className="text-xl font-semibold tracking-[0.03em]"
            style={{
              color: "var(--theme-text-primary,#E2E8F0)",
            }}
          >
            {title}
          </h1>

          {description ? (
            <p
              className="mt-1 max-w-2xl text-sm"
              style={{ color: "var(--theme-text-secondary,#94A3B8)" }}
            >
              {description}
            </p>
          ) : null}
        </div>

        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>

      <div className="rounded-[var(--theme-radius-xl,1rem)]">{children}</div>
    </div>
  );
}

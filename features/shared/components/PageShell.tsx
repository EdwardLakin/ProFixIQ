"use client";

import type { ReactNode } from "react";

type PageShellProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
};

export default function PageShell({
  title,
  description,
  eyebrow,
  actions,
  toolbar,
  children,
}: PageShellProps) {
  return (
    <div className="space-y-6">
      <header className="desktop-panel px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {eyebrow ? (
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{ color: "var(--theme-text-muted,var(--theme-text-muted))" }}
              >
                {eyebrow}
              </p>
            ) : null}

            <h1 className="desktop-title text-xl font-semibold tracking-[0.03em] md:text-2xl">
              {title}
            </h1>

            {description ? (
              <p
                className="mt-1 max-w-2xl text-sm"
                style={{ color: "var(--theme-text-secondary,var(--theme-text-muted))" }}
              >
                {description}
              </p>
            ) : null}
          </div>

          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {toolbar ? <div className="desktop-toolbar-row mt-4">{toolbar}</div> : null}
      </header>

      <div className="rounded-[var(--theme-radius-xl,1rem)]">{children}</div>
    </div>
  );
}

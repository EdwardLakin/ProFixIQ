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
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-4 shadow-card backdrop-blur-xl md:px-5">
        <div>
          <h1
            className="text-xl tracking-[0.08em] text-[var(--accent-copper-light)]"
            style={{ fontFamily: "var(--font-blackops), system-ui, sans-serif" }}
          >
            {title}
          </h1>

          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-neutral-400">
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

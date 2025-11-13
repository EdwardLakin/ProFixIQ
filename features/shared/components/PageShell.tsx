// features/shared/components/PageShell.tsx
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
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/40 px-4 py-3 shadow-card backdrop-blur-md md:px-5">
        <div>
          <h1
            className="text-xl font-semibold tracking-wide text-orange-400"
            style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
          >
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-neutral-300">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>

      <div>{children}</div>
    </div>
  );
}
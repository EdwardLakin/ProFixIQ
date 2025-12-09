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

      {/* Header */}
      <header
        className="
          flex flex-wrap items-center justify-between gap-4
          rounded-2xl
          border border-white/10
          bg-black/30
          px-4 py-3 md:px-5
          shadow-card backdrop-blur-xl
        "
      >
        <div>
          <h1
            className="text-xl tracking-wide text-orange-400"
            style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
          >
            {title}
          </h1>

          {description && (
            <p className="mt-1 text-sm text-neutral-400">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap gap-2">
            {actions}
          </div>
        )}
      </header>

      {/* Body */}
      <div className="rounded-2xl">
        {children}
      </div>
    </div>
  );
}
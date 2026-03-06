"use client";

import type { ReactNode } from "react";

export default function DashboardSection(props: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { title, subtitle, children } = props;

  return (
    <section className="space-y-3">
      {title ? (
        <div>
          <div className="text-sm font-medium text-neutral-200">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-neutral-500">{subtitle}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

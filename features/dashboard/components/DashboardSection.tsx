"use client";

import type { ReactNode } from "react";
import SectionHeader from "@shared/components/ui/SectionHeader";
import { cn } from "@shared/lib/utils";

export default function DashboardSection(props: {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const {
    title,
    subtitle,
    eyebrow,
    actions,
    children,
    className,
    contentClassName,
  } = props;

  return (
    <section className={cn("space-y-4", className)}>
      {title ? (
        <SectionHeader
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          actions={actions}
        />
      ) : null}

      <div className={contentClassName}>{children}</div>
    </section>
  );
}

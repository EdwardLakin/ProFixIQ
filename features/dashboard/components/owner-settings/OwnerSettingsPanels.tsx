"use client";

import { cn } from "@shared/lib/utils";
import { PANEL_VARIANTS } from "@/features/shared/components/ui/panelHierarchy";

type PanelTone = keyof typeof PANEL_VARIANTS;

export function OwnerSettingsPanel({
  id,
  tone = "secondary",
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  id?: string;
  tone?: PanelTone;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section id={id} className={cn(PANEL_VARIANTS[tone], "space-y-4 p-5", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--theme-card-border,#334155)]/70 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary,#E2E8F0)]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary,#94A3B8)]">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>

      <div className={cn("space-y-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function OwnerSettingsSectionIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted,#64748B)]">
        {title}
      </p>
      <p className="text-sm text-[color:var(--theme-text-secondary,#94A3B8)]">{description}</p>
    </div>
  );
}

export function OwnerSettingsStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--theme-card-border,#334155)]/70 bg-[color:color-mix(in_srgb,var(--theme-surface-2,#0B1220)_85%,transparent)] p-3">
      <div className="text-[11px] text-[color:var(--theme-text-muted,#64748B)]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary,#E2E8F0)]">
        {value}
      </div>
    </div>
  );
}

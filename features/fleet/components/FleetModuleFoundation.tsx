import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export type FleetModuleCapability = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export default function FleetModuleFoundation({
  eyebrow,
  title,
  description,
  capabilities,
  primaryHref,
  primaryLabel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  capabilities: FleetModuleCapability[];
  primaryHref: string;
  primaryLabel: string;
}) {
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] shadow-[var(--theme-shadow-soft)]">
        <div className="relative px-5 py-6 sm:px-7 sm:py-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_48%)]" />
          <div className="relative max-w-3xl">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-500 dark:text-sky-300">
              {eyebrow}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
              {description}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {capabilities.map((capability) => {
          const Icon = capability.icon;
          return (
            <article
              key={capability.title}
              className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 shadow-[var(--theme-shadow-soft)]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/25 bg-sky-400/10 text-sky-500 dark:text-sky-300">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-sm font-semibold">{capability.title}</h2>
              <p className="mt-2 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                {capability.description}
              </p>
            </article>
          );
        })}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/[0.08] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-500 dark:text-sky-300" />
          <div>
            <div className="text-sm font-semibold">Fleet workspace established</div>
            <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
              This module now has a fleet-owned route and navigation boundary. Its operational records will remain fleet-scoped as the workflow is completed.
            </div>
          </div>
        </div>
        <Link
          href={primaryHref}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-300"
        >
          {primaryLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}

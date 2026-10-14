import Link from "next/link";

import {
  WORKSPACE_EYEBROW as EYEBROW,
  WORKSPACE_PANEL as PANEL,
} from "@/features/workspace/components";

export default function EquipmentSetupGuide({ assetId }: { assetId: string }) {
  const actionClass =
    "rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-left transition hover:bg-[color:var(--theme-surface-overlay)]";

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-6 lg:px-8">
      <section className={`${PANEL} p-5`} aria-labelledby="equipment-setup-guide-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={EYEBROW}>Equipment profile complete</p>
            <h2 id="equipment-setup-guide-title" className="mt-1 text-lg font-bold">
              Set up the machine for day-to-day use
            </h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
              The machine is ready in Asset Health. These are the usual next steps; do only what applies.
            </p>
          </div>
          <Link
            href={`/equipment/${assetId}`}
            className="rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold"
          >
            Dismiss setup
          </Link>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="#asset-components" className={actionClass}>
            <span className="block font-semibold">Add standard components</span>
            <span className="mt-1 block text-xs text-[color:var(--theme-text-muted)]">
              Seed the machine-specific component hierarchy.
            </span>
          </Link>
          <Link href="#asset-pm" className={actionClass}>
            <span className="block font-semibold">Create PM plan</span>
            <span className="mt-1 block text-xs text-[color:var(--theme-text-muted)]">
              Set hour, distance, cycle or calendar intervals.
            </span>
          </Link>
          <Link href="#asset-meters" className={actionClass}>
            <span className="block font-semibold">Record current meter</span>
            <span className="mt-1 block text-xs text-[color:var(--theme-text-muted)]">
              Establish the current operating baseline.
            </span>
          </Link>
          <Link href="/inspections" className={actionClass}>
            <span className="block font-semibold">Build inspection</span>
            <span className="mt-1 block text-xs text-[color:var(--theme-text-muted)]">
              Open the shared inspection workspace for Equipment.
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}

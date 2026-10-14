import Link from "next/link";

import { WORKSPACE_PANEL as PANEL } from "@/features/workspace/components";

const BUTTON =
  "min-h-10 rounded-lg border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-overlay)]";
const PRIMARY_BUTTON =
  "min-h-10 rounded-lg bg-[color:var(--accent-copper)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90";

export default function EquipmentWorkOrderActions({
  createWorkOrderHref,
}: {
  createWorkOrderHref: string | null;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <section className={`${PANEL} flex flex-wrap items-center justify-between gap-3 p-4`} aria-label="Equipment work order actions">
        <div>
          <p className="text-sm font-semibold">Work orders</p>
          <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
            Work stays on the canonical ProFixIQ work order and this asset&apos;s vehicle record.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={BUTTON} href="/equipment/work-orders">
            View Equipment work
          </Link>
          {createWorkOrderHref ? (
            <Link className={PRIMARY_BUTTON} href={createWorkOrderHref}>
              Create work order
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}

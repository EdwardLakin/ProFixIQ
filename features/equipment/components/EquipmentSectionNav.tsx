import Link from "next/link";

import { WORKSPACE_PANEL as PANEL } from "@/features/workspace/components";

const LINK =
  "rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-overlay)]";

export default function EquipmentSectionNav({ current }: { current: "assets" | "work-orders" }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <nav className={`${PANEL} flex flex-wrap gap-2 p-3`} aria-label="Equipment sections">
        <Link
          href="/equipment"
          className={`${LINK} ${current === "assets" ? "bg-[color:var(--theme-surface-overlay)]" : ""}`}
          aria-current={current === "assets" ? "page" : undefined}
        >
          Assets
        </Link>
        <Link
          href="/equipment/work-orders"
          className={`${LINK} ${current === "work-orders" ? "bg-[color:var(--theme-surface-overlay)]" : ""}`}
          aria-current={current === "work-orders" ? "page" : undefined}
        >
          Work Orders
        </Link>
      </nav>
    </div>
  );
}

import Link from "next/link";

import type { PageInfo } from "@/features/equipment/lib/equipmentDirectoryQuery";

const LINK =
  "min-h-10 inline-flex items-center rounded-lg border border-[color:var(--theme-border-soft)] px-4 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-overlay)]";
const DISABLED = "min-h-10 inline-flex items-center rounded-lg border border-[color:var(--theme-border-soft)] px-4 text-sm font-semibold opacity-40";

/** Previous / next page links; `hrefFor` returns the URL for a page number. */
export default function EquipmentPager({
  info,
  hrefFor,
}: {
  info: PageInfo;
  hrefFor: (page: number) => string;
}) {
  if (info.pageCount <= 1) return null;
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Pagination">
      {info.page > 1 ? (
        <Link className={LINK} href={hrefFor(info.page - 1)} rel="prev">
          Previous
        </Link>
      ) : (
        <span className={DISABLED} aria-disabled="true">Previous</span>
      )}
      <span className="text-xs text-[color:var(--theme-text-muted)]">
        Page {info.page} of {info.pageCount} · {info.from.toLocaleString()}–{info.to.toLocaleString()} of{" "}
        {info.total.toLocaleString()}
      </span>
      {info.page < info.pageCount ? (
        <Link className={LINK} href={hrefFor(info.page + 1)} rel="next">
          Next
        </Link>
      ) : (
        <span className={DISABLED} aria-disabled="true">Next</span>
      )}
    </nav>
  );
}

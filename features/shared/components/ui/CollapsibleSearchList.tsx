"use client";

import { useMemo, useState, type ReactNode } from "react";

const DEFAULT_PREVIEW_COUNT = 3;
const DEFAULT_PAGE_SIZE = 24;

export function filterBySearch<T>(
  items: readonly T[],
  query: string,
  getSearchText: (item: T) => string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  const terms = needle.split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const hay = getSearchText(item).toLowerCase();
    return terms.every((term) => hay.includes(term));
  });
}

type Props<T> = {
  title: string;
  description?: ReactNode;
  items: readonly T[];
  getKey: (item: T) => string;
  /** Text matched by the search box. Ignored when `filterItems` is provided. */
  getSearchText: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Optional pre-filter (e.g. a "include global" toggle) applied before search. */
  filterItems?: (items: readonly T[]) => readonly T[];
  searchPlaceholder?: string;
  previewCount?: number;
  pageSize?: number;
  loading?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
  noMatchMessage?: string;
  defaultOpen?: boolean;
  /** Extra controls rendered beside the search box (filters, toggles). */
  toolbar?: ReactNode;
  /** Buttons rendered in the section header (always visible, even collapsed). */
  headerActions?: ReactNode | ((ctx: { matches: T[] }) => ReactNode);
  /** Controls rendered between header and list when open (e.g. notices). */
  children?: ReactNode;
  /** Tailwind classes for the list container. */
  listClassName?: string;
  className?: string;
  /** Render in a flat layout (no outer panel chrome) for nesting inside another panel. */
  bare?: boolean;
};

export default function CollapsibleSearchList<T>({
  title,
  description,
  items,
  getKey,
  getSearchText,
  renderItem,
  filterItems,
  searchPlaceholder = "Search…",
  previewCount = DEFAULT_PREVIEW_COUNT,
  pageSize = DEFAULT_PAGE_SIZE,
  loading = false,
  loadingMessage = "Loading…",
  emptyMessage = "Nothing here yet.",
  noMatchMessage = "No results match your search.",
  defaultOpen = true,
  toolbar,
  headerActions,
  children,
  listClassName = "grid gap-2 sm:grid-cols-2 lg:grid-cols-3",
  className,
  bare = false,
}: Props<T>) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [limit, setLimit] = useState(pageSize);

  const filtered = useMemo(
    () => (filterItems ? filterItems(items) : items),
    [items, filterItems],
  );

  const matches = useMemo(
    () => filterBySearch(filtered, query, getSearchText),
    [filtered, query, getSearchText],
  );

  const searching = query.trim().length > 0;
  const showAll = expanded || searching;
  const visible = showAll
    ? matches.slice(0, limit)
    : matches.slice(0, previewCount);
  const hiddenCount = matches.length - visible.length;
  const canCollapse = !searching && expanded && matches.length > previewCount;
  const showSearch = items.length > previewCount || searching;

  const wrapperClass = bare
    ? ""
    : "rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] p-3 sm:p-4";

  const bodyId = `${title.replace(/\W+/g, "-").toLowerCase()}-body`;

  return (
    <div className={[wrapperClass, className].filter(Boolean).join(" ")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="group flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`mt-0.5 h-4 w-4 shrink-0 text-[color:var(--theme-text-secondary)] transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M5 8l5 5 5-5" />
          </svg>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                {title}
              </span>
              <span className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2 py-0.5 text-[10px] text-[color:var(--theme-text-secondary)]">
                {loading ? "…" : items.length}
              </span>
            </span>
            {description ? (
              <span className="mt-1 block text-[11px] text-[color:var(--theme-text-muted)]">
                {description}
              </span>
            ) : null}
          </span>
        </button>

        {headerActions ? (
          <div className="flex flex-wrap items-center gap-2">
            {typeof headerActions === "function"
              ? headerActions({ matches })
              : headerActions}
          </div>
        ) : null}
      </div>

      {open ? (
        <div id={bodyId} className="mt-3 space-y-3">
          {showSearch || toolbar ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {showSearch ? (
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setLimit(pageSize);
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={`Search ${title}`}
                  className="w-full rounded-md border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-xs text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:border-sky-400/70 focus:outline-none sm:max-w-sm sm:text-sm"
                />
              ) : null}
              {toolbar}
            </div>
          ) : null}

          {children}

          {loading ? (
            <div className="py-2 text-center text-sm text-[color:var(--theme-text-secondary)]">
              {loadingMessage}
            </div>
          ) : items.length === 0 ? (
            emptyMessage === "" ? null : (
              <div className="py-2 text-center text-sm text-[color:var(--theme-text-secondary)]">
                {emptyMessage}
              </div>
            )
          ) : matches.length === 0 ? (
            <div className="py-2 text-center text-sm text-[color:var(--theme-text-secondary)]">
              {noMatchMessage}
            </div>
          ) : (
            <div className={listClassName}>
              {visible.map((item) => (
                <div key={getKey(item)} className="contents">
                  {renderItem(item)}
                </div>
              ))}
            </div>
          )}

          {!loading && matches.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--theme-text-secondary)]">
              <span>
                Showing {visible.length} of {matches.length}
                {searching ? " matches" : ""}
              </span>
              {hiddenCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!showAll) setExpanded(true);
                    else setLimit((n) => n + pageSize);
                  }}
                  className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1 font-semibold text-[color:var(--theme-text-primary)] hover:border-sky-400/55"
                >
                  {showAll
                    ? `Show ${Math.min(pageSize, hiddenCount)} more`
                    : `Show all ${matches.length}`}
                </button>
              ) : null}
              {canCollapse ? (
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(false);
                    setLimit(pageSize);
                  }}
                  className="font-semibold text-[color:var(--theme-accent-text)] hover:underline"
                >
                  Show less
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

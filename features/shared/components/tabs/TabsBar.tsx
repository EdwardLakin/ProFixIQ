"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  MoreHorizontal,
  ReceiptText,
  Search,
  UserRound,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/features/shared/utils/cn";
import { useTabs } from "./TabsProvider";
import {
  visibleOpenWorkItems,
  type OpenWorkItem,
  type OpenWorkKind,
} from "./openWork";

const AUTH_ROUTES = new Set([
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
]);

type TabsBarProps = {
  subdued?: boolean;
};

function KindIcon({
  kind,
  className,
}: {
  kind: OpenWorkKind;
  className?: string;
}) {
  const props = { className: cn("h-3.5 w-3.5", className), "aria-hidden": true };
  if (kind === "dashboard") return <LayoutDashboard {...props} />;
  if (kind === "inspection") return <ClipboardCheck {...props} />;
  if (kind === "invoice") return <ReceiptText {...props} />;
  if (kind === "customer") return <UserRound {...props} />;
  if (kind === "appointment") return <CalendarDays {...props} />;
  return <Wrench {...props} />;
}

function WorkSignals({ item }: { item: OpenWorkItem }) {
  if (!item.dirty && !item.offline && !item.status) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {item.dirty ? (
        <span
          aria-label="Unsaved changes"
          title="Unsaved changes"
          className="h-1.5 w-1.5 rounded-full bg-amber-400"
        />
      ) : null}
      {item.offline ? (
        <WifiOff
          aria-label="Offline changes"
          className="h-3 w-3 text-amber-400"
        />
      ) : null}
      {item.status ? (
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-[var(--accent-copper)]"
        />
      ) : null}
    </span>
  );
}

export default function TabsBar({ subdued = false }: TabsBarProps) {
  const {
    tabs,
    activeKey,
    activateTab,
    closeTab,
    closeOthers,
    closeAll,
  } = useTabs();
  const pathname = usePathname() || "/";
  const [openWorkOpen, setOpenWorkOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isDashboardRoute =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  const visibleTabs = useMemo(
    () => visibleOpenWorkItems(tabs, activeKey, 5),
    [activeKey, tabs],
  );
  const workItems = useMemo(
    () =>
      tabs
        .filter((item) => !item.pinned)
        .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),
    [tabs],
  );
  const filteredWorkItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return workItems;
    return workItems.filter((item) =>
      [item.title, item.subtitle, item.status, item.kind]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, workItems]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpenWorkOpen(false);
        setActionsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenWorkOpen(false);
        setActionsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (AUTH_ROUTES.has(pathname) || isDashboardRoute) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden={subdued}
      className={cn(
        "sticky top-0 z-20 -mt-1 hidden w-full min-w-0 border-b px-2 transition-all duration-200 md:block",
        "border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] backdrop-blur-lg",
        subdued && "pointer-events-none opacity-25 saturate-50",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 py-1.5">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 items-center gap-1.5">
            <AnimatePresence initial={false}>
              {visibleTabs.map((item) => {
                const active = item.key === activeKey;
                return (
                  <motion.div
                    key={item.key}
                    layout
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className={cn(
                      "group inline-flex h-9 min-w-0 max-w-[17rem] items-center gap-1 rounded-lg border pl-2.5 pr-1.5 text-xs transition",
                      active
                        ? "border-[var(--accent-copper)]/60 bg-[color:var(--theme-surface-overlay)] text-[color:var(--theme-text-primary)] shadow-[0_0_0_1px_rgba(197,122,74,0.12),inset_0_1px_0_rgba(255,255,255,0.08)]"
                        : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-secondary)] hover:bg-[color:var(--theme-surface-panel)] hover:text-[color:var(--theme-text-primary)]",
                      item.pinned && "shrink-0",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => activateTab(item.key)}
                      title={item.subtitle || item.title}
                      aria-current={active ? "page" : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
                    >
                      <KindIcon
                        kind={item.kind}
                        className={active ? "text-[var(--accent-copper)]" : ""}
                      />
                      <span className="truncate font-medium">{item.title}</span>
                      <WorkSignals item={item} />
                    </button>
                    {!item.pinned ? (
                      <button
                        type="button"
                        onClick={() => closeTab(item.key)}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[color:var(--theme-text-muted)] transition hover:bg-[color:var(--theme-surface-hover)] hover:text-[color:var(--theme-text-primary)]"
                        aria-label={`Close ${item.title}`}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        <div className="relative ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setOpenWorkOpen((current) => !current);
              setActionsOpen(false);
            }}
            aria-expanded={openWorkOpen}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition",
              openWorkOpen
                ? "border-[var(--accent-copper)]/60 bg-[color:var(--theme-surface-overlay)] text-[color:var(--theme-text-primary)]"
                : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]",
            )}
          >
            <Wrench className="h-3.5 w-3.5" aria-hidden />
            Open work ({workItems.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActionsOpen((current) => !current);
              setOpenWorkOpen(false);
            }}
            aria-label="Open work actions"
            aria-expanded={actionsOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-secondary)] transition hover:text-[color:var(--theme-text-primary)]"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>

          {openWorkOpen ? (
            <section className="absolute right-10 top-[calc(100%+0.5rem)] z-50 w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] shadow-[var(--theme-shadow-medium)]">
              <div className="border-b border-[color:var(--theme-border-soft)] p-3">
                <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  Open work
                </div>
                <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
                  Working records saved on this device
                </div>
                <label className="mt-3 flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2">
                  <Search
                    className="h-3.5 w-3.5 text-[color:var(--theme-text-muted)]"
                    aria-hidden
                  />
                  <span className="sr-only">Search open work</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search work orders, customers…"
                    className="min-w-0 flex-1 bg-transparent text-xs text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)]"
                  />
                </label>
              </div>

              <div className="max-h-[24rem] overflow-y-auto p-2">
                {filteredWorkItems.length ? (
                  filteredWorkItems.map((item) => (
                    <div
                      key={item.key}
                      className={cn(
                        "group flex items-center gap-2 rounded-xl px-2 py-1.5",
                        item.key === activeKey
                          ? "bg-[color:var(--theme-surface-overlay)]"
                          : "hover:bg-[color:var(--theme-surface-subtle)]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          activateTab(item.key);
                          setOpenWorkOpen(false);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 px-1 py-1.5 text-left"
                      >
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[var(--accent-copper)]">
                          <KindIcon kind={item.kind} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-xs font-medium text-[color:var(--theme-text-primary)]">
                              {item.title}
                            </span>
                            <WorkSignals item={item} />
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-[color:var(--theme-text-muted)]">
                            {item.status || item.subtitle || "Ready to resume"}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => closeTab(item.key)}
                        aria-label={`Close ${item.title}`}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[color:var(--theme-text-muted)] hover:bg-[color:var(--theme-surface-hover)] hover:text-[color:var(--theme-text-primary)]"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-8 text-center text-xs text-[color:var(--theme-text-muted)]">
                    {workItems.length
                      ? "No open work matches that search."
                      : "Open a work order, inspection, invoice, or customer file to keep it here."}
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {actionsOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-44 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-1.5 shadow-[var(--theme-shadow-medium)]">
              <button
                type="button"
                onClick={() => {
                  closeOthers(activeKey);
                  setActionsOpen(false);
                }}
                disabled={!activeKey || activeKey === "dashboard"}
                className="w-full rounded-lg px-3 py-2 text-left text-xs text-[color:var(--theme-text-secondary)] hover:bg-[color:var(--theme-surface-subtle)] hover:text-[color:var(--theme-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Close other work
              </button>
              <button
                type="button"
                onClick={() => {
                  closeAll();
                  setActionsOpen(false);
                }}
                disabled={workItems.length === 0}
                className="w-full rounded-lg px-3 py-2 text-left text-xs text-[color:var(--theme-text-secondary)] hover:bg-[color:var(--theme-surface-subtle)] hover:text-[color:var(--theme-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Close all work
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Dialog } from "@headlessui/react";
import { Menu, X } from "lucide-react";
import ThemeToggleButton from "@/features/shared/components/ThemeToggleButton";
import styles from "./equipmentTheme.module.css";

import EquipmentAccountControls from "@/features/equipment/components/EquipmentAccountControls";
import { TechnicianCopilotShell } from "@/features/copilot/technician/components/TechnicianCopilotShell";
import {
  activeEquipmentShellKey,
  type EquipmentShellChild,
  type EquipmentShellItemKey,
} from "@/features/equipment/lib/equipmentShellNav";

export type EquipmentShellNavItem = {
  key: EquipmentShellItemKey;
  label: string;
  href: string;
  state: "live" | "planned";
  children?: readonly EquipmentShellChild[];
};

const ITEM =
  "flex min-h-11 shrink-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-overlay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
const ACTIVE =
  "bg-[color:var(--theme-surface-overlay)] shadow-[inset_3px_0_0_0_var(--accent-copper)]";
const CHILD =
  "block min-h-11 rounded-xl px-3 py-1.5 text-xs font-medium text-[color:var(--theme-text-muted)] transition hover:bg-[color:var(--theme-surface-overlay)]";

function PlannedBadge() {
  return (
    <span className="shrink-0 rounded border border-[color:var(--theme-border-soft)] px-1.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--theme-text-muted)]">
      Soon
    </span>
  );
}

const desktopQuery = "(min-width: 1024px)";
function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const desktopSnapshot = () => window.matchMedia(desktopQuery).matches;
const serverSnapshot = () => true;

/** Equipment-only chrome; destination authorization remains with each page. */
export default function EquipmentShell({
  items,
  homeHref = "/equipment/dashboard",
  isTechnician = false,
  children,
}: {
  items: readonly EquipmentShellNavItem[];
  /** Brand-link destination; the layout passes the first page the role can open. */
  homeHref?: string;
  /** Technicians keep the persistent CoPilot launcher the Shop shell gave them. */
  isTechnician?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/equipment";
  const activeKey = activeEquipmentShellKey(pathname);

  const desktop = useSyncExternalStore(
    subscribeDesktop,
    desktopSnapshot,
    serverSnapshot,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname, desktop]);

  const brand = (
    <Link
      href={homeHref}
      className="min-w-0 leading-tight"
      onClick={() => setDrawerOpen(false)}
    >
      <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-text-muted)]">
        ProFixIQ
      </span>
      <span className="block text-lg font-bold">Equipment</span>
    </Link>
  );

  const sidebar = (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-[color:var(--theme-border-soft)] p-4">
        <span
          aria-hidden="true"
          className="h-9 w-1 rounded bg-[color:var(--accent-copper)]"
        />
        {brand}
        {!desktop ? (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Close Equipment menu"
            onClick={() => setDrawerOpen(false)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <nav
          className="flex flex-col gap-1 p-3"
          aria-label="Equipment sections"
        >
          {items.map((item) => {
            const active = activeKey === item.key;
            return (
              <div key={item.key} className="min-w-0">
                <Link
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  className={`${ITEM} ${active ? ACTIVE : ""}`}
                  aria-current={
                    active && pathname.replace(/\/+$/, "") === item.href
                      ? "page"
                      : undefined
                  }
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {item.label}
                  </span>
                  {item.state === "planned" ? <PlannedBadge /> : null}
                </Link>
                {item.children?.length ? (
                  <div className="ml-3 flex flex-col border-l border-[color:var(--theme-border-soft)] pl-2">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setDrawerOpen(false)}
                        className={`${CHILD} [overflow-wrap:anywhere]`}
                        aria-current={
                          pathname.replace(/\/+$/, "") === child.href
                            ? "page"
                            : undefined
                        }
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-[color:var(--theme-border-soft)] p-3">
          <div className="mb-3 flex items-center justify-between gap-3 text-sm font-semibold">
            Appearance <ThemeToggleButton />
          </div>
          <EquipmentAccountControls />
        </div>
      </div>
    </>
  );

  return (
    <div className={`${styles.theme} ${styles.shell}`}>
      {desktop ? (
        <aside className={styles.sidebar} aria-label="Equipment workspace">
          {sidebar}
        </aside>
      ) : (
        <>
          <header className={styles.mobileHeader}>
            <button
              ref={menuButton}
              type="button"
              className={styles.iconButton}
              aria-label="Open Equipment menu"
              aria-expanded={drawerOpen}
              aria-haspopup="dialog"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={22} aria-hidden="true" />
            </button>
            {brand}
          </header>
          <Dialog
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            className={`${styles.theme} ${styles.drawer}`}
          >
            <div className={styles.backdrop} aria-hidden="true" />
            <Dialog.Panel className={styles.drawerPanel}>
              <Dialog.Title className="sr-only">Equipment menu</Dialog.Title>
              {sidebar}
            </Dialog.Panel>
          </Dialog>
        </>
      )}
      <div className="min-w-0 flex-1">{children}</div>
      <TechnicianCopilotShell shouldCheck={isTechnician} surface="desktop" />
    </div>
  );
}

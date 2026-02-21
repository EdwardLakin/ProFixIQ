"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import MobileShiftTracker from "@/features/mobile/components/MobileShiftTracker";

type DB = Database;

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/mobile", label: "Home" },
  { href: "/mobile/work-orders", label: "Jobs" },
  { href: "/mobile/messages", label: "Chat" },
  { href: "/mobile/settings", label: "Me" },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

function isActivePath(pathname: string, href: string) {
  const isRoot = href === "/mobile";
  if (isRoot) return pathname === href;
  return pathname.startsWith(href);
}

function NavSection({
  title,
  items,
  pathname,
  onClose,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  onClose: () => void;
}) {
  return (
    <div className="mb-3">
      <div className="px-2 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-neutral-500">
        {title}
      </div>

      <div className="space-y-1">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`metal-card block rounded-xl px-3 py-2 text-sm transition ${
                active
                  ? "border-[var(--accent-copper)] text-white"
                  : "border-[var(--metal-border-soft)] text-neutral-200 hover:border-[var(--accent-copper-light)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function MobileBottomNav({ open, onClose }: Props) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [userId, setUserId] = useState<string | null>(null);

  /* ---------------------------------------------------------------------- */
  /* Load current user – shift logic is handled inside MobileShiftTracker   */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const id = session?.user?.id ?? null;
      setUserId(id);
    };

    void load();
  }, [supabase]);

  /* ---------------------------------------------------------------------- */
  /* UI – Slide-in drawer                                                    */
  /* ---------------------------------------------------------------------- */
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity ${
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Side drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[80%] transform shadow-[12px_0_35px_rgba(0,0,0,0.9)] transition-transform duration-200 bg-[#050910] border-r border-[var(--metal-border-soft)] ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="metal-bar flex items-center justify-between px-4 py-3 border-b border-[var(--metal-border-soft)]">
          <div className="flex flex-col">
            <span className="font-blackops text-[0.65rem] tracking-[0.24em] text-[var(--accent-copper-light)]">
              PROFIXIQ
            </span>
            <span className="text-[0.7rem] text-neutral-300">Mobile Bench</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/50 hover:bg-black/70 active:scale-95"
          >
            ✕
          </button>
        </div>

        {/* Shift tracker – copper / glass card */}
        <div className="px-3 pt-3 pb-2 border-b border-[var(--metal-border-soft)] bg-black/40">
          {userId ? (
            <MobileShiftTracker userId={userId} />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-[0.7rem] text-neutral-300">
              Sign in to start tracking your shift.
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <NavSection
            title="Mobile"
            items={NAV_ITEMS}
            pathname={pathname}
            onClose={onClose}
          />
        </nav>

        {/* Footer */}
        <div className="border-t border-[var(--metal-border-soft)] px-4 py-2 text-[0.65rem] text-neutral-500">
          <div>Tech Mode</div>
          <div className="text-[0.6rem] text-neutral-600">v0.1 • Early Build</div>
        </div>
      </aside>
    </>
  );
}

export default MobileBottomNav;
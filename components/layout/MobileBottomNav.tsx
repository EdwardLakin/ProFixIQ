"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import MobileShiftTracker from "@/features/mobile/components/MobileShiftTracker";
import {
  getMobileTilesForRole,
  type MobileRole,
} from "@/features/mobile/config/mobile-tiles";
import {
  canonicalizeRole,
  getActorCapabilities,
} from "@/features/shared/lib/rbac";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type NavItem = {
  href: string;
  label: string;
  subtitle?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

type InstallAvailability = {
  available: boolean;
  ios: boolean;
};

function isActivePath(pathname: string, href: string) {
  return href === "/mobile" ? pathname === href : pathname.startsWith(href);
}

function MenuLink({
  item,
  pathname,
  onClose,
}: {
  item: NavItem;
  pathname: string;
  onClose: () => void;
}) {
  const active = isActivePath(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onClose}
      className={`block rounded-xl border px-3 py-2.5 transition ${
        active
          ? "border-[var(--accent-copper)] bg-[color:var(--theme-surface-overlay)]"
          : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] hover:border-[var(--accent-copper-soft)]"
      }`}
    >
      <div className="text-sm font-medium text-[color:var(--theme-text-primary)]">
        {item.label}
      </div>
      {item.subtitle ? (
        <div className="mt-0.5 text-[0.68rem] text-[color:var(--theme-text-muted)]">
          {item.subtitle}
        </div>
      ) : null}
    </Link>
  );
}

function MenuSection({
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
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-text-muted)]">
        {title}
      </h2>
      <div className="space-y-1.5">
        {items.map((item) => (
          <MenuLink
            key={`${item.href}-${item.label}`}
            item={item}
            pathname={pathname}
            onClose={onClose}
          />
        ))}
      </div>
    </section>
  );
}

export function MobileBottomNav({ open, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<MobileRole | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [install, setInstall] = useState<InstallAvailability>({
    available: false,
    ios: false,
  });

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const id = session?.user?.id ?? null;
      setUserId(id);
      if (!id) {
        setRole(null);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", id)
        .maybeSingle();
      const actor = getActorCapabilities({ role: profile?.role ?? null });
      const canonicalRole = canonicalizeRole(profile?.role ?? null);
      const allowedRole = actor.isKnownRole ? canonicalRole : null;
      setRole(
        (allowedRole === "unknown" ? null : allowedRole) as MobileRole | null,
      );
    };

    void load();
  }, [supabase]);

  useEffect(() => {
    const onAvailability = (event: Event) => {
      const custom = event as CustomEvent<InstallAvailability>;
      setInstall(custom.detail);
    };
    window.addEventListener(
      "profixiq:pwa-install-availability",
      onAvailability,
    );
    window.dispatchEvent(
      new Event("profixiq:pwa-install-availability-request"),
    );
    return () => {
      window.removeEventListener(
        "profixiq:pwa-install-availability",
        onAvailability,
      );
    };
  }, [open]);

  const navigationItems = useMemo<NavItem[]>(() => {
    const mechanic = role === "mechanic";
    const home: NavItem = {
      href: "/mobile",
      label: mechanic ? "Home" : "Dashboard",
      subtitle: mechanic
        ? "Current job and assigned work"
        : "Your role-specific mobile home",
    };
    if (!role) {
      return [home, { href: "/mobile/settings", label: "My account" }];
    }

    const dynamic = getMobileTilesForRole(role, ["all"]).map((tile) => ({
      href: tile.href,
      label: tile.title,
      subtitle: tile.subtitle,
    }));
    return [home, ...dynamic].filter(
      (item, index, items) =>
        items.findIndex((candidate) => candidate.href === item.href) === index,
    );
  }, [role]);

  const utilityItems = useMemo<NavItem[]>(() => {
    const syncItem: NavItem = {
      href: "/mobile/offline",
      label: "Offline & sync",
      subtitle: "Review queued work and sync status",
    };

    if (role === "mechanic") return [syncItem];

    return [
      {
        href: "/mobile/assistant",
        label: "Ask Assistant",
        subtitle: "Ask a deliberate question using shop context",
      },
      {
        href: "/mobile/planner",
        label: "Operations planner",
        subtitle: "Open mobile operational workspaces",
      },
      syncItem,
    ];
  }, [role]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      onClose();
      router.replace("/mobile/sign-in");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/45 backdrop-blur-sm transition-opacity ${
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(88vw,22rem)] transform flex-col border-r border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] shadow-[var(--theme-shadow-medium)] transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-[color:var(--theme-border-soft)] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
          <div>
            <div className="font-blackops text-sm tracking-[0.18em] text-[var(--accent-copper)]">
              PROFIXIQ
            </div>
            <div className="text-xs capitalize text-[color:var(--theme-text-secondary)]">
              {role ? `${role.replaceAll("_", " ")} menu` : "Mobile menu"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-lg"
          >
            ×
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
          {userId ? <MobileShiftTracker userId={userId} /> : null}

          <MenuSection
            title="Navigation"
            items={navigationItems}
            pathname={pathname}
            onClose={onClose}
          />

          {role === "mechanic" ? (
            <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3">
              <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                Ask ProFixIQ from a job
              </div>
              <p className="mt-1 text-[0.7rem] leading-4 text-[color:var(--theme-text-muted)]">
                Open a job and tap AI Assist so the vehicle and job context are
                included with the question.
              </p>
            </section>
          ) : null}

          <MenuSection
            title={role === "mechanic" ? "Device" : "Tools"}
            items={utilityItems}
            pathname={pathname}
            onClose={onClose}
          />

          {install.available ? (
            <section className="space-y-2">
              <h2 className="px-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-text-muted)]">
                App
              </h2>
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new Event("profixiq:pwa-install-request"),
                  )
                }
                className="w-full rounded-xl border border-[var(--accent-copper-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2.5 text-left"
              >
                <div className="text-sm font-medium text-[color:var(--theme-text-primary)]">
                  Install ProFixIQ
                </div>
                <div className="mt-0.5 text-[0.68rem] text-[color:var(--theme-text-muted)]">
                  {install.ios
                    ? "Add ProFixIQ to your Home Screen"
                    : "Install the app on this device"}
                </div>
              </button>
            </section>
          ) : null}
        </div>

        <footer className="border-t border-[color:var(--theme-border-soft)] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="w-full rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-sm font-medium text-red-700 disabled:opacity-60 dark:text-red-200"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </footer>
      </aside>
    </>
  );
}

export default MobileBottomNav;

"use client";

import {
  BarChart3,
  Bot,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  CloudOff,
  Download,
  Gauge,
  Home,
  ListChecks,
  LogOut,
  MessageCircle,
  RadioTower,
  RefreshCw,
  Route,
  Settings,
  Truck,
  Users,
  Wifi,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import MobileShiftTracker from "@/features/mobile/components/MobileShiftTracker";
import {
  getMobileTilesForRole,
  type MobileRole,
} from "@/features/mobile/config/mobile-tiles";
import { requireMobileHref } from "@/features/mobile/navigation/mobile-route-continuity";
import { useTabs } from "@/features/shared/components/tabs/TabsProvider";
import {
  canonicalizeRole,
  getActorCapabilities,
} from "@/features/shared/lib/rbac";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number | string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

type InstallAvailability = {
  available: boolean;
  ios: boolean;
};

type RuntimeStatus = {
  online: boolean;
  pending: number;
  queued: number;
  syncing: number;
  failed: number;
  conflicted: number;
  updateReady: boolean;
  activatingUpdate: boolean;
  syncBlocked: string | null;
};

const DEFAULT_RUNTIME_STATUS: RuntimeStatus = {
  online: true,
  pending: 0,
  queued: 0,
  syncing: 0,
  failed: 0,
  conflicted: 0,
  updateReady: false,
  activatingUpdate: false,
  syncBlocked: null,
};

function isActivePath(pathname: string, href: string) {
  return href === "/mobile" ? pathname === href : pathname.startsWith(href);
}

function roleLabel(role: MobileRole | null): string {
  if (!role) return "Mobile workspace";
  return role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function iconForHref(href: string): LucideIcon {
  if (href === "/mobile") return Home;
  if (href.includes("tech/queue") || href.includes("work-orders")) return BriefcaseBusiness;
  if (href.includes("inspections")) return ClipboardCheck;
  if (href.includes("appointments")) return CalendarDays;
  if (href.includes("messages")) return MessageCircle;
  if (href.includes("performance") || href.includes("reports")) return BarChart3;
  if (href.includes("workforce") || href.includes("technicians")) return Users;
  if (href.includes("dispatch")) return RadioTower;
  if (href.includes("parts")) return Boxes;
  if (href.includes("pretrip")) return ListChecks;
  if (href.includes("fleet")) return Truck;
  if (href.includes("assistant")) return Bot;
  if (href.includes("planner")) return Route;
  if (href.includes("settings")) return Settings;
  return Gauge;
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
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onClose}
      data-active={active ? "true" : "false"}
      className="mobile-command-nav-row"
    >
      <span className="mobile-command-nav-row__icon">
        <Icon aria-hidden className="h-[1.05rem] w-[1.05rem]" strokeWidth={2.1} />
      </span>
      <span className="mobile-command-nav-row__label">{item.label}</span>
      {item.badge != null ? (
        <span className="mobile-command-nav-row__badge">{item.badge}</span>
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
    <section className="space-y-1.5">
      <h2 className="mobile-command-drawer__section-title px-2 pb-1">{title}</h2>
      <div className="space-y-0.5">
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
  const { tabs, activateTab, closeTab } = useTabs();
  const [userId, setUserId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>("Team member");
  const [role, setRole] = useState<MobileRole | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [install, setInstall] = useState<InstallAvailability>({
    available: false,
    ios: false,
  });
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>(
    DEFAULT_RUNTIME_STATUS,
  );

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const id = session?.user?.id ?? null;
      setUserId(id);
      if (!id) {
        setRole(null);
        setProfileName("Team member");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", id)
        .maybeSingle();
      const actor = getActorCapabilities({ role: profile?.role ?? null });
      const canonicalRole = canonicalizeRole(profile?.role ?? null);
      const allowedRole = actor.isKnownRole ? canonicalRole : null;
      setRole(
        (allowedRole === "unknown" ? null : allowedRole) as MobileRole | null,
      );
      setProfileName(profile?.full_name?.trim() || "Team member");
    };

    void load();
  }, [supabase]);

  useEffect(() => {
    const onAvailability = (event: Event) => {
      const custom = event as CustomEvent<InstallAvailability>;
      setInstall(custom.detail);
    };
    const onRuntimeStatus = (event: Event) => {
      const custom = event as CustomEvent<RuntimeStatus>;
      setRuntimeStatus(custom.detail);
    };

    window.addEventListener("profixiq:pwa-install-availability", onAvailability);
    window.addEventListener("profixiq:pwa-runtime-status", onRuntimeStatus);
    window.dispatchEvent(new Event("profixiq:pwa-install-availability-request"));
    window.dispatchEvent(new Event("profixiq:pwa-runtime-status-request"));

    return () => {
      window.removeEventListener("profixiq:pwa-install-availability", onAvailability);
      window.removeEventListener("profixiq:pwa-runtime-status", onRuntimeStatus);
    };
  }, [open]);

  const navigationItems = useMemo<NavItem[]>(() => {
    const mechanic = role === "mechanic";
    const home: NavItem = {
      href: "/mobile",
      label: mechanic ? "Home" : "Dashboard",
      icon: Home,
    };

    if (!role) {
      return [
        home,
        { href: "/mobile/settings", label: "My account", icon: Settings },
      ];
    }

    const dynamic = getMobileTilesForRole(role, ["all"]).map((tile) => ({
      href: tile.href,
      label: tile.title,
      icon: iconForHref(tile.href),
    }));

    return [home, ...dynamic].filter(
      (item, index, items) =>
        items.findIndex((candidate) => candidate.href === item.href) === index,
    );
  }, [role]);

  const utilityItems = useMemo<NavItem[]>(() => {
    if (role === "mechanic") return [];

    return [
      { href: "/mobile/assistant", label: "Ask Assistant", icon: Bot },
      { href: "/mobile/planner", label: "Operations planner", icon: Route },
    ];
  }, [role]);

  const openWorkItems = useMemo(
    () =>
      tabs
        .filter((item) => !item.pinned)
        .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
        .slice(0, 5),
    [tabs],
  );

  const totalOpenWork = tabs.filter((item) => !item.pinned).length;
  const deviceNeedsAttention =
    !runtimeStatus.online ||
    runtimeStatus.pending > 0 ||
    runtimeStatus.failed > 0 ||
    runtimeStatus.conflicted > 0 ||
    Boolean(runtimeStatus.syncBlocked) ||
    runtimeStatus.updateReady;

  const deviceLabel = runtimeStatus.syncBlocked
    ? "Sync needs attention"
    : !runtimeStatus.online
      ? `Offline${runtimeStatus.pending ? ` · ${runtimeStatus.pending} pending` : ""}`
      : runtimeStatus.failed > 0 || runtimeStatus.conflicted > 0
        ? `${runtimeStatus.failed + runtimeStatus.conflicted} changes need attention`
        : runtimeStatus.pending > 0
          ? `Saving ${runtimeStatus.pending} changes`
          : "Online · All changes saved";

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
        className={`mobile-command-backdrop fixed inset-0 z-40 transition-opacity ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        aria-hidden={!open}
        className={`mobile-command-drawer fixed inset-y-0 left-0 z-50 flex transform flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <header className="mobile-command-drawer__header flex items-center justify-between gap-3 px-4 pb-4 pt-[calc(0.95rem+env(safe-area-inset-top,0px))]">
          <div className="min-w-0">
            <div className="font-blackops text-sm tracking-[0.18em] text-[#7dcfff]">
              PROFIXIQ
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-white">
              {profileName}
            </div>
            <div className="mt-0.5 text-xs text-slate-300">{roleLabel(role)}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/[0.07] text-white active:scale-95"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </header>

        <div className="mobile-command-drawer__scroll flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {userId ? <MobileShiftTracker userId={userId} /> : null}

          {openWorkItems.length ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <h2 className="mobile-command-drawer__section-title">Resume</h2>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] font-bold text-slate-200">
                  {totalOpenWork}
                </span>
              </div>
              <div className="space-y-2">
                {openWorkItems.map((item) => (
                  <div key={item.key} className="mobile-command-resume-card flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        activateTab(
                          item.key,
                          requireMobileHref(item.mobileHref ?? item.href),
                        );
                        onClose();
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex items-center gap-2">
                        <Wrench aria-hidden className="h-4 w-4 shrink-0 text-[#7dcfff]" />
                        <span className="truncate text-sm font-semibold text-white">
                          {item.title}
                        </span>
                        {item.dirty ? (
                          <span
                            aria-label="Unsaved changes"
                            className="h-2 w-2 shrink-0 rounded-full bg-amber-400"
                          />
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate pl-6 text-[0.69rem] text-slate-300">
                        {item.status || item.subtitle || "Ready to resume"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => closeTab(item.key)}
                      aria-label={`Close ${item.title}`}
                      className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-300 active:bg-white/10"
                    >
                      <X aria-hidden className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <MenuSection
            title="Work"
            items={navigationItems}
            pathname={pathname}
            onClose={onClose}
          />

          <MenuSection
            title="Tools"
            items={utilityItems}
            pathname={pathname}
            onClose={onClose}
          />

          <section className="space-y-2">
            <h2 className="mobile-command-drawer__section-title px-2">Device & sync</h2>
            <div
              className="mobile-command-device-card"
              data-attention={deviceNeedsAttention ? "true" : "false"}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.08]">
                  {runtimeStatus.online ? (
                    <Wifi aria-hidden className="h-4.5 w-4.5 text-emerald-300" />
                  ) : (
                    <CloudOff aria-hidden className="h-4.5 w-4.5 text-amber-300" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">{deviceLabel}</div>
                  <div className="mt-1 text-[0.69rem] leading-4 text-slate-300">
                    {runtimeStatus.syncBlocked
                      ? runtimeStatus.syncBlocked
                      : runtimeStatus.conflicted > 0
                        ? `${runtimeStatus.conflicted} conflict${runtimeStatus.conflicted === 1 ? "" : "s"} require review.`
                        : runtimeStatus.failed > 0
                          ? `${runtimeStatus.failed} saved change${runtimeStatus.failed === 1 ? "" : "s"} failed to sync.`
                          : runtimeStatus.updateReady
                            ? "A new ProFixIQ version is ready."
                            : "Offline work and updates are managed here."}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/mobile/offline"
                  onClick={onClose}
                  className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/[0.07] px-3 text-xs font-semibold text-white"
                >
                  View details
                </Link>
                {runtimeStatus.updateReady ? (
                  <button
                    type="button"
                    onClick={() =>
                      window.dispatchEvent(new Event("profixiq:pwa-update-request"))
                    }
                    disabled={
                      runtimeStatus.activatingUpdate || runtimeStatus.pending > 0
                    }
                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#32b9f3] px-3 text-xs font-bold text-[#041022] disabled:opacity-55"
                  >
                    <RefreshCw
                      aria-hidden
                      className={`h-4 w-4 ${
                        runtimeStatus.activatingUpdate ? "animate-spin" : ""
                      }`}
                    />
                    {runtimeStatus.activatingUpdate
                      ? "Updating"
                      : runtimeStatus.pending > 0
                        ? "Sync first"
                        : "Update"}
                  </button>
                ) : null}
              </div>
            </div>

            {install.available ? (
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(new Event("profixiq:pwa-install-request"))
                }
                className="mobile-command-nav-row w-full text-left"
              >
                <span className="mobile-command-nav-row__icon">
                  <Download aria-hidden className="h-[1.05rem] w-[1.05rem]" />
                </span>
                <span className="mobile-command-nav-row__label">
                  {install.ios ? "Add to Home Screen" : "Install ProFixIQ"}
                </span>
              </button>
            ) : null}
          </section>
        </div>

        <footer className="border-t border-white/10 px-3 pb-[calc(0.8rem+env(safe-area-inset-bottom,0px))] pt-3">
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="mobile-command-nav-row w-full text-left disabled:opacity-60"
          >
            <span className="mobile-command-nav-row__icon text-rose-300">
              <LogOut aria-hidden className="h-[1.05rem] w-[1.05rem]" />
            </span>
            <span className="mobile-command-nav-row__label">
              {signingOut ? "Signing out…" : "Sign out"}
            </span>
          </button>
        </footer>
      </aside>
    </>
  );
}

export default MobileBottomNav;

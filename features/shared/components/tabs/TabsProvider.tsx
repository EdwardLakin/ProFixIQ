"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { metaFor } from "@/features/shared/lib/routeMeta";

type Tab = { href: string; title: string; icon?: string; pinned?: boolean };

type TabsContextValue = {
  tabs: Tab[];
  activeHref: string;
  openTab: (href: string) => void;
  activateTab: (href: string) => void;
  closeTab: (href: string) => void;
  closeOthers: (href: string) => void;
  closeAll: () => void;
};

const TabsCtx = createContext<TabsContextValue | null>(null);

export const useTabs = (): TabsContextValue => {
  const ctx = useContext(TabsCtx);
  if (!ctx) throw new Error("useTabs must be used inside <TabsProvider>");
  return ctx;
};

function storageKey(userId?: string) {
  return `dash-tabs:${userId ?? "anon"}`;
}

type PersistShape = { tabs: Tab[]; activeHref: string };

const DASH_TAB: Tab = { href: "/dashboard", title: "Dashboard", pinned: true };

function ensurePinnedDashboard(list: Tab[]): Tab[] {
  const withoutDash = (Array.isArray(list) ? list : []).filter(
    (t) => t?.href && t.href !== "/dashboard",
  );
  return [DASH_TAB, ...withoutDash];
}

export function TabsProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";

  // ✅ Synchronous initial state: dashboard tab exists immediately
  const [tabs, setTabs] = useState<Tab[]>(() => [DASH_TAB]);
  const [activeHref, setActiveHref] = useState<string>(() => "/dashboard");

  // Load persisted (but always ensure dashboard pinned)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistShape>;

      const loaded = Array.isArray(parsed.tabs) ? parsed.tabs : [];
      setTabs(ensurePinnedDashboard(loaded));

      if (typeof parsed.activeHref === "string" && parsed.activeHref.trim()) {
        setActiveHref(parsed.activeHref);
      } else {
        setActiveHref("/dashboard");
      }
    } catch {
      // noop
    }
  }, [userId]);

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey(userId),
        JSON.stringify({ tabs, activeHref }),
      );
    } catch {
      // noop
    }
  }, [tabs, activeHref, userId]);

  // Sync across browser tabs/windows
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey(userId) || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as PersistShape;
        const loaded = Array.isArray(parsed.tabs) ? parsed.tabs : [];
        setTabs(ensurePinnedDashboard(loaded));
        setActiveHref(parsed.activeHref || "/dashboard");
      } catch {
        // noop
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  // Auto-open a tab if route wants to appear
  const lastPath = useRef<string>("");
  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    lastPath.current = pathname;

    const { title, icon, show } = metaFor(pathname);

    // Always keep activeHref in sync with navigation
    setActiveHref(pathname);

    if (!show) return;

    setTabs((prev) => {
      const next = ensurePinnedDashboard(prev);
      if (next.some((t) => t.href === pathname)) return next;
      return [...next, { href: pathname, title, icon }];
    });
  }, [pathname]);

  const api = useMemo<TabsContextValue>(
    () => ({
      tabs,
      activeHref,

      openTab: (href) => {
        const { title, icon, show } = metaFor(href);

        setActiveHref(href);
        router.push(href);

        if (!show) return;

        setTabs((prev) => {
          const next = ensurePinnedDashboard(prev);
          if (next.some((t) => t.href === href)) return next;
          return [...next, { href, title, icon }];
        });
      },

      activateTab: (href) => {
        setActiveHref(href);
        router.push(href);
      },

      closeTab: (href) => {
        if (href === "/dashboard") return; // pinned

        setTabs((prev) => {
          const nextTabs = ensurePinnedDashboard(
            prev.filter((t) => t.href !== href),
          );

          // If closing active tab, pick a new active tab based on nextTabs
          if (activeHref === href) {
            const last = nextTabs[nextTabs.length - 1]?.href ?? "/dashboard";
            setActiveHref(last);
            router.push(last);
          }

          return nextTabs;
        });
      },

      closeOthers: (href) => {
        setTabs((prev) => {
          const keep =
            href === "/dashboard"
              ? [DASH_TAB]
              : [DASH_TAB, ...prev.filter((t) => t.href === href)];
          return ensurePinnedDashboard(keep);
        });
        setActiveHref(href);
        router.push(href);
      },

      closeAll: () => {
        setTabs([DASH_TAB]);
        setActiveHref("/dashboard");
        router.push("/dashboard");
      },
    }),
    [tabs, activeHref, router],
  );

  return <TabsCtx.Provider value={api}>{children}</TabsCtx.Provider>;
}
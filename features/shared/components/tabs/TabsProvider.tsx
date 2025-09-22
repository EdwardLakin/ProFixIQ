"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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

export function TabsProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeHref, setActiveHref] = useState<string>("");

  // Seed with pinned Dashboard on first paint
  useEffect(() => {
    setTabs((prev) => {
      if (prev.some((t) => t.href === "/dashboard")) return prev;
      return [{ href: "/dashboard", title: "Dashboard", pinned: true }];
    });
    if (!activeHref) setActiveHref("/dashboard");
  }, []); // once

  // Load persisted (but always ensure dashboard pinned)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistShape>;
      const loaded = Array.isArray(parsed.tabs) ? parsed.tabs : [];
      const withPinned = [
        { href: "/dashboard", title: "Dashboard", pinned: true },
        ...loaded.filter((t) => t.href !== "/dashboard"),
      ];
      setTabs(withPinned);
      if (typeof parsed.activeHref === "string") setActiveHref(parsed.activeHref || "/dashboard");
    } catch {}
  }, [userId]);

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify({ tabs, activeHref }));
    } catch {}
  }, [tabs, activeHref, userId]);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey(userId) || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as PersistShape;
        const loaded = parsed.tabs ?? [];
        const withPinned = [
          { href: "/dashboard", title: "Dashboard", pinned: true },
          ...loaded.filter((t) => t.href !== "/dashboard"),
        ];
        setTabs(withPinned);
        setActiveHref(parsed.activeHref || "/dashboard");
      } catch {}
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
    if (!show) {
      setActiveHref(pathname);
      return;
    }
    setTabs((prev) => (prev.some((t) => t.href === pathname) ? prev : [...prev, { href: pathname, title, icon }]));
    setActiveHref(pathname);
  }, [pathname]);

  const api = useMemo<TabsContextValue>(
    () => ({
      tabs,
      activeHref,

      openTab: (href) => {
        const { title, icon, show } = metaFor(href);
        if (!show) {
          setActiveHref(href);
          router.push(href);
          return;
        }
        setTabs((prev) => (prev.some((t) => t.href === href) ? prev : [...prev, { href, title, icon }]));
        setActiveHref(href);
        router.push(href);
      },

      activateTab: (href) => {
        setActiveHref(href);
        router.push(href);
      },

      closeTab: (href) => {
        // never close pinned
        if (href === "/dashboard") return;
        setTabs((prev) => prev.filter((t) => t.href !== href));
        if (activeHref === href) {
          const remaining = tabs.filter((t) => t.href !== href);
          const next = remaining.length ? remaining[remaining.length - 1].href : "/dashboard";
          setActiveHref(next);
          router.push(next);
        }
      },

      closeOthers: (href) => {
        setTabs((prev) => [{ href: "/dashboard", title: "Dashboard", pinned: true }, ...prev.filter((t) => t.href === href && href !== "/dashboard")]);
        setActiveHref(href);
        router.push(href);
      },

      closeAll: () => {
        setTabs([{ href: "/dashboard", title: "Dashboard", pinned: true }]);
        setActiveHref("/dashboard");
        router.push("/dashboard");
      },
    }),
    [tabs, activeHref, router]
  );

  return <TabsCtx.Provider value={api}>{children}</TabsCtx.Provider>;
}
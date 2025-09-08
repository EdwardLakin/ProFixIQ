"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { metaFor } from "@/features/shared/lib/routeMeta";

type Tab = { href: string; title: string; icon?: string };
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
export const useTabs = () => {
  const ctx = useContext(TabsCtx);
  if (!ctx) throw new Error("useTabs must be used inside <TabsProvider>");
  return ctx;
};

function storageKey(userId?: string) {
  return `dash-tabs:${userId ?? "anon"}`;
}

export function TabsProvider({ children, userId }: { children: React.ReactNode; userId?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeHref, setActiveHref] = useState<string>("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as { tabs: Tab[]; activeHref?: string };
        setTabs(parsed.tabs ?? []);
        setActiveHref(parsed.activeHref ?? "");
      }
    } catch {}
  }, [userId]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify({ tabs, activeHref }));
    } catch {}
  }, [tabs, activeHref, userId]);

  const lastPath = useRef<string>("");
  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    lastPath.current = pathname;

    const { title, icon, show } = metaFor(pathname);
    if (!show) {
      setActiveHref(pathname);
      return;
    }
    setTabs((prev) => {
      if (prev.some((t) => t.href === pathname)) return prev;
      return [...prev, { href: pathname, title, icon }];
    });
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
        setTabs((prev) => prev.filter((t) => t.href !== href));
        if (activeHref === href) {
          const next = tabs.filter((t) => t.href !== href).slice(-1)[0]?.href ?? "/dashboard";
          setActiveHref(next);
          router.push(next);
        }
      },
      closeOthers: (href) => {
        setTabs((prev) => prev.filter((t) => t.href === href));
        setActiveHref(href);
        router.push(href);
      },
      closeAll: () => {
        setTabs([]);
        setActiveHref("/dashboard");
        router.push("/dashboard");
      },
    }),
    [tabs, activeHref, router],
  );

  return <TabsCtx.Provider value={api}>{children}</TabsCtx.Provider>;
}

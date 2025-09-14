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

const keyFor = (uid?: string) => `dash-tabs:${uid ?? "anon"}`;

export function TabsProvider({ children, userId }: { children: React.ReactNode; userId?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeHref, setActiveHref] = useState<string>("");

  // Load persisted tabs for this user
  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as { tabs: Tab[]; activeHref?: string };
        setTabs(Array.isArray(parsed.tabs) ? parsed.tabs : []);
        setActiveHref(typeof parsed.activeHref === "string" ? parsed.activeHref : "");
      } else {
        setTabs([]);
        setActiveHref("");
      }
    } catch {
      // ignore
    }
  }, [userId]);

  // Persist changes for this user
  useEffect(() => {
    try {
      localStorage.setItem(keyFor(userId), JSON.stringify({ tabs, activeHref }));
    } catch {
      // ignore
    }
  }, [tabs, activeHref, userId]);

  // Cross-tab sync (keep multiple browser windows consistent)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== keyFor(userId) || !e.newValue) return;
      try {
        const { tabs: t, activeHref: a } = JSON.parse(e.newValue) as { tabs: Tab[]; activeHref?: string };
        setTabs(Array.isArray(t) ? t : []);
        if (typeof a === "string") setActiveHref(a);
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  // Auto-open current route as a tab when the route changes (if eligible)
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
        setTabs((prev) => {
          const nextTabs = prev.filter((t) => t.href !== href);
          if (activeHref === href) {
            const next = nextTabs.slice(-1)[0]?.href ?? "/dashboard";
            setActiveHref(next);
            router.push(next);
          }
          return nextTabs;
        });
      },
      closeOthers: (href) => {
        setTabs((prev) => {
          const keep = prev.find((t) => t.href === href);
          const nextTabs = keep ? [keep] : [];
          setActiveHref(keep?.href ?? "/dashboard");
          router.push(keep?.href ?? "/dashboard");
          return nextTabs;
        });
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
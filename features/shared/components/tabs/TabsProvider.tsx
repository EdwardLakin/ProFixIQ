"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  DASHBOARD_OPEN_WORK_ITEM,
  migrateLegacyTabs,
  resolveOpenWork,
  sanitizePersistedOpenWork,
  updateOpenWorkItem,
  upsertOpenWork,
  type OpenWorkItem,
  type OpenWorkUpdate,
} from "./openWork";

type TabsContextValue = {
  tabs: OpenWorkItem[];
  activeKey: string;
  activeHref: string;
  openTab: (href: string) => void;
  activateTab: (key: string, navigationHref?: string) => void;
  closeTab: (key: string) => void;
  closeOthers: (key: string) => void;
  closeAll: () => void;
  updateActiveTab: (update: OpenWorkUpdate) => void;
};

const TabsCtx = createContext<TabsContextValue | null>(null);

export const useTabs = (): TabsContextValue => {
  const ctx = useContext(TabsCtx);
  if (!ctx) throw new Error("useTabs must be used inside <TabsProvider>");
  return ctx;
};

function storageKey(userId?: string) {
  return `open-work:v2:${userId ?? "anon"}`;
}

function legacyStorageKey(userId?: string) {
  return `dash-tabs:${userId ?? "anon"}`;
}

type PersistShape = {
  version: 2;
  tabs: OpenWorkItem[];
  activeKey: string;
};

type LegacyPersistShape = {
  tabs?: Array<{ href?: unknown; title?: unknown }>;
  activeHref?: unknown;
};

export function TabsProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [tabs, setTabs] = useState<OpenWorkItem[]>([
    DASHBOARD_OPEN_WORK_ITEM,
  ]);
  const [activeKey, setActiveKey] = useState("dashboard");
  const [hydrated, setHydrated] = useState(false);
  const lastPath = useRef<string>("");
  const initialPath = useRef(pathname);
  const hydratedStorageKey = useRef<string | null>(null);
  const dashboardHref =
    pathname === "/mobile" || pathname.startsWith("/mobile/")
      ? "/mobile"
      : "/dashboard";

  useEffect(() => {
    hydratedStorageKey.current = null;
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistShape>;
        const loaded = sanitizePersistedOpenWork(parsed.tabs);
        const currentRouteKey =
          resolveOpenWork(initialPath.current)?.key ?? "";
        setTabs(loaded);
        setActiveKey(
          loaded.some((item) => item.key === currentRouteKey)
            ? currentRouteKey
            : "",
        );
        setHydrated(true);
        return;
      }

      const legacyRaw = localStorage.getItem(legacyStorageKey(userId));
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as LegacyPersistShape;
        const migrated = migrateLegacyTabs(
          Array.isArray(legacy.tabs) ? legacy.tabs : [],
        );
        const legacyActive =
          typeof legacy.activeHref === "string"
            ? resolveOpenWork(legacy.activeHref)
            : null;
        const currentRouteKey =
          resolveOpenWork(initialPath.current)?.key ?? "";
        setTabs(migrated);
        setActiveKey(
          migrated.some((item) => item.key === currentRouteKey)
            ? currentRouteKey
            : legacyActive &&
                migrated.some((item) => item.key === legacyActive.key) &&
                initialPath.current === legacyActive.href
              ? legacyActive.key
              : "",
        );
      }
    } catch {
      setTabs([DASHBOARD_OPEN_WORK_ITEM]);
      setActiveKey("dashboard");
    } finally {
      hydratedStorageKey.current = storageKey(userId);
      setHydrated(true);
    }
  }, [userId]);

  useEffect(() => {
    if (
      !hydrated ||
      hydratedStorageKey.current !== storageKey(userId)
    ) {
      return;
    }
    try {
      const payload: PersistShape = { version: 2, tabs, activeKey };
      localStorage.setItem(storageKey(userId), JSON.stringify(payload));
    } catch {
      // Local storage can be unavailable in private browsing or managed devices.
    }
  }, [tabs, activeKey, hydrated, userId]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey(userId) || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as Partial<PersistShape>;
        const loaded = sanitizePersistedOpenWork(parsed.tabs);
        const currentRouteKey = resolveOpenWork(pathname)?.key ?? "";
        setTabs(loaded);
        setActiveKey(
          loaded.some((item) => item.key === currentRouteKey)
            ? currentRouteKey
            : "",
        );
      } catch {
        // Ignore malformed writes from stale browser sessions.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [pathname, userId]);

  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    lastPath.current = pathname;

    const next = resolveOpenWork(pathname);
    if (!next) {
      setActiveKey("");
      return;
    }

    setActiveKey(next.key);
    if (next.key !== DASHBOARD_OPEN_WORK_ITEM.key) {
      setTabs((current) => upsertOpenWork(current, next));
    }
  }, [pathname]);

  const openTab = useCallback(
    (href: string) => {
      const next = resolveOpenWork(href);
      if (next) {
        setActiveKey(next.key);
        if (next.key !== DASHBOARD_OPEN_WORK_ITEM.key) {
          setTabs((current) => upsertOpenWork(current, next));
        }
      }
      router.push(href);
    },
    [router],
  );

  const activateTab = useCallback(
    (key: string, navigationHref?: string) => {
      const item = tabs.find((candidate) => candidate.key === key);
      if (!item) return;
      setActiveKey(key);
      setTabs((current) =>
        current.map((candidate) =>
          candidate.key === key && !candidate.pinned
            ? { ...candidate, lastOpenedAt: Date.now() }
            : candidate,
        ),
      );
      router.push(navigationHref ?? item.href);
    },
    [router, tabs],
  );

  const closeTab = useCallback(
    (key: string) => {
      if (key === DASHBOARD_OPEN_WORK_ITEM.key) return;
      const closingActive = activeKey === key;
      setTabs((current) =>
        current.filter((item) => item.key !== key || item.pinned),
      );
      if (closingActive) {
        setActiveKey("dashboard");
        router.push(dashboardHref);
      }
    },
    [activeKey, dashboardHref, router],
  );

  const closeOthers = useCallback(
    (key: string) => {
      const item = tabs.find((candidate) => candidate.key === key);
      if (!item || key === DASHBOARD_OPEN_WORK_ITEM.key) {
        setTabs([DASHBOARD_OPEN_WORK_ITEM]);
        setActiveKey("dashboard");
        router.push(dashboardHref);
        return;
      }
      setTabs([DASHBOARD_OPEN_WORK_ITEM, item]);
      setActiveKey(key);
      router.push(item.href);
    },
    [dashboardHref, router, tabs],
  );

  const closeAll = useCallback(() => {
    setTabs([DASHBOARD_OPEN_WORK_ITEM]);
    setActiveKey("dashboard");
    router.push(dashboardHref);
  }, [dashboardHref, router]);

  const updateActiveTab = useCallback(
    (update: OpenWorkUpdate) => {
      if (!activeKey || activeKey === DASHBOARD_OPEN_WORK_ITEM.key) return;
      setTabs((current) => updateOpenWorkItem(current, activeKey, update));
    },
    [activeKey],
  );

  const activeHref =
    tabs.find((item) => item.key === activeKey)?.href ?? pathname;

  const api = useMemo<TabsContextValue>(
    () => ({
      tabs,
      activeKey,
      activeHref,
      openTab,
      activateTab,
      closeTab,
      closeOthers,
      closeAll,
      updateActiveTab,
    }),
    [
      tabs,
      activeKey,
      activeHref,
      openTab,
      activateTab,
      closeTab,
      closeOthers,
      closeAll,
      updateActiveTab,
    ],
  );

  return <TabsCtx.Provider value={api}>{children}</TabsCtx.Provider>;
}

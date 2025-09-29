"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type Task = {
  route: string;
  title: string;
  icon?: React.ReactNode;
  lastActive: number;
};

type Ctx = {
  tasks: Task[];
  activeRoute: string | null;
  openOrFocus(route: string, title: string, icon?: React.ReactNode): void;
  close(route: string): void;
  closeAll(): void;
};

const TasksCtx = createContext<Ctx | null>(null);

function keyFor(userId?: string | null) {
  return `pf.tasks.${userId ?? "anon"}`;
}

export function TasksProvider({
  children,
  userId,
  initialRoute,
}: {
  children: React.ReactNode;
  userId?: string | null;
  initialRoute: string;
}) {
  const storageKey = keyFor(userId);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeRoute, setActiveRoute] = useState<string | null>(initialRoute);

  // load on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const arr = JSON.parse(raw) as Task[];
        setTasks(Array.isArray(arr) ? arr : []);
      }
    } catch {}
  }, [storageKey]);

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(tasks.slice(0, 18)));
    } catch {}
  }, [tasks, storageKey]);

  const openOrFocus = useCallback((route: string, title: string, icon?: React.ReactNode) => {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.route === route);
      const now = Date.now();
      const next = idx >= 0
        ? prev.map((t, i) => (i === idx ? { ...t, title, icon, lastActive: now } : t))
        : [{ route, title, icon, lastActive: now }, ...prev].slice(0, 18);
      return next;
    });
    setActiveRoute(route);
  }, []);

  const close = useCallback((route: string) => {
    setTasks((prev) => prev.filter((t) => t.route !== route));
    setActiveRoute((r) => (r === route ? null : r));
  }, []);

  const closeAll = useCallback(() => {
    setTasks([]);
    setActiveRoute(null);
  }, []);

  const value = useMemo<Ctx>(() => ({ tasks, activeRoute, openOrFocus, close, closeAll }), [tasks, activeRoute, openOrFocus, close, closeAll]);

  return <TasksCtx.Provider value={value}>{children}</TasksCtx.Provider>;
}

export function useTasks(): Ctx {
  const ctx = useContext(TasksCtx);
  if (!ctx) throw new Error("useTasks must be used inside <TasksProvider>");
  return ctx;
}

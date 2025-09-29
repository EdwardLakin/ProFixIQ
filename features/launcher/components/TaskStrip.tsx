"use client";

import Link from "next/link";
import { useTasks } from "../tasks/TasksProvider";

export default function TaskStrip() {
  const { tasks, activeRoute, close } = useTasks();

  if (tasks.length === 0) return null;

  return (
    <div className="mt-3 flex items-center gap-2 overflow-x-auto">
      {tasks
        .sort((a, b) => b.lastActive - a.lastActive)
        .map((t) => (
          <div
            key={t.route}
            className={`group inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs transition
              ${activeRoute === t.route ? "border-orange-400/50 bg-orange-400/10" : "border-white/10 bg-white/5 hover:border-white/20"}`}
          >
            <Link href={t.route} className="inline-flex items-center gap-2">
              <span className="text-sm leading-none">{t.icon ?? "📌"}</span>
              <span className="max-w-[14ch] truncate">{t.title}</span>
            </Link>
            <button
              className="rounded-full px-1 text-white/60 hover:bg-white/10 hover:text-white"
              onClick={() => close(t.route)}
              aria-label={`Close ${t.title}`}
              title="Close"
            >
              ✕
            </button>
          </div>
        ))}
    </div>
  );
}

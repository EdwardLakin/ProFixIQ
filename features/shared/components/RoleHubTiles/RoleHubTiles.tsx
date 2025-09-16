"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Role, Scope } from "./tiles";
import { TILES } from "./tiles";
import { useTabsScopedStorageKey } from "@/features/shared/components/tabs/TabsBridge";

const SCOPE_LABEL: Record<Scope | "other", string> = {
  work_orders: "Work Orders",
  inspections: "Inspections",
  parts: "Parts",
  tech: "Tech",
  management: "Management",
  settings: "Settings & Reports",
  all: "Other",
  other: "Other",
};

function useSectionOpenState(scopes: (Scope | "other")[]) {
  // remember open/collapsed per user & route
  const key = useTabsScopedStorageKey("dashboard:section-open");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setOpen(JSON.parse(raw));
    } catch {}
  }, [key]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(open));
    } catch {}
  }, [key, open]);

  // ensure every section key exists
  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      scopes.forEach((s) => {
        if (typeof next[s] === "undefined") next[s] = true; // default open
      });
      return next;
    });
  }, [scopes]);

  return { open, setOpen };
}

export default function RoleHubTiles({
  roles,
  scope = "all",
  heading = "Navigation",
  description,
}: {
  roles: Role[];
  scope?: Scope | "all";
  heading?: string;
  description?: string;
}) {
  // filter tiles by role + scope
  const visible = useMemo(() => {
    const roleSet = new Set(roles);
    return TILES.filter(
      (t) =>
        t.roles.some((r) => roleSet.has(r)) &&
        (scope === "all" || t.scopes.includes(scope) || t.scopes.includes("all")),
    );
  }, [roles, scope]);

  // group by primary scope bucket
  const grouped = useMemo(() => {
    const buckets: Record<string, typeof visible> = {};
    for (const t of visible) {
      // choose the first non-"all" scope for the header bucket
      const primary = (t.scopes.find((s) => s !== "all") ?? "other") as Scope | "other";
      if (!buckets[primary]) buckets[primary] = [];
      buckets[primary].push(t);
    }
    // Sort tiles alphabetically inside each bucket
    Object.values(buckets).forEach((arr) => arr.sort((a, b) => a.title.localeCompare(b.title)));
    return buckets;
  }, [visible]);

  const sections = useMemo<(Scope | "other")[]>(
    () =>
      (["work_orders","inspections","parts","tech","management","settings","other"] as const)
        .filter((s) => grouped[s]?.length),
    [grouped],
  );

  const { open, setOpen } = useSectionOpenState(sections);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-1 text-3xl font-bold text-orange-400">{heading}</h1>
      {description ? (
        <p className="mb-6 text-sm text-neutral-400">{description}</p>
      ) : null}

      <div className="space-y-4">
        {sections.map((s) => {
          const tiles = grouped[s]!;
          const isOpen = !!open[s];
          return (
            <section key={s} className="rounded-lg border border-neutral-800 bg-neutral-950">
              {/* Header row / toggle */}
              <button
                type="button"
                onClick={() => setOpen((prev) => ({ ...prev, [s]: !prev[s] }))}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="text-lg font-semibold text-white">{SCOPE_LABEL[s]}</div>
                <span className="text-sm text-neutral-400">{isOpen ? "Hide" : "Show"}</span>
              </button>

              {/* Tiles */}
              {isOpen && (
                <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
                  {tiles.map((t) => (
                    <Link
                      prefetch={false}
                      key={t.href}
                      href={t.href}
                      className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 hover:border-orange-500"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-white">{t.title}</div>
                        {t.cta ? (
                          <span className="rounded bg-orange-600 px-2 py-0.5 text-xs font-semibold text-white">
                            {t.cta}
                          </span>
                        ) : null}
                      </div>
                      {t.subtitle ? (
                        <div className="mt-1 text-xs text-neutral-400">{t.subtitle}</div>
                      ) : null}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

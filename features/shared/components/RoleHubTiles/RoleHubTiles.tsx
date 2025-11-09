// features/shared/components/RoleHubTiles/RoleHubTiles.tsx
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

  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      scopes.forEach((s) => {
        if (typeof next[s] === "undefined") next[s] = true;
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
  const visible = useMemo(() => {
    const roleSet = new Set(roles);
    return TILES.filter(
      (t) =>
        t.roles.some((r) => roleSet.has(r)) &&
        (scope === "all" || t.scopes.includes(scope) || t.scopes.includes("all"))
    );
  }, [roles, scope]);

  const grouped = useMemo(() => {
    const buckets: Record<string, typeof visible> = {};
    for (const t of visible) {
      const primary = (t.scopes.find((s) => s !== "all") ?? "other") as Scope | "other";
      if (!buckets[primary]) buckets[primary] = [];
      buckets[primary].push(t);
    }
    Object.values(buckets).forEach((arr) => arr.sort((a, b) => a.title.localeCompare(b.title)));
    return buckets;
  }, [visible]);

  const sections = useMemo<(Scope | "other")[]>(
    () =>
      (["work_orders", "inspections", "parts", "tech", "management", "settings", "other"] as const).filter(
        (s) => grouped[s]?.length
      ),
    [grouped]
  );

  const { open, setOpen } = useSectionOpenState(sections);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{heading}</h1>
        {description ? <p className="text-sm text-muted-foreground mt-1">{description}</p> : null}
      </div>

      {sections.map((s) => {
        const tiles = grouped[s]!;
        const isOpen = !!open[s];
        return (
          <section key={s} className="rounded-lg border border-white/5 bg-background/40">
            <button
              type="button"
              onClick={() => setOpen((prev) => ({ ...prev, [s]: !prev[s] }))}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div className="text-sm font-medium text-foreground">{SCOPE_LABEL[s]}</div>
              <span className="text-xs text-muted-foreground">{isOpen ? "Hide" : "Show"}</span>
            </button>

            {isOpen && (
              <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
                {tiles.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    className="rounded-md border border-white/5 bg-background/40 p-4 hover:border-white/15 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-foreground">{t.title}</div>
                      {t.cta ? (
                        <span className="text-[0.65rem] text-muted-foreground">
                          {t.cta}
                        </span>
                      ) : null}
                    </div>
                    {t.subtitle ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t.subtitle}</p>
                    ) : null}
                  </Link>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
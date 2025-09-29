// features/launcher/components/FeatureIconMenu.tsx
"use client";

import { useMemo } from "react";
import IconMenu, { type IconItem } from "./IconMenu";

// your Tile shape:
export type Role = "owner" | "admin" | "manager" | "advisor" | "mechanic" | "parts";
export type Scope = "work_orders" | "inspections" | "parts" | "tech" | "management" | "settings" | "all";
export type Tile = {
  href: string;
  title: string;
  subtitle?: string;
  cta?: string;
  roles: Role[];
  scopes: Scope[];
};

export default function FeatureIconMenu({
  tiles,
  myRole,
  scope,
  iconFor, // optional: provide a function to pick an icon per tile
  colsClass = "grid-cols-2 md:grid-cols-4",
}: {
  tiles: Tile[];
  myRole: Role;
  scope: Scope | "all";
  iconFor?: (t: Tile) => React.ReactNode;
  colsClass?: string;
}) {
  const items: IconItem[] = useMemo(() => {
    return tiles
      .filter((t) => t.roles.includes(myRole))
      .filter((t) => t.scopes.includes(scope) || t.scopes.includes("all"))
      .map((t) => ({
        href: t.href,
        title: t.title,
        subtitle: t.subtitle,
        icon: iconFor ? iconFor(t) : "📦",
        badge: 0, // you can compute per-tile badges if needed
      }));
  }, [tiles, myRole, scope, iconFor]);

  return <IconMenu items={items} colsClass={colsClass} />;
}
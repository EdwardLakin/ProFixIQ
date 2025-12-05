// features/mobile/components/MobileRoleHub.tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  MOBILE_TILES,
  type MobileRole,
  type MobileScope,
} from "@/features/mobile/config/mobile-tiles";

type Props = {
  role: MobileRole;
  scopes?: MobileScope[];
  title?: string;
  subtitle?: string;
};

export function MobileRoleHub({
  role,
  scopes = ["home"],
  title = "Shortcuts",
  subtitle,
}: Props) {
  const tiles = useMemo(
    () =>
      MOBILE_TILES.filter(
        (tile) =>
          tile.roles.includes(role) &&
          tile.scopes.some((s) => scopes.includes(s)),
      ),
    [role, scopes],
  );

  if (tiles.length === 0) return null;

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-[0.7rem] text-neutral-500">{subtitle}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left shadow-card backdrop-blur-md"
          >
            <div className="text-[0.7rem] uppercase tracking-[0.16em] text-neutral-400">
              {tile.title}
            </div>
            {tile.subtitle && (
              <div className="mt-1 text-xs text-neutral-300 line-clamp-2">
                {tile.subtitle}
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
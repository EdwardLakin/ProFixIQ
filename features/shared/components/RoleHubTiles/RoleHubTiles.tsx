"use client";

import Link from "next/link";
import { TILES, type Role, type Scope } from "./tiles";

function Tile({ href, title, subtitle, cta }: { href: string; title: string; subtitle?: string; cta?: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-orange-400/40 bg-neutral-900 p-4 transition
                 hover:-translate-y-0.5 hover:border-orange-400 hover:shadow-lg hover:shadow-orange-500/20"
      aria-label={title}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {cta ? (
          <span className="rounded border border-orange-400 bg-orange-500 px-3 py-1 text-sm font-semibold text-black">
            {cta}
          </span>
        ) : null}
      </div>
      {subtitle ? <p className="mt-1 text-sm text-white/70">{subtitle}</p> : null}
    </Link>
  );
}

export default function RoleHubTiles({
  roles,
  scope = "all",
  heading = "Actions",
  description,
}: {
  roles: Role[];
  scope?: Scope | "all";
  heading?: string;
  description?: string;
}) {
  const roleSet = new Set<Role>(roles);

  const visible = TILES.filter((t) => {
    const roleAllowed = t.roles.some((r) => roleSet.has(r));
    const scopeAllowed = scope === "all" || t.scopes.includes(scope as Scope) || t.scopes.includes("all");
    return roleAllowed && scopeAllowed;
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 text-white">
      <h1 className="mb-2 text-3xl font-bold text-orange-400">{heading}</h1>
      {description ? <p className="mb-6 text-sm text-white/70">{description}</p> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((t) => (
          <Tile key={`${t.href}-${t.title}`} {...t} />
        ))}
        {visible.length === 0 && (
          <div className="rounded border border-orange-400/40 bg-neutral-900 p-4 text-white/70">
            No actions available for your role.
          </div>
        )}
      </div>
    </div>
  );
}

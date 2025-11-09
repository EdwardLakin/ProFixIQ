// app/work-orders/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { Role } from "@shared/components/RoleHubTiles/tiles";
import { TILES } from "@shared/components/RoleHubTiles/tiles";
import Link from "next/link";
import PageShell from "@/features/shared/components/PageShell";

type DB = Database;

async function getUserRole(): Promise<Role | null> {
  const supabase = createServerComponentClient<DB>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return (profile?.role as Role | null) ?? null;
}

export default async function WorkOrdersHome() {
  const role = await getUserRole();

  // only show tiles that are work_orders scope and role-allowed
  const workOrderTiles = TILES.filter((tile) => {
    const forWorkOrders = tile.scopes.includes("work_orders") || tile.scopes.includes("all");
    const roleAllowed = role ? tile.roles.includes(role) : false;
    return forWorkOrders && roleAllowed;
  });

  return (
    <PageShell
      title="Work Orders"
      description="Create, view, and manage jobs, quotes, and invoices."
    >
      {workOrderTiles.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-300">
          No work-order actions available for your role.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workOrderTiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="group rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-4 transition hover:border-orange-400 hover:bg-neutral-900"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-neutral-100">{tile.title}</h2>
                <span className="text-xs text-neutral-500 group-hover:text-orange-300">
                  {tile.cta ?? "→"}
                </span>
              </div>
              {tile.subtitle ? (
                <p className="mt-1 text-sm text-neutral-400">{tile.subtitle}</p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
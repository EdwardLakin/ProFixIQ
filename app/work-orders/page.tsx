// app/work-orders/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import type { Role } from "@shared/components/RoleHubTiles/tiles";
import { TILES } from "@shared/components/RoleHubTiles/tiles";
import Link from "next/link";
import PageShell from "@/features/shared/components/PageShell";
import Card from "@/features/shared/components/ui/Card";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";


async function getUserRole(): Promise<Role | null> {
  const supabase = createServerSupabaseRSC();
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
      eyebrow="Operations"
      title="Work Orders"
      description="Run the full work-order lifecycle with clear operational entry points for service advisors, techs, and managers."
    >
      {workOrderTiles.length === 0 ? (
        <Card className="p-4 text-sm" >No work-order actions available for your role.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workOrderTiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="group"
            >
              <Card className="h-full px-5 py-5 transition group-hover:border-[color:var(--brand-accent,#E39A6E)]/60 group-hover:shadow-[var(--theme-shadow-medium)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">{tile.title}</h2>
                    {tile.subtitle ? (
                      <p className="mt-1 text-sm text-[var(--theme-text-secondary,var(--theme-text-muted))]">
                        {tile.subtitle}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge variant="active" size="sm">
                    {tile.cta ?? "Open"}
                  </StatusBadge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}

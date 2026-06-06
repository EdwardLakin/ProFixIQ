import { redirect } from "next/navigation";

import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import { canonicalizeRole } from "@/features/shared/lib/rbac";

export default async function DashboardEntryPage() {
  const supabase = createServerSupabaseRSC();
  const actor = await resolveCurrentActor(supabase);
  const role = canonicalizeRole(actor.role);

  console.info("[DashboardEntry] server profile resolved", {
    actorPresent: Boolean(actor.user),
    profileId: actor.profile?.id ?? null,
    profileRole: actor.role ?? null,
    activeShopId: actor.shopId,
    route: "/dashboard",
  });

  if (!actor.user) redirect("/sign-in");
  if (role === "admin") redirect("/dashboard/admin");
  if (role === "lead_hand" || role === "foreman") redirect("/dashboard/operations");

  redirect("/dashboard/operations");
}

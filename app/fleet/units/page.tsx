// app/fleet/units/page.tsx
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import FleetUnitsPage from "@/features/fleet/components/FleetUnitsPage";

type DB = Database;

export default async function FleetUnitsRoutePage() {
  const supabase = createServerComponentClient<DB>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let shopId: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.shop_id) {
      shopId = profile.shop_id as string;
    }
  }

  return <FleetUnitsPage shopId={shopId} />;
}
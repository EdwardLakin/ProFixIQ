// app/fleet/units/page.tsx
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Container from "@shared/components/ui/Container";
import FleetUnitsPage from "@/features/fleet/components/FleetUnitsPage";

type DB = Database;
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

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
      .maybeSingle<ProfileRow>();

    if (profile?.shop_id) {
      shopId = profile.shop_id as string;
    }
  }

  return (
    <main className="relative min-h-[calc(100vh-3rem)] bg-black text-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
      />
      <Container className="py-6">
        <FleetUnitsPage shopId={shopId} />
      </Container>
    </main>
  );
}
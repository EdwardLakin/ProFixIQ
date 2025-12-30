// app/fleet/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import Container from "@shared/components/ui/Container";
import FleetControlTower from "@/features/fleet/components/FleetControlTower";

type DB = Database;

type ProfileWithShopName = {
  shop_id: string | null;
  shops: { name: string | null } | null;
};

export default function FleetPage() {
  const supabase = createClientComponentClient<DB>();
  const [shopName, setShopName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("shop_id, shops(name)")
          .eq("id", session.user.id)
          .maybeSingle<ProfileWithShopName>();

        const name = profile?.shops?.name ?? null;
        setShopName(name);
      } catch (e) {
        console.error("Failed to load shop name for fleet view", e);
      }
    })();
  }, [supabase]);

  return (
    <main className="relative min-h-[calc(100vh-3rem)] bg-black text-white">
      <Container className="py-6">
        <FleetControlTower shopName={shopName ?? "Fleet"} />
      </Container>
    </main>
  );
}
// features/launcher/components/WelcomeBanner.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export default function WelcomeBanner() {
  const supabase = createClientComponentClient<DB>();
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name")
        .eq("id", user.id)
        .single();

      if (profile?.first_name) {
        setFirstName(profile.first_name);
      }
    };

    void load();
  }, [supabase]);

  if (!firstName) return null;

  return (
    <div
      className="mb-4 text-2xl font-bold tracking-wide text-orange-400"
      style={{ fontFamily: "var(--font-blackops)" }}
    >
      Welcome, {firstName} 👋
    </div>
  );
}
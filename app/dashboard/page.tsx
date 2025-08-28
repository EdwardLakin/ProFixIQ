"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const toPath = (role?: string | null) =>
  role === "owner"    ? "/dashboard/owner"   :
  role === "admin"    ? "/dashboard/admin"   :
  role === "manager"  ? "/dashboard/manager" :
  role === "advisor"  ? "/dashboard/advisor" :
  role === "parts"    ? "/dashboard/parts"   :
  role === "mechanic" || role === "tech" ? "/dashboard/tech" :
  "/onboarding";

export default function DashboardEntry() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const sent = useRef(false);

  useEffect(() => {
    (async () => {
      if (sent.current) return;
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        sent.current = true;
        router.replace("/sign-in");
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      sent.current = true;
      router.replace(toPath(prof?.role ?? null));
    })();
  }, [router, supabase]);

  return (
    <div className="min-h-[60vh] grid place-items-center text-white">
      <div className="text-center">
        <p className="text-orange-400">Loading your dashboard…</p>
      </div>
    </div>
  );
}

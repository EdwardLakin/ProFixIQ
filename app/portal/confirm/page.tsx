"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function PortalConfirmPage() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      router.replace(session?.user ? "/portal/profile" : "/portal/auth/sign-in");
    })();
  }, [router, supabase]);

  return (
    <main className="min-h-screen grid place-items-center bg-black text-white">
      <p className="text-white/80">Completing sign-in…</p>
    </main>
  );
}

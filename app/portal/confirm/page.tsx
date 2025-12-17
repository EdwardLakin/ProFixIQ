// app/portal/auth/confirm/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function PortalConfirmPage() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      // ✅ land on portal home
      router.replace(session?.user ? "/portal" : "/portal/auth/sign-in");
    })();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  return (
    <div className="mx-auto flex max-w-md items-center justify-center rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-neutral-200 backdrop-blur-md shadow-card">
      Completing sign-in…
    </div>
  );
}
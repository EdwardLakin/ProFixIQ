// app/portal/auth/confirm/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

export default function PortalConfirmPage() {
  const router = useRouter();
  const supabase = createBrowserSupabase();

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
    <div className="mx-auto flex max-w-md items-center justify-center rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 text-sm text-[color:var(--theme-text-primary)] backdrop-blur-md shadow-card">
      Completing sign-in…
    </div>
  );
}
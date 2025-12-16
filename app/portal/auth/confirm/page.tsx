// app/portal/auth/confirm/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const COPPER = "#C57A4A";

export default function PortalConfirmPage() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      router.replace(user ? "/portal/profile" : "/portal/auth/sign-in");
    })();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 backdrop-blur-md">
        <div
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em]"
          style={{ color: COPPER }}
        >
          Portal
        </div>

        <h1 className="mt-4 text-xl font-blackops uppercase tracking-[0.16em]">
          Finishing sign up
        </h1>

        <p className="mt-2 text-sm text-neutral-400">
          One moment… we’re completing your sign-in.
        </p>

        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full border border-white/10 bg-white/5">
          <div className="h-full w-1/2 animate-pulse rounded-full" style={{ backgroundColor: COPPER }} />
        </div>
      </div>
    </div>
  );
}
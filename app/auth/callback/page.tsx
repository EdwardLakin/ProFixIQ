"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { resolvePostAuthDestination } from "@/features/auth/lib/postAuthRouting";

export default function AuthCallbackPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();
  const ran = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (ran.current) return;
      ran.current = true;

      try {
        const code = sp.get("code");
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch (err) {
        console.warn("auth callback exchangeCodeForSession failed", err);
      }

      await supabase.auth.getSession();
      router.refresh();

      const destination = await resolvePostAuthDestination({
        supabase,
        searchParams: sp,
      });

      router.replace(destination);

      setTimeout(() => {
        if (typeof window !== "undefined") {
          const want = new URL(destination, window.location.origin).href;
          if (window.location.href !== want) window.location.assign(destination);
        }
      }, 100);
    };

    void run();
  }, [router, sp, supabase]);

  return (
    <div className="min-h-[60vh] grid place-items-center text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Finishing sign-in…</h1>
        <p className="text-sm text-neutral-400">One moment while we set things up.</p>
      </div>
    </div>
  );
}

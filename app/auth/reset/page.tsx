"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function AuthResetPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    (async () => {
      // Make sure we have the updated session after the email link bounce
      await supabase.auth.getSession();

      const redirect = sp.get("redirect");
      const tail = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
      router.replace(`/auth/set-password${tail}`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="
        min-h-screen px-4 text-foreground
        bg-background
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]
      "
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center py-8">
        <div
          className="
            w-full rounded-3xl border
            border-[color:var(--metal-border-soft,#1f2937)]
            bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.2),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_82%)]
            shadow-[0_32px_80px_rgba(0,0,0,0.95)]
            px-6 py-7 sm:px-8 sm:py-9
            text-center
          "
        >
          <div
            className="
              inline-flex items-center gap-1 rounded-full border
              border-[color:var(--metal-border-soft,#1f2937)]
              bg-black/70
              px-3 py-1 text-[11px]
              uppercase tracking-[0.22em]
              text-neutral-300
            "
          >
            <span
              className="text-[10px] font-semibold text-[var(--accent-copper-light)]"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              ProFixIQ
            </span>
            <span className="h-1 w-1 rounded-full bg-[var(--accent-copper-light)]" />
            <span>Password reset</span>
          </div>

          <h1
            className="mt-3 text-2xl sm:text-3xl font-semibold text-white"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            Preparing…
          </h1>

          <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
            One moment while we verify your reset session.
          </p>

          <div className="mt-5 text-[11px] text-neutral-500">
            If this takes more than a few seconds, go back and open the reset
            link again.
          </div>
        </div>
      </div>
    </div>
  );
}
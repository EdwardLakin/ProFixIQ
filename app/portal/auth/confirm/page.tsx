// app/portal/auth/confirm/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const COPPER = "#C57A4A";

export default function PortalConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Supabase magic link (PKCE) returns ?code=...
        const code = searchParams.get("code");
        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) throw new Error(exErr.message);
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        if (!session?.user) {
          router.replace("/portal/auth/sign-in");
          return;
        }

        // ✅ Default to /portal (not appointments)
        const next = searchParams.get("next");
        router.replace(next && next.startsWith("/") ? next : "/portal");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unable to confirm sign-in.");
        router.replace("/portal/auth/sign-in");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, supabase]);

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 backdrop-blur-md shadow-card">
        <div
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em]"
          style={{ color: COPPER }}
        >
          Portal
        </div>

        <h1 className="mt-4 text-xl font-blackops uppercase tracking-[0.16em] text-neutral-200">
          Finishing sign in
        </h1>

        <p className="mt-2 text-sm text-neutral-400">
          {error ? "Sign-in failed — redirecting…" : "One moment… we’re completing your sign-in."}
        </p>

        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full border border-white/10 bg-white/5">
          <div className="h-full w-1/2 animate-pulse rounded-full" style={{ backgroundColor: COPPER }} />
        </div>
      </div>
    </div>
  );
}
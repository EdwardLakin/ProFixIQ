"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const rolePath = (role?: string | null) =>
  role === "owner"    ? "/dashboard/owner"    :
  role === "admin"    ? "/dashboard/admin"    :
  role === "advisor"  ? "/dashboard/advisor"  :
  role === "manager"  ? "/dashboard/manager"  :
  role === "parts"    ? "/dashboard/parts"    :
  role === "mechanic" || role === "tech" ? "/dashboard/tech" :
  "/dashboard";

export default function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    let cancelled = false;

    const goToRoleHome = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;
      if (!user || cancelled) return false;

      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (cancelled) return true;
      router.replace(rolePath(prof?.role ?? null));
      return true;
    };

    (async () => {
      // 1) Handle magic-link / OAuth code if present.
      const code = searchParams.get("code");
      if (code) {
        try {
          // Some helper versions expect a different signature; we gate it safely.
          // @ts-expect-error — allow older helper signature (string) without breaking newer ones
          await supabase.auth.exchangeCodeForSession(code);
        } catch {
          // ignore invalid/expired code
        }
      }

      // 2) If we already have a session, route by role.
      const routed = await goToRoleHome();
      if (routed) return;

      // 3) From Stripe checkout → send to signup to finish account creation.
      const sessionId = searchParams.get("session_id");
      if (sessionId) {
        router.replace(`/signup?session_id=${encodeURIComponent(sessionId)}`);
        return;
      }

      // 4) Fallback → sign in.
      router.replace("/sign-in");
    })();

    // Listen for a late-arriving session and route when it appears.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async () => {
      await goToRoleHome();
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [router, searchParams, supabase]);

  return (
    <div className="min-h-[60vh] grid place-items-center text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Confirming your account…</h1>
        <p className="text-sm text-neutral-400">You’ll be redirected automatically.</p>
      </div>
    </div>
  );
}
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
      // 1) Handle magic-link/OAuth code if present
      const code = searchParams.get("code");
      if (code) {
        try {
          // works with older helper signature; ignored if already exchanged
          // @ts-ignore – allow either signature
          await supabase.auth.exchangeCodeForSession(code);
        } catch {/* ignore */}
      }

      // 2) Already have a session? Route by role.
      const routed = await goToRoleHome();
      if (routed) return;

      // 3) Coming from Stripe Checkout? Send to signup with the session_id
      const sessionId = searchParams.get("session_id");
      if (sessionId) {
        router.replace(`/signup?session_id=${encodeURIComponent(sessionId)}`);
        return;
      }

      // 4) Fallback
      router.replace("/sign-in");
    })();

    // Listen for a late-arriving session
    const { data: listener } = supabase.auth.onAuthStateChange(async () => {
      await goToRoleHome();
    });
    const unsubscribe = () => listener.subscription.unsubscribe();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router, searchParams, supabase]);

  return (
    <div className="min-h-[60vh] grid place-items-center text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Confirming your account…</h1>
        <p className="text-sm text-neutral-400">
          You’ll be redirected automatically.
        </p>
      </div>
    </div>
  );
}
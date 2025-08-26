// app/confirm/ConfirmContent.tsx
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const rolePath = (role?: string | null) =>
  role === "owner"    ? "/dashboard/owner"   :
  role === "admin"    ? "/dashboard/admin"   :
  role === "advisor"  ? "/dashboard/advisor" :
  role === "manager"  ? "/dashboard/manager" :
  role === "parts"    ? "/dashboard/parts"   :
  role === "mechanic" || role === "tech" ? "/dashboard/tech" :
  "/dashboard";

export default function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const goToRoleHome = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (cancelled) return;
      router.replace(rolePath(profile?.role ?? null));
    };

    (async () => {
      // If Supabase sent us an auth code (email confirm / magic link), finalize the session.
      const code = searchParams.get("code");
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code);
        } catch {
          // Ignore invalid/expired code; we'll fall back to the checks below.
        }
      }

      // If we’re already logged in after checkout or callback → route by role
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) {
        await goToRoleHome();
      } else {
        // Not logged in yet. If this came from Stripe checkout, send to signup to finish account creation.
        const sessionId = searchParams.get("session_id");
        if (sessionId) {
          router.replace(`/signup?session_id=${encodeURIComponent(sessionId)}`);
        } else {
          // Fallback: go to sign-in (then on success we’ll route to onboarding/role)
          router.replace("/sign-in?redirect=/onboarding");
        }
      }

      // Also listen briefly in case the session arrives moments later.
      const { data: listener } = supabase.auth.onAuthStateChange(async () => {
        await goToRoleHome();
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [router, searchParams, supabase]);

  return (
    <div className="p-10 text-white text-center">
      <h1 className="text-2xl font-bold mb-2">Finishing up…</h1>
      <p>You’ll be redirected in a moment.</p>
    </div>
  );
}
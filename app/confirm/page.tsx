// app/confirm/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function ConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    let active = true;

    const rolePath = (role?: string) =>
      role === "owner"   ? "/dashboard/owner"   :
      role === "admin"   ? "/dashboard/admin"   :
      role === "advisor" ? "/dashboard/advisor" :
      role === "manager" ? "/dashboard/manager" :
      role === "parts"   ? "/dashboard/parts"   :
      role === "mechanic" || role === "tech" ? "/dashboard/tech" :
      "/dashboard";

    const goByRole = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      // If user is signed in, route by role
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        if (!active) return;
        router.replace(rolePath(profile?.role));
        return;
      }

      // Not signed in → if came from Stripe, forward to signup with session_id
      const sessionId = searchParams.get("session_id");
      if (sessionId) {
        router.replace(`/signup?session_id=${encodeURIComponent(sessionId)}`);
        return;
      }

      // Fallback: plain signup
      router.replace("/signup");
    };

    (async () => {
      // Handle legacy/email-link auth callback (if you ever arrive with ?code=...)
      const code = searchParams.get("code");
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code);
        } catch {
          /* ignore */
        }
      }
      await goByRole();
    })();

    return () => { active = false; };
  }, [router, searchParams, supabase]);

  return (
    <div className="p-10 text-white text-center">
      <h1 className="text-2xl font-bold mb-2">Finishing up…</h1>
      <p>You’ll be redirected in a moment.</p>
    </div>
  );
}
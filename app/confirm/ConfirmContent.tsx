"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const rolePath = (role?: string) =>
      role === "owner"     ? "/dashboard/owner"   :
      role === "admin"     ? "/dashboard/admin"   :
      role === "advisor"   ? "/dashboard/advisor" :
      role === "manager"   ? "/dashboard/manager" :
      role === "parts"     ? "/dashboard/parts"   :
      role === "mechanic" || role === "tech" ? "/dashboard/tech" :
      "/dashboard";

    const goToRoleHome = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (cancelled) return;
      router.replace(rolePath(profile?.role));
    };

    (async () => {
      // Magic-link / OAuth callback support
      const code = searchParams.get("code");
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code);
        } catch {
          // swallow invalid/expired codes; we'll rely on onAuthStateChange below
        }
      }

      await goToRoleHome();

      const { data: listener } = supabase.auth.onAuthStateChange(async () => {
        await goToRoleHome();
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  // We intentionally do NOT include searchParams to avoid loopy re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, supabase]);

  return (
    <div className="p-10 text-white text-center">
      <h1 className="text-2xl font-bold mb-4">Confirming your account…</h1>
      <p>You’ll be redirected based on your role.</p>
    </div>
  );
}
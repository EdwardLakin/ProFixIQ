"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import {
  appendActivationContextToHref,
  parseActivationContextFromSearchParams,
  persistActivationContext,
} from "@/features/integrations/shopBoost/activationContext";
import { trackShopBoostEvent } from "@/features/analytics/shopBoostEvents";

export default function ConfirmContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();
  const ran = useRef(false);
  const activationContext = parseActivationContextFromSearchParams(sp);

  useEffect(() => {
    const run = async () => {
      if (ran.current) return;
      ran.current = true;

      try {
        // ✅ Exchange the code in the URL for a session (safe for all typings)
        const url = typeof window !== "undefined" ? window.location.href : "";
        await supabase.auth.exchangeCodeForSession(url);

        // ✅ Ensure cookies are written and middleware can see the session
        await supabase.auth.getSession();
        router.refresh();
      } catch (err) {
        console.warn("exchangeCodeForSession failed (continuing):", err);
      }

      // ✅ Decide where to go next
      const redirect = sp.get("redirect") || undefined;
      let completed = false;

      try {
        const { data: u } = await supabase.auth.getUser();
        if (u?.user?.id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("completed_onboarding")
            .eq("id", u.user.id)
            .maybeSingle();
          completed = !!profile?.completed_onboarding;
        }
      } catch {
        /* ignore */
      }

      // ✅ Route depending on onboarding status

      const params = new URLSearchParams();
      const passthroughKeys = ["priceId", "interval", "trial", "founding", "session_id", "demoId", "intakeId", "activationContext"];
      for (const key of passthroughKeys) {
        const value = sp.get(key);
        if (value) params.set(key, value);
      }
      const onboardingDest = `/onboarding${params.toString() ? `?${params.toString()}` : ""}`;
      const destBase = completed ? (redirect ?? "/dashboard/operations") : onboardingDest;
      const dest = activationContext ? appendActivationContextToHref(destBase, activationContext) : destBase;
      if (activationContext) {
        persistActivationContext(activationContext);
        trackShopBoostEvent("activation_started", {
          demoId: activationContext.demoId,
          intakeId: activationContext.intakeId,
          readiness: activationContext.readiness,
          confidence: activationContext.confidence,
          source: "confirm_page",
        });
      }
      router.replace(dest);

      // ✅ Hard fallback for Safari / mobile cache
      setTimeout(() => {
        if (typeof window !== "undefined") {
          const want = new URL(dest, window.location.origin).href;
          if (window.location.href !== want) window.location.assign(dest);
        }
      }, 100);
    };

    void run();
  }, [activationContext, router, sp, supabase]);

  return (
    <div className="min-h-[60vh] grid place-items-center text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Finishing sign-in…</h1>
        <p className="text-sm text-neutral-400">One moment while we set things up.</p>
      </div>
    </div>
  );
}

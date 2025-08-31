"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function ConfirmContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();
  const jumped = useRef(false);

  useEffect(() => {
    const go = async () => {
      if (jumped.current) return;
      jumped.current = true;

      const code = sp.get("code");
      const sessionId = sp.get("session_id");

      // 1) Exchange magic-link code if present
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code);
        } catch {
          // ignore; we'll still try to continue
        }
      }

      // 2) Always forward to onboarding (carry session_id if present)
      const dest = sessionId
        ? `/onboarding?session_id=${encodeURIComponent(sessionId)}`
        : "/onboarding";

      router.replace(dest);
      // strip query completely to avoid loops
      setTimeout(() => router.refresh(), 0);
    };

    void go();
  }, [router, sp, supabase]);

  return (
    <div className="min-h-[60vh] grid place-items-center text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Confirming your account…</h1>
        <p className="text-sm text-neutral-400">You’ll be redirected automatically.</p>
      </div>
    </div>
  );
}
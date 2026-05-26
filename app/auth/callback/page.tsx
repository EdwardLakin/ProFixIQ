"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { EmailOtpType } from "@supabase/supabase-js";
import { resolvePostAuthDestination } from "@/features/auth/lib/postAuthRouting";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

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
        const code = sp.get("code")?.trim() ?? "";
        const tokenHash = sp.get("token_hash")?.trim() ?? "";
        const typeRaw = sp.get("type")?.trim() ?? "";

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (tokenHash && OTP_TYPES.has(typeRaw as EmailOtpType)) {
          await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: typeRaw as EmailOtpType,
          });
        }
      } catch (err) {
        console.warn("auth callback session exchange failed", err);
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        const passthrough = new URLSearchParams();
        const redirect = sp.get("redirect")?.trim();
        const mode = sp.get("mode")?.trim();
        const sessionId = sp.get("session_id")?.trim();
        const flow = sp.get("flow")?.trim();
        if (redirect) passthrough.set("redirect", redirect);
        if (mode) passthrough.set("mode", mode);
        if (sessionId) passthrough.set("session_id", sessionId);
        if (flow) passthrough.set("flow", flow);
        const signInHref = `/sign-in${passthrough.toString() ? `?${passthrough.toString()}` : ""}`;

        router.replace(signInHref);
        setTimeout(() => {
          if (typeof window !== "undefined") {
            const want = new URL(signInHref, window.location.origin).href;
            if (window.location.href !== want) {
              window.location.assign(signInHref);
            }
          }
        }, 100);
        return;
      }

      router.refresh();

      const isMobileMode =
        (sp.get("mode") || "").toLowerCase() === "mobile" ||
        (sp.get("redirect") || "") === "/mobile";

      const destination = await resolvePostAuthDestination({
        supabase,
        searchParams: sp,
        isMobileMode,
      });

      router.replace(destination);

      setTimeout(() => {
        if (typeof window !== "undefined") {
          const want = new URL(destination, window.location.origin).href;
          if (window.location.href !== want) {
            window.location.assign(destination);
          }
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

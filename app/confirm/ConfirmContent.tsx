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

// ship logs to server so they appear in Vercel logs
async function log(message: string, extra?: Record<string, unknown>) {
  try {
    // always log to console, too
    // eslint-disable-next-line no-console
    console.log("[confirm]", message, extra ?? "");
    await fetch("/api/diag/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ message, extra }),
    });
  } catch {
    /* ignore */
  }
}

export default function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    let cancelled = false;

    const waitForSession = async (tries = 25, delayMs = 250) => {
      for (let i = 0; i < tries; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) return data.session;
        await new Promise(r => setTimeout(r, delayMs));
      }
      return null;
    };

    const routeByRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      await log("session check", { hasSession: !!user });
      if (!user) return false;

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profErr) await log("profiles fetch error", { error: profErr.message });

      const path = rolePath(prof?.role ?? null);
      await log("routing to role home", { role: prof?.role ?? null, path });
      if (!cancelled) router.replace(path);
      return true;
    };

    (async () => {
      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const errorDesc = searchParams.get("error_description");
      const sessionId = searchParams.get("session_id");

      if (error) {
        await log("supabase returned error on callback", { error, errorDesc });
      }

      // 1) Exchange magic-link/OAuth code if present
      if (code) {
        try {
          await log("found auth code, exchanging");
          await supabase.auth.exchangeCodeForSession(code);
          await log("auth code exchanged OK");
        } catch (e) {
          await log("exchangeCodeForSession failed", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // 2) Try to see a session (poll to handle eventual consistency)
      const session = await waitForSession();
      if (!session) {
        // No session materialized.
        if (sessionId) {
          const dest = `/signup?session_id=${encodeURIComponent(sessionId)}`;
          await log("no session after wait; redirecting to signup", { dest });
          router.replace(dest);
          return;
        }
        await log("no session after wait; redirecting to sign-in");
        router.replace("/sign-in");
        return;
      }

      // 3) We have a session → route by role
      const routed = await routeByRole();
      if (routed) return;

      // 4) Safety fallback to onboarding
      await log("had session but could not route by role; sending to onboarding");
      router.replace("/onboarding");
    })();

    // also react to late auth events
    const { data: sub } = supabase.auth.onAuthStateChange(async (evt) => {
      await log("auth state change", { event: evt });
      await routeByRole();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
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
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

async function log(message: string, extra?: Record<string, unknown>) {
  try {
    console.log("[confirm]", message, extra ?? "");
    await fetch("/api/diag/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ message, extra }),
    });
  } catch {}
}

export default function ConfirmContent() {
  const router = useRouter();
  const search = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      // never hang here—if we still haven't routed after 4s, go to onboarding
      router.replace("/onboarding");
    }, 4000);

    const run = async () => {
      // 1) Exchange auth code from magic link/OAuth if present
      const code = search.get("code");
      if (code) {
        try {
          await log("found auth code, exchanging");
          await supabase.auth.exchangeCodeForSession(code);
          await log("auth code exchanged OK");
        } catch (e) {
          await log("exchangeCodeForSession failed", { error: String(e) });
        }
      }

      // 2) Current session?
      const { data: { session }, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) await log("getSession error", { error: sessErr.message });

      // 2a) No session yet, but coming from Stripe? → go sign up and prefill
      if (!session?.user) {
        const sid = search.get("session_id");
        if (sid && !cancelled) {
          const dest = `/signup?session_id=${encodeURIComponent(sid)}`;
          await log("no session; redirecting to signup with session_id", { dest });
          router.replace(dest);
          return;
        }
        // Otherwise send to sign in
        await log("no session; redirecting to sign-in");
        router.replace("/sign-in");
        return;
      }

      // 3) We have a session. Look for a profile row.
      const uid = session.user.id;
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle(); // important: don’t throw on 0 rows

      if (profErr) await log("profiles fetch error", { error: profErr.message });

      // 3a) If there is no profile row yet → onboarding
      if (!prof) {
        await log("no profile row; redirecting to onboarding");
        if (!cancelled) router.replace("/onboarding");
        return;
      }

      // 4) Route by role
      const path = rolePath(prof.role ?? null);
      await log("routing to role home", { role: prof.role ?? null, path });
      if (!cancelled) router.replace(path);
    };

    run();

    // also react to late session establishment
    const { data: sub } = supabase.auth.onAuthStateChange(async (ev) => {
      await log("auth state change", { event: ev });
      if (ev === "SIGNED_IN") {
        // try again—this will go to onboarding if profile is still missing
        router.replace("/confirm"); // re-run logic (cheap client page)
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, [router, search, supabase]);

  return (
    <div className="min-h-[60vh] grid place-items-center text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Confirming your account…</h1>
        <p className="text-sm text-neutral-400">You’ll be redirected automatically.</p>
      </div>
    </div>
  );
}
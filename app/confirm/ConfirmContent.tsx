"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// role → path (fallback to onboarding)
const rolePath = (role?: string | null) =>
  role === "owner"    ? "/dashboard/owner"   :
  role === "admin"    ? "/dashboard/admin"   :
  role === "advisor"  ? "/dashboard/advisor" :
  role === "manager"  ? "/dashboard/manager" :
  role === "parts"    ? "/dashboard/parts"   :
  role === "mechanic" || role === "tech" ? "/dashboard/tech" :
  "/onboarding";

// tiny log helper → Vercel route
async function log(message: string, extra?: Record<string, unknown>) {
  try {
    // keep console for local debugging but not required for build
    // eslint-disable-next-line no-console
    console.log("[diag]", message, extra ?? "");
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

  const navigated = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const hardGoto = (url: string) => {
      if (cancelled || navigated.current) return;
      navigated.current = true;
      try { window.location.assign(url); } catch { router.replace(url); }
    };

    const softReplace = (url: string) => {
      if (cancelled || navigated.current) return;
      navigated.current = true;
      // defer a tick to avoid hydration race, then refresh
      setTimeout(() => {
        try { router.replace(url); router.refresh(); }
        catch { hardGoto(url); }
      }, 0);
    };

    // ensure profiles row exists; return { role }
    const ensureProfile = async (userId: string) => {
      let { data: prof, error: readerErr } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .maybeSingle();

      if (readerErr) {
        await log("profiles read error", { error: readerErr.message });
      }

      if (!prof) {
        const { data } = await supabase.auth.getUser();
        const email = data?.user?.email ?? null;

        const { error: insErr } = await supabase.from("profiles").insert({
          id: userId,
          email,
          role: null,
        } as Database["public"]["Tables"]["profiles"]["Insert"]);

        if (insErr) {
          await log("profiles insert error", { error: insErr.message });
        } else {
          const reread = await supabase
            .from("profiles")
            .select("id, role")
            .eq("id", userId)
            .maybeSingle();
          prof = reread.data ?? null;
        }
      }

      return { role: prof?.role ?? null };
    };

    const routeBySession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) await log("supabase.getSession error", { error: error.message });

      const user = session?.user;
      await log("session check", { hasSession: Boolean(user) });
      if (!user) return false;

      const { role } = await ensureProfile(user.id);
      const dest = rolePath(role);
      await log("routing by role/onboarding", { role, dest });
      softReplace(dest);
      return true;
    };

    (async () => {
      const code = searchParams.get("code");
      const sessionId = searchParams.get("session_id");

      // 1) Exchange magic-link/OAuth code → session
      if (code) {
        try {
          await log("found auth code, exchanging");
          await supabase.auth.exchangeCodeForSession(code);
          await log("auth code exchanged OK");
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          await log("exchangeCodeForSession failed", { error: errMsg });
        }
      }

      // 2) If we already have a session → ensure profile & route
      const routed = await routeBySession();
      if (routed) return;

      // 3) If we came from Stripe → go to /signup to request email/password
      if (sessionId) {
        const dest = `/signup?session_id=${encodeURIComponent(sessionId)}`;
        await log("no session; redirecting to signup", { dest });
        softReplace(dest);
        return;
      }

      // 4) Fallback: sign in
      await log("no session; redirecting to sign-in");
      softReplace("/sign-in");
    })();

    // 5) Safety re-check: if still here after 4s, hard redirect
    const safety = setTimeout(async () => {
      if (navigated.current || cancelled) return;
      await log("safety timeout: still on /confirm; re-checking session");
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle();
        hardGoto(rolePath(data?.role ?? null));
      } else {
        const sid = searchParams.get("session_id");
        hardGoto(sid ? `/signup?session_id=${encodeURIComponent(sid)}` : "/sign-in");
      }
    }, 4000);

    const { data: listener } = supabase.auth.onAuthStateChange(async (ev) => {
      await log("auth state change", { event: ev });
      if (!navigated.current) await routeBySession();
    });

    return () => {
      cancelled = true;
      clearTimeout(safety);
      listener.subscription.unsubscribe();
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
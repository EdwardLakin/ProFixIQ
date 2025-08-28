// app/confirm/ConfirmContent.tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// Role -> dashboard path (fallback handled outside)
const roleToPath = (role?: string | null) =>
  role === "owner"    ? "/dashboard/owner"   :
  role === "admin"    ? "/dashboard/admin"   :
  role === "manager"  ? "/dashboard/manager" :
  role === "advisor"  ? "/dashboard/advisor" :
  role === "parts"    ? "/dashboard/parts"   :
  role === "mechanic" || role === "tech" ? "/dashboard/tech" : null;

// tiny logger to Vercel
async function log(message: string, extra?: Record<string, unknown>) {
  try {
    // visible locally and posted to /api/diag/log if you have it
    console.log("[diag]", message, extra ?? "");
    await fetch("/api/diag/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ message, extra }),
    });
  } catch { /* ignore */ }
}

export default function ConfirmContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();
  const navigated = useRef(false);

  // one guarded navigation helper
  const go = (href: string) => {
    if (navigated.current) return;
    navigated.current = true;
    // use replace + refresh; if it fails, hard navigate
    try {
      router.replace(href);
      router.refresh();
    } catch {
      window.location.assign(href);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const ensureProfileAndRoute = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) await log("getSession error", { error: error.message });

      const user = session?.user;
      await log("session", { hasSession: !!user });

      if (!user || cancelled) return false;

      // 1) read profile (role only)
      let { data: prof, error: rErr } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .maybeSingle();

      if (rErr) await log("profiles read error", { error: rErr.message });

      // 2) create stub if missing
      if (!prof) {
        const { error: iErr } = await supabase.from("profiles").insert({
          id: user.id,
          email: user.email ?? null,
          full_name: null,
          plan: "free",
          created_at: new Date().toISOString(),
          shop_id: null,
          business_name: null,
          phone: null,
          street: null,
          city: null,
          province: null,
          postal_code: null,
          role: null,
          shop_name: null,
        } as Database["public"]["Tables"]["profiles"]["Insert"]);
        if (iErr) await log("profiles insert error", { error: iErr.message });

        // after stub creation, onboarding is guaranteed
        await log("profile created -> onboarding");
        if (!cancelled) go("/onboarding");
        return true;
      }

      // 3) route by role (or onboarding)
      const role = prof.role ?? null;
      const dest = roleToPath(role) ?? "/onboarding";
      await log("route by role", { role, dest });
      if (!cancelled) go(dest);
      return true;
    };

    (async () => {
      const code = sp.get("code");
      const sessionId = sp.get("session_id");

      // A) If magic-link code present, exchange it first
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

      // B) If we have a session -> ensure profile then route (role? dashboard : onboarding)
      const routed = await ensureProfileAndRoute();
      if (routed) return;

      // C) No session yet:
      //     - if we came from Stripe, push to /signup with session_id (prefill + send magic link)
      //     - else take them to normal sign-in
      if (sessionId) {
        const dest = `/signup?session_id=${encodeURIComponent(sessionId)}`;
        await log("no session -> signup", { dest });
        go(dest);
        return;
      }

      await log("no session -> sign-in");
      go("/sign-in");
    })();

    // Optional safety after 4s: re-check once and hard-route accordingly
    const safety = setTimeout(async () => {
      if (navigated.current || cancelled) return;
      await log("safety timeout – recheck");
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle();
        go(roleToPath(data?.role ?? null) ?? "/onboarding");
      } else {
        const sid = sp.get("session_id");
        go(sid ? `/signup?session_id=${encodeURIComponent(sid)}` : "/sign-in");
      }
    }, 4000);

    // Late-arriving session? route once.
    const { data: listener } = supabase.auth.onAuthStateChange(async (ev) => {
      await log("auth state change", { event: ev });
      if (!navigated.current) await ensureProfileAndRoute();
    });

    return () => {
      cancelled = true;
      clearTimeout(safety);
      listener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[60vh] grid place-items-center text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Confirming your account…</h1>
        <p className="text-sm text-neutral-400">You’ll be redirected automatically.</p>
      </div>
    </div>
  );
}
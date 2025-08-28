"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// Role → path (fallback to onboarding if no role yet)
const rolePath = (role?: string | null) =>
  role === "owner"    ? "/dashboard/owner"   :
  role === "admin"    ? "/dashboard/admin"   :
  role === "advisor"  ? "/dashboard/advisor" :
  role === "manager"  ? "/dashboard/manager" :
  role === "parts"    ? "/dashboard/parts"   :
  role === "mechanic" || role === "tech" ? "/dashboard/tech" :
  "/onboarding";

// tiny log helper
async function log(message: string, extra?: Record<string, unknown>) {
  try {
    console.log("[diag]", message, extra ?? "");
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
      setTimeout(() => {
        try { router.replace(url); router.refresh(); }
        catch { hardGoto(url); }
      }, 0);
    };

    /** Ensure a profiles row exists; return current role (null if none). */
    const ensureProfile = async (userId: string) => {
      // 1) try read
      let { data: prof, error: readErr } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .maybeSingle();

      if (readErr) await log("profiles read error", { error: readErr.message });

      // 2) if missing, insert **minimal** row (only columns that surely exist!)
      if (!prof) {
        const { data: u } = await supabase.auth.getUser();
        // Only id + (optionally) email/plan if they exist in your schema
        const row: Partial<Database["public"]["Tables"]["profiles"]["Insert"]> = {
          id: userId,
          // email: u?.user?.email ?? null,   // uncomment ONLY if `email` column exists
          // plan: "free" as any,              // uncomment ONLY if `plan` column exists
        };

        const { error: insErr } = await supabase.from("profiles").insert(row as any);
        if (insErr) {
          await log("profiles insert error", { error: insErr.message });
        } else {
          // re-read to get role (likely null)
          const re = await supabase
            .from("profiles")
            .select("id, role")
            .eq("id", userId)
            .maybeSingle();
          prof = re.data ?? null;
        }
      }

      return prof?.role ?? null;
    };

    const routeBySession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) await log("supabase.getSession error", { error: error.message });

      const user = session?.user;
      await log("session check", { hasSession: !!user });
      if (!user) return false;

      const role = await ensureProfile(user.id);
      const dest = rolePath(role);
      await log("routing by role", { role, dest });
      softReplace(dest);
      return true;
    };

    (async () => {
      const code = searchParams.get("code");
      const sessionId = searchParams.get("session_id");

      // 1) exchange magic-link code if present
      if (code) {
        try {
          await log("found auth code, exchanging");
          await supabase.auth.exchangeCodeForSession(code);
          await log("auth code exchanged OK");
        } catch (e) {
          await log("exchangeCodeForSession failed", { error: e instanceof Error ? e.message : String(e) });
        }
      }

      // 2) if we have a session, go by role (or onboarding)
      const routed = await routeBySession();
      if (routed) return;

      // 3) no session yet; if from Stripe, send to signup to trigger email flow
      if (sessionId) {
        const dest = `/signup?session_id=${encodeURIComponent(sessionId)}`;
        await log("no session; redirecting to signup with session_id", { dest });
        softReplace(dest);
        return;
      }

      // 4) fallback → sign-in
      await log("no session and no session_id; redirecting to sign-in");
      softReplace("/sign-in");
    })();

    // 5) safety re-check after 4s
    const safety = setTimeout(async () => {
      if (navigated.current || cancelled) return;
      await log("safety timeout: still here on /confirm; re-checking session");
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
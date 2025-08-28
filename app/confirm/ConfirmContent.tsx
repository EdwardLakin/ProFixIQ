// app/confirm/ConfirmContent.tsx
"use client";

import { useEffect, useRef } from "react";
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
  "/onboarding";

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
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();
  const navigated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const goto = (url: string) => {
      if (cancelled || navigated.current) return;
      navigated.current = true;
      router.replace(url);
      router.refresh();
    };

    const ensureProfileAndRoute = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return goto("/sign-in");

      // Try read role
      let { data: prof, error } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .maybeSingle();
      if (error) await log("profiles read error", { error: error.message });

      // If no row, insert minimal one (role null so they go to onboarding)
      if (!prof) {
        const { error: insErr } = await supabase.from("profiles").insert({
          id: user.id,
          email: user.email ?? null,
          role: null,
        } as Database["public"]["Tables"]["profiles"]["Insert"]);
        if (insErr) await log("profiles insert error", { error: insErr.message });
        prof = { id: user.id, role: null };
      }

      const dest = rolePath(prof?.role ?? null);
      await log("routing by role", { role: prof?.role ?? null, dest });
      goto(dest);
    };

    (async () => {
      // 1) First, support the “hash fragment” format: #access_token=...&refresh_token=...
      let handled = false;
      if (typeof window !== "undefined" && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const at = hashParams.get("access_token");
        const rt = hashParams.get("refresh_token");
        const error = hashParams.get("error_description") || hashParams.get("error");

        if (error) await log("hash error from magic link", { error });

        if (at && rt) {
          await log("found hash tokens; setting session");
          try {
            const { error: setErr } = await supabase.auth.setSession({
              access_token: at,
              refresh_token: rt,
            });
            if (setErr) {
              await log("setSession failed", { error: setErr.message });
              return goto("/sign-in");
            }
            // Clean up the hash so we don’t re-process on back/forward
            history.replaceState({}, "", window.location.pathname + window.location.search);
            handled = true;
          } catch (e) {
            await log("setSession threw", { error: String(e) });
            return goto("/sign-in");
          }
        }
      }

      // 2) Support the “code in query” format: ?code=...
      const code = sp.get("code");
      if (!handled && code) {
        await log("exchanging code");
        try {
          await supabase.auth.exchangeCodeForSession(code);
          handled = true;
        } catch (e) {
          await log("exchange failed", { error: e instanceof Error ? e.message : String(e) });
          return goto("/sign-in");
        }
      }

      // 3) If neither tokens nor code are present, bounce to sign-in
      if (!handled) {
        await log("no code or tokens present on /confirm");
        return goto("/sign-in");
      }

      // 4) We have a session → ensure profile & route
      await ensureProfileAndRoute();
    })();

    // 5) Safety timer (in case the browser stalled)
    const safety = setTimeout(async () => {
      if (navigated.current || cancelled) return;
      await log("safety timeout on /confirm");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) goto("/sign-in");
      else goto("/onboarding");
    }, 4000);

    return () => {
      cancelled = true;
      clearTimeout(safety);
    };
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
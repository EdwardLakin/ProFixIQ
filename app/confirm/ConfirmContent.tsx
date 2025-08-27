// app/confirm/ConfirmContent.tsx
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
  "/onboarding"; // default for first-time users

// ship logs to server so they appear in Vercel logs
async function log(message: string, extra?: Record<string, unknown>) {
  try {
    console.log("[confirm]", message, extra ?? "");
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
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    let cancelled = false;

    async function ensureProfile(userId: string, email: string | null) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .maybeSingle();

      if (error) await log("profiles fetch error", { error: error.message });

      if (!data) {
        await log("no profile row; inserting minimal profile");
        const { error: insErr } = await supabase.from("profiles").insert({
          id: userId,
          email,
          created_at: new Date().toISOString(),
          role: null,
        } as Database["public"]["Tables"]["profiles"]["Insert"]);
        if (insErr) await log("profile insert error", { error: insErr.message });
        return { role: null as string | null };
      }
      return { role: data.role as string | null };
    }

    const proceed = async () => {
      // 1) If we came back with a Supabase auth code (magic link / OAuth), exchange it
      const code = searchParams.get("code");
      if (code) {
        try {
          await log("found auth code, exchanging");
          await supabase.auth.exchangeCodeForSession(code);
          await log("auth code exchanged OK");
        } catch (e) {
          await log("exchangeCodeForSession failed", { error: e instanceof Error ? e.message : String(e) });
        }
      }

      // 2) If we already have a session, ensure profile then route by role
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        const sid = searchParams.get("session_id");
        const dest = sid ? `/signup?session_id=${encodeURIComponent(sid)}` : "/sign-in";
        await log("no session; redirecting", { dest });
        if (!cancelled) router.replace(dest);
        return;
      }

      const user = session.user;
      await log("session check", { hasSession: true, userId: user.id });

      const { role } = await ensureProfile(user.id, user.email ?? null);
      const path = rolePath(role);
      await log("routing after confirm", { role, path });
      if (!cancelled) router.replace(path);
    };

    // Run once
    proceed();

    // Also listen for a late-arriving session (SIGNED_IN)
    const { data: listener } = supabase.auth.onAuthStateChange(async (ev) => {
      await log("auth state change", { event: ev });
      if (ev === "SIGNED_IN") await proceed();
    });

    return () => {
      cancelled = true;
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
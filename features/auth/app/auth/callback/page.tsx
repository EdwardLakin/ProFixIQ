"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    const handleAuthRedirect = async () => {
      setLoading(true);

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const sessionId = url.searchParams.get("session_id"); // from Stripe
      const plan = url.searchParams.get("plan"); // optional
      const bootstrap = url.searchParams.get("bootstrap") || url.searchParams.get("as"); // e.g. 'owner'

      // 1) Exchange code for session (email confirmation)
      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          console.error("Session exchange error:", exchangeError.message);
          setLoading(false);
          router.push("/"); // fallback
          return;
        }
      }

      // 2) Get session + user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("User fetch error:", userError?.message);
        setLoading(false);
        router.push(
          "/onboarding" + (sessionId ? `?session_id=${sessionId}` : ""),
        );
        return;
      }

      // 3) Ensure profile exists; default to role: "customer" if missing
      let role: string | null = null;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, full_name, phone, shop_id, plan, business_name")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        // Create a minimal customer profile
        const { error: insertErr } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            role: "customer" as any,
            ...(plan ? { plan } : {}),
            email: user.email ?? null,
          } as Database["public"]["Tables"]["profiles"]["Insert"]);
        if (insertErr) {
          console.warn("Profile insert error:", insertErr.message);
        }
        role = "customer";
      } else {
        role = profile.role ?? "customer";

        // Attach/overwrite plan if provided in URL
        if (plan && plan !== profile.plan) {
          await supabase.from("profiles").update({ plan }).eq("id", user.id);
        }

        // If role is missing, coerce to customer
        if (!profile.role) {
          await supabase
            .from("profiles")
            .update({ role: "customer" as any })
            .eq("id", user.id);
          role = "customer";
        }
      }

      // 3.5) Optional: bootstrap owner + shop if requested (safe no-op otherwise)
      // Trigger by appending ?bootstrap=owner (or ?as=owner) to your Stripe/email return URL
      if (bootstrap === "owner") {
        try {
          const res = await fetch("/api/onboarding/bootstrap-owner", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            console.warn("bootstrap-owner failed:", j?.msg || res.statusText);
          } else {
            // refresh role after bootstrap (route updates profile.role/shop_id)
            const { data: refreshed } = await supabase
              .from("profiles")
              .select("role, shop_id")
              .eq("id", user.id)
              .single();
            if (refreshed?.role) role = refreshed.role;
          }
        } catch (e) {
          console.warn("bootstrap-owner error:", (e as Error).message);
        }
      }

      // 4) Staff vs customer routing
      const redirectMap = {
        owner: "/dashboard/owner",
        admin: "/dashboard/admin",
        manager: "/dashboard/manager",
        advisor: "/dashboard/advisor",
        parts: "/dashboard/parts",
        mechanic: "/dashboard/tech",
      } as const;

      type StaffRole = keyof typeof redirectMap;

      const isStaffRole = (r: string | null): r is StaffRole =>
        r === "owner" ||
        r === "admin" ||
        r === "manager" ||
        r === "advisor" ||
        r === "parts" ||
        r === "mechanic";

      // If customer (or no role yet) → onboarding/profile (your flow)
      if (!isStaffRole(role)) {
        router.push(
          "/onboarding/profile" + (sessionId ? `?session_id=${sessionId}` : "")
        );
        return;
      }

      // 5) Staff: if profile incomplete, send to onboarding; else to their dashboard
      const { data: finalProfile } = await supabase
        .from("profiles")
        .select("role, full_name, phone, shop_id")
        .eq("id", user.id)
        .single();

      const incomplete =
        !finalProfile?.role ||
        !finalProfile?.full_name ||
        !finalProfile?.phone ||
        !finalProfile?.shop_id;

      if (incomplete) {
        router.push(
          "/onboarding" + (sessionId ? `?session_id=${sessionId}` : "")
        );
        return;
      }

      router.push(redirectMap[role]);
    };

    handleAuthRedirect();
  }, [router, supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white font-blackops">
      <div className="flex flex-col items-center">
        <p className="text-orange-400 text-lg mb-2">Signing you in...</p>
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    const handleAuthRedirect = async () => {
      setLoading(true);

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const sessionId = url.searchParams.get("session_id"); // 🔄 retrieve from URL

      // 1. Exchange code for session
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

      // 2. Get session + user
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

      // 3. Check profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, full_name, phone, shop_id")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        console.warn("Profile not found — redirecting to onboarding.");
        router.push(
          "/onboarding" + (sessionId ? `?session_id=${sessionId}` : ""),
        );
        return;
      }

      const { role, full_name, phone, shop_id } = profile;

      // 4. If profile is incomplete → onboarding
      if (!role || !full_name || !phone || !shop_id) {
        router.push(
          "/onboarding" + (sessionId ? `?session_id=${sessionId}` : ""),
        );
        return;
      }

      // 5. Redirect based on role
      const redirectMap: Record<string, string> = {
        owner: "/dashboard/owner",
        admin: "/dashboard/admin",
        manager: "/dashboard/manager",
        advisor: "/dashboard/advisor",
        mechanic: "/dashboard/tech",
      };

      router.push(redirectMap[role] || "/");
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

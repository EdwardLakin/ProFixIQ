"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function DashboardRedirect() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    const redirectToDashboard = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (error || !profile?.role) {
        router.push("/auth");
        return;
      }

      switch (profile.role) {
        case "owner":
          router.push("/dashboard/owner");
          break;
        case "admin":
          router.push("/dashboard/admin");
          break;
        case "manager":
          router.push("/dashboard/manager");
          break;
        case "advisor":
          router.push("/dashboard/advisor");
          break;
        case "mechanic":
        case "tech":
          router.push("/dashboard/tech");
          break;
        case "parts":
          router.push("/dashboard/parts");
          break;
        default:
          router.push("/");
      }
    };

    redirectToDashboard();
  }, [router, supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white font-blackops">
      <p className="text-orange-500 text-xl animate-pulse">
        Redirecting to your dashboard...
      </p>
    </div>
  );
}

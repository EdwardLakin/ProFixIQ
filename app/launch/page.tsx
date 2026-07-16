"use client";

import { useEffect } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { resolveInstalledLaunchPath } from "@/features/shared/lib/pwa/launch";

export default function LaunchPage() {
  useEffect(() => {
    let active = true;
    const launch = async () => {
      if (!navigator.onLine) {
        window.location.replace("/offline");
        return;
      }
      const supabase = createBrowserSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!active) return;
      if (!userId) {
        window.location.replace("/sign-in?next=/launch");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      if (!active) return;
      const compactViewport = window.matchMedia("(max-width: 900px)").matches;
      window.location.replace(
        resolveInstalledLaunchPath(profile?.role, compactViewport),
      );
    };
    void launch();
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
      <p className="text-sm uppercase tracking-[0.2em]">Opening ProFixIQ…</p>
    </main>
  );
}

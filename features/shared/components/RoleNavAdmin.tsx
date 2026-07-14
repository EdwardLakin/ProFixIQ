// features/shared/components/RoleNavAdmin.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import ShiftTracker from "@shared/components/ShiftTracker";

export default function RoleNavAdmin() {
  const supabase = createBrowserSupabase();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (!uid) return;
      setUserId(uid);
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .single();
      setIsAdmin(profile?.role === "admin");
    })();
  }, [supabase]);

  if (!isAdmin) return null;

  return (
    <div className="hidden md:flex md:w-64 flex-col gap-4 border-r border-[color:var(--theme-border-soft)] bg-surface/80 backdrop-blur">
      {/* everything admin can reach is now in the tile-based sidebar already */}
      <div className="px-4 pt-4 space-y-3 border-t border-[color:var(--theme-border-soft)]">
        <p className="text-xs font-medium text-[color:var(--theme-text-secondary)]">Admin tools</p>
        <Link
          href="/ai/assistant"
          className="block text-sm text-[color:var(--theme-text-primary)] hover:text-[color:var(--theme-text-primary)]"
        >
          AI Assistant
        </Link>
      </div>

      {userId ? (
        <div className="px-4 pb-4 border-t border-[color:var(--theme-border-soft)]">
          <p className="text-xs font-medium text-[color:var(--theme-text-secondary)] mb-2">
            Shift tracker
          </p>
          <ShiftTracker userId={userId} />
        </div>
      ) : null}
    </div>
  );
}
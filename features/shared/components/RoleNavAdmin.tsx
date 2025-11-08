// features/shared/components/RoleNavAdmin.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import ShiftTracker from "@shared/components/ShiftTracker";

export default function RoleNavAdmin() {
  const supabase = createClientComponentClient<Database>();
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
    <div className="hidden md:flex md:w-64 flex-col gap-4 border-r border-white/5 bg-surface/80 backdrop-blur">
      {/* everything admin can reach is now in the tile-based sidebar already */}
      <div className="px-4 pt-4 space-y-3 border-t border-white/5">
        <p className="text-xs font-medium text-neutral-400">Admin tools</p>
        <Link
          href="/ai/assistant"
          className="block text-sm text-neutral-200 hover:text-white"
        >
          AI Assistant
        </Link>
      </div>

      {userId ? (
        <div className="px-4 pb-4 border-t border-white/5">
          <p className="text-xs font-medium text-neutral-400 mb-2">
            Shift tracker
          </p>
          <ShiftTracker userId={userId} />
        </div>
      ) : null}
    </div>
  );
}
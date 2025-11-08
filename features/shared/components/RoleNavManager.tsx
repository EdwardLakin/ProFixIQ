// features/shared/components/RoleNavTech.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import ShiftTracker from "@shared/components/ShiftTracker";
import Link from "next/link";

export default function RoleNavTech() {
  const supabase = createClientComponentClient<Database>();
  const [isTech, setIsTech] = useState(false);
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
      setIsTech(profile?.role === "mechanic");
    })();
  }, [supabase]);

  if (!isTech) return null;

  return (
    <div className="hidden md:flex md:w-64 flex-col gap-4 border-r border-white/5 bg-surface/80 backdrop-blur">
      <div className="px-4 pt-4 space-y-3 border-t border-white/5">
        <p className="text-xs font-medium text-neutral-400">Tech utilities</p>
        <Link href="/tech/queue" className="block text-sm text-neutral-200 hover:text-white">
          My job queue
        </Link>
        <Link href="/tech/calendar" className="block text-sm text-neutral-200 hover:text-white">
          Shop calendar
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
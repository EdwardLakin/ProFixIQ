// features/shared/components/RoleNavOwner.tsx
"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import ShiftTracker from "@shared/components/ShiftTracker";
import Link from "next/link";

export default function RoleNavOwner() {
  const supabase = createBrowserSupabase();
  const [userId, setUserId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

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
      setIsOwner(profile?.role === "owner");
    })();
  }, [supabase]);

  if (!isOwner) return null;

  return (
    <div className="hidden md:flex md:w-64 flex-col gap-4 border-r border-[color:var(--theme-border-soft)] bg-surface/80 backdrop-blur">
      {/* the shared sidebar is already rendered in AppShell; this is just extra owner stuff */}
      <div className="px-4 pt-4 space-y-3 border-t border-[color:var(--theme-border-soft)]">
        <p className="text-xs font-medium text-[color:var(--theme-text-secondary)]">Owner tools</p>
        <Link
          href="/dashboard/owner/reports"
          className="block text-sm text-[color:var(--theme-text-primary)] hover:text-[color:var(--theme-text-primary)]"
        >
          Reports
        </Link>
        <Link
          href="/dashboard/owner/settings"
          className="block text-sm text-[color:var(--theme-text-primary)] hover:text-[color:var(--theme-text-primary)]"
        >
          Settings
        </Link>
        <Link
          href="/compare-plans"
          className="block text-sm text-[color:var(--theme-text-primary)] hover:text-[color:var(--theme-text-primary)]"
        >
          Plan & Billing
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
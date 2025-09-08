"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import ShiftTracker from "@shared/components/ShiftTracker";

// Staff-only roles (exclude "customer")
type Role = "owner" | "admin" | "manager" | "advisor" | "mechanic" | "parts";
type DbRole = Database["public"]["Enums"]["user_role_enum"] | null | undefined;

export type DynamicRoleSidebarProps = {
  /** If provided, we won't fetch the role from Supabase */
  role?: Role;
};

function normalizeRole(raw: DbRole): Role | null {
  switch (raw) {
    case "owner":
    case "admin":
    case "manager":
    case "advisor":
    case "mechanic":
    case "parts":
      return raw;
    default:
      return null;
  }
}

export default function DynamicRoleSidebar({
  role,
}: DynamicRoleSidebarProps): JSX.Element | null {
  const supabase = createClientComponentClient<Database>();
  const [detectedRole, setDetectedRole] = useState<Role | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // If no prop provided, fetch once from Supabase
  useEffect(() => {
    let mounted = true;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (!mounted) return;
      setUserId(uid);

      if (role || !uid) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();

      if (mounted) setDetectedRole(normalizeRole(profile?.role));
    })();

    return () => {
      mounted = false;
    };
  }, [role, supabase]);

  const effectiveRole: Role | null = role ?? detectedRole;
  if (!effectiveRole) return null;

  return (
    <nav className="space-y-6 text-sm">
      {/* Utilities */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Utilities
        </h3>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("open-tech-assistant"))}
          className="mb-2 block w-full rounded bg-neutral-800 px-3 py-2 text-left hover:bg-neutral-700"
        >
          Tech Assistant
        </button>

        <Link
          href="/chat"
          className="block rounded bg-neutral-800 px-3 py-2 hover:bg-neutral-700"
        >
          Team Messages
        </Link>
      </section>

      {/* Settings (kept simple; owner/admin see all) */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Settings
        </h3>

        {(effectiveRole === "owner" || effectiveRole === "admin") && (
          <>
            <Link
              href="/dashboard/owner/settings"
              className="block rounded px-3 py-2 hover:bg-neutral-800"
            >
              Owner Settings
            </Link>
            <Link
              href="/dashboard/owner/reports"
              className="block rounded px-3 py-2 hover:bg-neutral-800"
            >
              Reports
            </Link>
            <Link
              href="/dashboard/owner/create-user"
              className="block rounded px-3 py-2 hover:bg-neutral-800"
            >
              Create User
            </Link>
            <Link
              href="/compare-plans"
              className="block rounded px-3 py-2 hover:bg-neutral-800"
            >
              Plan &amp; Billing
            </Link>
          </>
        )}
      </section>

      {/* Shift tracker for any signed-in staff */}
      {userId ? (
        <section className="mt-6 border-t border-neutral-800 pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Shift Tracker
          </h3>
          <ShiftTracker userId={userId} />
        </section>
      ) : null}
    </nav>
  );
}
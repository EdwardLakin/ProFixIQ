"use client";

import React, { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { MobileShell } from "components/layout/MobileShell";
import { Button } from "@shared/components/ui/Button";

type Db = Database;
type ProfileRow = Db["public"]["Tables"]["profiles"]["Row"];

export default function MobileSettingsPage() {
  const supabase = createClientComponentClient<Db>();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const userId = session?.user?.id;
      if (!userId) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      setProfile(data ?? null);
      setLoading(false);
    };

    void load();
  }, [supabase]);

  if (loading) {
    return (
      <MobileShell>
        <div className="flex h-full items-center justify-center text-sm text-neutral-400">
          Loading…
        </div>
      </MobileShell>
    );
  }

  if (!profile) {
    return (
      <MobileShell>
        <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-neutral-400">
          <p>You need to be signed in to use mobile settings.</p>
          <Button
            size="sm"
            onClick={() => {
              window.location.href = "/login";
            }}
          >
            Go to sign in
          </Button>
        </div>
      </MobileShell>
    );
  }

  const role = profile.role ?? "";
  const isMechanic = role === "mechanic";

  return (
    <MobileShell>
      <div className="flex flex-col gap-4 p-4">
        {/* Who's signed in */}
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-neutral-400">Signed in as</p>
          <p className="text-sm font-semibold text-neutral-50">
            {profile.full_name || "Unknown user"}
          </p>
          <p className="mt-1 text-[11px] text-neutral-500">
            Role: <span className="font-medium">{role || "n/a"}</span>
          </p>
        </div>

        {/* Time & attendance copy only – punch bar lives in the shell */}
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-50">
            Time & attendance
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Use the orange bar at the bottom of the mobile screen to start /
            end your shift, breaks, and lunch. That punch bar is always
            available in the mobile shell.
          </p>

          {!isMechanic && (
            <p className="mt-2 text-[11px] text-yellow-300/80">
              Punch tracking is primarily for mechanics/techs. Your role is{" "}
              <span className="font-semibold">{role || "n/a"}</span>.
            </p>
          )}
        </div>

        {/* Placeholder for more mobile settings later */}
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-neutral-400">
          Additional mobile preferences and notifications can live here later
          (e.g., job alerts, sound/vibration, dark mode overrides).
        </div>
      </div>
    </MobileShell>
  );
}
// features/launcher/components/HomeScreen.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import { APPS } from "@/features/launcher/registry";
import { AppIcon } from "./AppIcon";
import Dock from "./Dock";
import WidgetGrid from "./WidgetGrid";
import { useBadgeBus } from "@/features/launcher/useBadgeBus";

type DB = Database;
type Badge = number | "dot" | 0;

export default function HomeScreen() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [counts, setCounts] = useState<Record<string, Badge>>({});

  const refreshBadges = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const entries = await Promise.all(
      APPS.map(async (a) => [a.slug, a.badge ? await a.badge(user.id) : 0] as const)
    );
    setCounts(Object.fromEntries(entries));
  }, [supabase]);

  useEffect(() => { void refreshBadges(); }, [refreshBadges]);

  // Realtime: refresh when messages / work_orders / notifications change
  useBadgeBus(() => void refreshBadges());

  return (
    <div className="relative mx-auto aspect-[9/19.5] w-full max-w-[420px] rounded-none bg-[url('/wallpapers/blue.jpg')] bg-cover md:rounded-[34px]">
      {/* notch (desktop only) */}
      <div className="absolute left-1/2 top-0 hidden h-6 w-40 -translate-x-1/2 rounded-b-2xl bg-black/80 md:block" />
      {/* content */}
      <div className="absolute inset-0 p-5 pt-10">
        {/* Widgets first */}
        <WidgetGrid />

        {/* App icons grid */}
        <div className="grid grid-cols-4 gap-4">
          {APPS.map((app) => (
            <button
              key={app.slug}
              onClick={() => router.push(app.route)}
              className="focus-visible:outline-none"
              aria-label={app.name}
              title={app.name}
            >
              <AppIcon icon={app.icon} name={app.name} count={counts[app.slug] ?? 0} />
            </button>
          ))}
        </div>
      </div>

      {/* Dock */}
      <div className="absolute inset-x-0 bottom-4">
        <Dock />
        <div className="mx-auto mt-3 hidden h-1 w-24 rounded-full bg-white/70 md:block" />
      </div>
    </div>
  );
}
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { MobileShell } from "components/layout/MobileShell";

type DB = Database;

type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];

// Later: import the dedicated tech dashboard
// import MobileTechDashboard from "@/features/mobile/tech/MobileTechDashboard";

export default function MobileHome() {
  const supabase = createClientComponentClient<DB>();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);

  // Load profile + shop
  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getUser();
        if (!sessionData?.user) {
          setLoading(false);
          return;
        }

        const uid = sessionData.user.id;

        const { data: profileRow } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", uid)
          .maybeSingle();

        setProfile(profileRow ?? null);

        if (profileRow?.shop_id) {
          const { data: shopRow } = await supabase
            .from("shops")
            .select("*")
            .eq("id", profileRow.shop_id)
            .maybeSingle();

          setShop(shopRow ?? null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  const userName = profile?.full_name ?? null;
  const shopName = shop?.name ?? null;

  return (
    <MobileShell>
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-8 pt-6">
          {/* Header */}
          <header className="space-y-1 text-center">
            <div className="text-[0.7rem] uppercase tracking-[0.25em] text-neutral-500">
              ProFixIQ • Mobile
            </div>

            <h1 className="font-blackops text-xl uppercase tracking-[0.18em] text-orange-400">
              Shop Console
            </h1>

            {loading ? (
              <p className="text-[0.8rem] text-neutral-400">Loading…</p>
            ) : userName ? (
              <p className="text-[0.8rem] text-neutral-400">
                Hi,{" "}
                <span className="font-medium text-neutral-100">{userName}</span>.
                {shopName && (
                  <span className="ml-1 text-neutral-300">({shopName})</span>
                )}
              </p>
            ) : (
              <p className="text-[0.8rem] text-neutral-400">
                Stay on top of jobs from your phone.
              </p>
            )}
          </header>

          {/* 🚧 LATER: Mechanic-only dashboard override
          
          if (profile?.role === "mechanic") {
            return (
              <MobileShell>
                <MobileTechDashboard
                  userId={profile.id}
                  fullName={profile.full_name}
                  shopId={profile.shop_id}
                />
              </MobileShell>
            );
          }

          For now we show the tiles for all roles (mechanic, advisor, etc.)
          */}

          {/* App tiles */}
          <section className="grid grid-cols-2 gap-3">
            {/* Jobs / Work Orders */}
            <Link
              href="/mobile/work-orders"
              className="flex h-28 flex-col justify-between rounded-2xl border border-orange-500/70 bg-gradient-to-br from-orange-500/20 via-black/40 to-black/80 p-3 shadow-lg shadow-orange-500/30"
            >
              <div className="text-[0.7rem] uppercase tracking-[0.18em] text-orange-200/80">
                Jobs
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  Work Orders
                </div>
                <div className="mt-1 text-[0.75rem] text-orange-100/90">
                  View & update live jobs.
                </div>
              </div>
            </Link>

            {/* New work order */}
            <Link
              href="/mobile/work-orders/create"
              className="flex h-28 flex-col justify-between rounded-2xl border border-neutral-700 bg-gradient-to-br from-neutral-900 via-black to-black p-3"
            >
              <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
                Quick
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  New Work Order
                </div>
                <div className="mt-1 text-[0.75rem] text-neutral-400">
                  Capture customer & vehicle.
                </div>
              </div>
            </Link>

            {/* Inspections */}
            <Link
              href="/mobile/inspections"
              className="flex h-28 flex-col justify-between rounded-2xl border border-neutral-700 bg-gradient-to-br from-neutral-900 via-black to-black p-3"
            >
              <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
                Inspections
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  Inspection Queue
                </div>
                <div className="mt-1 text-[0.75rem] text-neutral-400">
                  Start & review inspection forms.
                </div>
              </div>
            </Link>

            {/* AI & Messages */}
            <Link
              href="/mobile/messages"
              className="flex h-28 flex-col justify-between rounded-2xl border border-neutral-700 bg-gradient-to-br from-neutral-900 via-black to-black p-3"
            >
              <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
                AI
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  AI & Messages
                </div>
                <div className="mt-1 text-[0.75rem] text-neutral-400">
                  Chat with AI and your team.
                </div>
              </div>
            </Link>

            {/* Planner */}
            <Link
              href="/mobile/planner"
              className="col-span-2 flex h-28 flex-col justify-between rounded-2xl border border-neutral-700 bg-gradient-to-br from-neutral-900 via-black to-black p-3"
            >
              <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
                Planner
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  Tech & Job Planner
                </div>
                <div className="mt-1 text-[0.75rem] text-neutral-400">
                  See what’s coming up and who’s on it.
                </div>
              </div>
            </Link>
          </section>

          <footer className="mt-2 text-center text-[0.65rem] text-neutral-500">
            Mobile companion • Use the desktop app for admin & setup.
          </footer>
        </div>
      </main>
    </MobileShell>
  );
}
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { MobileShell } from "components/layout/MobileShell";

type DB = Database;

export default function MobileHome() {
  const supabase = createClientComponentClient<DB>();
  const [shopName, setShopName] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, shop_id")
          .eq("id", user.id)
          .maybeSingle();

        setUserName(profile?.full_name ?? null);

        if (profile?.shop_id) {
          const { data: shop } = await supabase
            .from("shops")
            .select("name")
            .eq("id", profile.shop_id)
            .maybeSingle();

          setShopName(shop?.name ?? null);
        }
      } catch {
        // mobile home still works without this
      }
    })();
  }, [supabase]);

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
            <p className="text-[0.8rem] text-neutral-400">
              {userName ? (
                <>
                  Hi,{" "}
                  <span className="font-medium text-neutral-100">
                    {userName}
                  </span>
                  .
                </>
              ) : (
                "Stay on top of jobs from your phone."
              )}{" "}
              {shopName && (
                <span className="ml-1 text-neutral-300">({shopName})</span>
              )}
            </p>
          </header>

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

            {/* New work order (mobile create flow) */}
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

            {/* AI / Messages */}
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
              className="flex h-28 flex-col justify-between rounded-2xl border border-neutral-700 bg-gradient-to-br from-neutral-900 via-black to-black p-3 col-span-2"
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
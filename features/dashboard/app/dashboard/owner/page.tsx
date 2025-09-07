"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function OwnerDashboardPage() {
  const supabase = createClientComponentClient<Database>();

  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string>("");
  const [shopName, setShopName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!isMounted) return;

        if (user?.email) setEmail(user.email);

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, shop_id, shop_name")
          .eq("id", user?.id ?? "")
          .single();

        if (!isMounted) return;

        if (profile?.full_name) setFullName(profile.full_name);

        if (profile?.shop_name) {
          setShopName(profile.shop_name);
        } else if (profile?.shop_id) {
          const { data: shop } = await supabase
            .from("shops")
            .select("name")
            .eq("id", profile.shop_id)
            .single();
          if (!isMounted) return;
          if (shop?.name) setShopName(shop.name);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const greeting = useMemo(() => {
    if (loading) return "Loading…";
    if (fullName && shopName) return `${shopName} — Welcome, ${fullName}`;
    if (shopName) return shopName;
    if (fullName) return `Welcome, ${fullName}`;
    return "Owner Dashboard";
  }, [fullName, shopName, loading]);

  async function handleAddOnPurchase() {
    if (!email) return alert("User email not found.");
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        planKey: "additional_users",
        interval: "yearly",
        isAddon: true,
      }),
    });
    const data = await res.json().catch(() => null);
    if (data && data.url) window.location.href = data.url;
    else alert("Failed to redirect to Stripe.");
  }

  return (
    <div className="min-h-screen p-6 text-white">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-orange-400">Owner Dashboard</h1>
          <p className="text-sm text-white/70">{greeting}</p>
        </div>

        {/* Quick actions */}
        <div className="mt-3 flex gap-2 sm:mt-0">
          <Link
            href="/dashboard/work-orders/create"
            className="rounded-md bg-orange-500 px-4 py-2 font-semibold text-black transition hover:bg-orange-600"
          >
            + Create Work Order
          </Link>
          <Link
            href="/dashboard/work-orders/queue"
            className="rounded-md border border-white/15 px-4 py-2 transition hover:border-orange-500"
          >
            View Queue
          </Link>
        </div>
      </div>

      {/* Main tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/work-orders" aria-label="Work Orders">
          <Tile title="Work Orders" subtitle="Create, queue, review quotes" />
        </Link>

        <Link href="/dashboard/parts" aria-label="Parts">
          <Tile title="Parts" subtitle="Manage requests, inventory, suppliers" />
        </Link>

        {/* NOTE: /inspections is still outside dashboard unless nested under /dashboard/inspections */}
        <Link href="/inspections" aria-label="Inspections">
          <Tile title="Inspections" subtitle="View and assign inspections" />
        </Link>

        <Link href="/dashboard/owner/create-user" aria-label="User Management">
          <Tile title="User Management" subtitle="Create, edit, delete users" />
        </Link>

        <Link href="/dashboard/owner/reports" aria-label="Reports">
          <Tile title="Reports" subtitle="View shop reports and stats" />
        </Link>

        <Link href="/dashboard/owner/settings" aria-label="Settings">
          <Tile title="Settings" subtitle="Manage shop settings" />
        </Link>

        <Link
          href="/dashboard/owner/import-customers"
          aria-label="Customer Import"
        >
          <Tile
            title="Customer Import"
            subtitle="Import customers and vehicle history"
          />
        </Link>

        <Link href="/dashboard/workspace" aria-label="Workspace">
          <Tile
            title="Workspace (Multi-view)"
            subtitle="Open Work Orders, Parts, Inspections without losing your place"
          />
        </Link>

        <button
          onClick={handleAddOnPurchase}
          className="rounded-lg border border-purple-500 bg-purple-800/70 p-5 text-left transition hover:-translate-y-0.5 hover:bg-purple-700 hover:shadow-lg hover:shadow-purple-500/20 active:translate-y-0"
          aria-label="Purchase Add-On"
        >
          <h2 className="text-lg font-semibold text-white">Purchase Add-On</h2>
          <p className="mt-1 text-sm text-white/80">
            Add 5 more users ($500/year)
          </p>
        </button>
      </div>
    </div>
  );
}

function Tile(props: { title: string; subtitle?: string }) {
  return (
    <div
      className="cursor-pointer rounded-lg border border-white/10 bg-neutral-900 p-5 transition hover:-translate-y-0.5 hover:border-orange-500 hover:shadow-lg hover:shadow-orange-500/10 active:translate-y-0"
      role="button"
      tabIndex={0}
      aria-label={props.title}
    >
      <h2 className="text-lg font-semibold text-white">{props.title}</h2>
      {props.subtitle ? (
        <p className="mt-1 text-sm text-white/70">{props.subtitle}</p>
      ) : null}
    </div>
  );
}
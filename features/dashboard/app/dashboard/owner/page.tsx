"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/supabase";

export default function OwnerDashboardPage() {
  const supabase = createClientComponentClient<Database>();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.email) setEmail(user.email);
    };

    load();
  }, [supabase]);

  const handleAddOnPurchase = async () => {
    if (!email) return alert("User email not found");

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({
        email,
        planKey: "additional_users",
        interval: "yearly", // or 'monthly'
        isAddon: true,
      }),
    });

    const { url } = await res.json();
    if (url) {
      window.location.href = url;
    } else {
      alert("Failed to redirect to Stripe.");
    }
  };

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-3xl font-bold text-orange-400">Owner Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Link href="/work-orders">
          <div className="bg-neutral-800 hover:bg-orange-600 p-4 rounded-md shadow transition cursor-pointer">
            <h2 className="text-lg font-semibold text-white">Work Orders</h2>
            <p className="text-sm text-white/70">
              Create, queue, review quotes
            </p>
          </div>
        </Link>

        <Link href="/parts">
          <div className="bg-neutral-800 hover:bg-orange-600 p-4 rounded-md shadow transition cursor-pointer">
            <h2 className="text-lg font-semibold text-white">Parts</h2>
            <p className="text-sm text-white/70">
              Manage requests, inventory, suppliers
            </p>
          </div>
        </Link>

        <Link href="/inspections">
          <div className="bg-neutral-800 hover:bg-orange-600 p-4 rounded-md shadow transition cursor-pointer">
            <h2 className="text-lg font-semibold text-white">Inspections</h2>
            <p className="text-sm text-white/70">View and assign inspections</p>
          </div>
        </Link>

        <Link href="/dashboard/owner/create-user">
          <div className="bg-neutral-800 hover:bg-orange-600 p-4 rounded-md shadow transition cursor-pointer">
            <h2 className="text-lg font-semibold text-white">
              User Management
            </h2>
            <p className="text-sm text-white/70">Create, edit, delete users</p>
          </div>
        </Link>

        <Link href="/dashboard/owner/reports">
          <div className="bg-neutral-800 hover:bg-orange-600 p-4 rounded-md shadow transition cursor-pointer">
            <h2 className="text-lg font-semibold text-white">Reports</h2>
            <p className="text-sm text-white/70">View shop reports and stats</p>
          </div>
        </Link>

        <Link href="/dashboard/owner/settings">
          <div className="bg-neutral-800 hover:bg-orange-600 p-4 rounded-md shadow transition cursor-pointer">
            <h2 className="text-lg font-semibold text-white">Settings</h2>
            <p className="text-sm text-white/70">Manage shop settings</p>
          </div>
        </Link>

        <Link href="/dashboard/owner/import-customers">
          <div className="bg-neutral-800 hover:bg-orange-600 p-4 rounded-md shadow transition cursor-pointer">
            <h2 className="text-lg font-semibold text-white">
              Customer Import
            </h2>
            <p className="text-sm text-white/70">
              Import customers and vehicle history
            </p>
          </div>
        </Link>

        <button
          onClick={handleAddOnPurchase}
          className="bg-purple-800 hover:bg-purple-600 p-4 rounded-md shadow transition text-left"
        >
          <h2 className="text-lg font-semibold text-white">Purchase Add-On</h2>
          <p className="text-sm text-white/70">Add 5 more users ($500/year)</p>
        </button>
      </div>
    </div>
  );
}

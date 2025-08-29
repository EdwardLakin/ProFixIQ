"use client";
// app/dashboard/manager/page.tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import ManagerJobDashboard from "@work-orders/components/manager/ManagerJobDashboard";

export const metadata = { title: "Manager Dashboard" };

export default async function ManagerDashboardPage() {
  const supabase = await createServerSupabaseRSC();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth"); // or your sign-in route

  // Simple role gate (tweak allowed roles as needed)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const allowed = new Set(["manager", "advisor", "owner", "admin"]);
  if (!profile || !allowed.has(profile.role ?? "")) {
    redirect("/dashboard");
  }

  return (
    <Suspense fallback={<div className="p-4 text-sm text-neutral-400">Loading…</div>}>
      <ManagerJobDashboard />
    </Suspense>
  );
}
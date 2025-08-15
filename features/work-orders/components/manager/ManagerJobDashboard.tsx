// features/dashboard/app/dashboard/manager/page.tsx
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

  if (!user) {
    redirect("/auth"); // change to your sign-in route if different
  }

  // Basic role guard – adjust allowed roles as needed
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const allowedRoles = new Set(["manager", "advisor", "owner", "admin"]);
  if (!profile || !allowedRoles.has(profile.role ?? "")) {
    redirect("/dashboard");
  }

  return (
    <Suspense fallback={<div className="p-4 text-neutral-400">Loading Manager Dashboard…</div>}>
      <ManagerJobDashboard />
    </Suspense>
  );
}
import { redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import {
  SHOP_ASSIGNMENT_REQUIRED_PATH,
  resolvePostAuthDecision,
} from "@/features/auth/lib/postAuthRouting";

export default async function ShopAssignmentRequiredPage() {
  const supabase = createServerSupabaseRSC();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("completed_onboarding, must_change_password, role, shop_id, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const destination = resolvePostAuthDecision({
    isAuthenticated: true,
    profile,
  });

  if (destination !== SHOP_ASSIGNMENT_REQUIRED_PATH) redirect(destination);

  return (
    <main className="min-h-screen px-6 py-10 text-white">
      <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-black/35 p-8 shadow-card backdrop-blur-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--accent-copper-light)]">
          Account setup
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Shop assignment required</h1>
        <p className="mt-4 text-sm leading-6 text-neutral-300">
          Your account is signed in, but it is not connected to a shop yet. Ask
          your shop owner or administrator to assign your profile to the right
          shop. Staff accounts cannot create shops from this screen.
        </p>
        <dl className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-300">
          <div className="flex justify-between gap-4">
            <dt>Name</dt>
            <dd className="text-right text-neutral-100">{profile?.full_name ?? "Not set"}</dd>
          </div>
          <div className="mt-2 flex justify-between gap-4">
            <dt>Email</dt>
            <dd className="text-right text-neutral-100">{profile?.email ?? user.email ?? "Not set"}</dd>
          </div>
          <div className="mt-2 flex justify-between gap-4">
            <dt>Role</dt>
            <dd className="text-right text-neutral-100">{profile?.role ?? "Staff"}</dd>
          </div>
        </dl>
      </div>
    </main>
  );
}

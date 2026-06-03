import { redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

export default async function ProfileRecoveryPage() {
  const supabase = createServerSupabaseRSC();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  return (
    <main className="min-h-screen px-6 py-10 text-white">
      <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-black/35 p-8 shadow-card backdrop-blur-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--accent-copper-light)]">
          Account recovery
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Profile setup required</h1>
        <p className="mt-4 text-sm leading-6 text-neutral-300">
          You are signed in, but ProFixIQ could not find a profile record for
          your account. Sign out and sign back in to retry profile creation, or
          contact support if this account was created by a shop administrator.
        </p>
      </div>
    </main>
  );
}

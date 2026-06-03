import { redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import {
  resolvePostAuthDecision,
  ONBOARDING_V2_PATH,
} from "@/features/auth/lib/postAuthRouting";
import { OnboardingV2OwnerSetup } from "@/features/auth/app/onboarding-v2/OnboardingV2OwnerSetup";

export default async function OnboardingV2Page() {
  const supabase = createServerSupabaseRSC();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("completed_onboarding, must_change_password, role, shop_id, full_name, phone, email")
    .eq("id", user.id)
    .maybeSingle();

  const destination = resolvePostAuthDecision({
    isAuthenticated: true,
    profile,
  });

  if (destination !== ONBOARDING_V2_PATH) redirect(destination);

  return (
    <OnboardingV2OwnerSetup
      email={profile?.email ?? user.email ?? ""}
      fullName={profile?.full_name ?? user.user_metadata?.full_name ?? ""}
      phone={profile?.phone ?? ""}
      role={profile?.role ?? "owner"}
    />
  );
}

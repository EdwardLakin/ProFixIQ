import { redirect } from "next/navigation";

import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import OwnerOnboardingForm from "./OwnerOnboardingForm";

export const dynamic = "force-dynamic";

export default async function OwnerOnboardingPage() {
  const supabase = createServerSupabaseRSC();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id, completed_onboarding")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.shop_id || profile?.completed_onboarding) {
    redirect("/dashboard");
  }

  return <OwnerOnboardingForm />;
}

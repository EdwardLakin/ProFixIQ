import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";

export function getServerSupabase() {
  return createServerSupabaseRoute();
}

export function getAssistantNotificationWriter() {
  return createAdminSupabase();
}

export async function markAssistantNotificationTrustedWriterRollout(
  writer = getAssistantNotificationWriter(),
) {
  if (process.env.VERCEL_ENV !== "production") return;

  const deploymentSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (!deploymentSha) return;

  const { error } = await writer.rpc(
    "mark_assistant_notification_trusted_writer_rollout",
    {
      p_deployment_sha: deploymentSha,
      p_deployment_id: process.env.VERCEL_DEPLOYMENT_ID?.trim() || undefined,
    },
  );

  if (error) {
    console.warn(
      "Unable to record assistant notification trusted-writer rollout",
      error,
    );
  }
}

export async function getUserAndShopId() {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, shop_id, role")
    .eq("user_id", user.id)
    .single();
  if (error || !profile?.shop_id) throw new Error("No active shop");
  return {
    supabase,
    user,
    shopId: profile.shop_id as string,
    profileId: profile.id,
    role: profile.role,
  };
}

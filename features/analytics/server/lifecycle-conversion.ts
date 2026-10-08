import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const LIFECYCLE_ANALYTICS_TIMEOUT_MS = 250;

type AdminSupabase = ReturnType<typeof createAdminSupabase>;

async function withLifecycleTimeout<T>(
  operation: PromiseLike<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("marketing lifecycle analytics timeout")),
          LIFECYCLE_ANALYTICS_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function recordMarketingSignupCompleted(args: {
  admin: AdminSupabase;
  intentId: string;
  userId: string;
}): Promise<boolean> {
  try {
    const { data, error } = await withLifecycleTimeout(
      args.admin.rpc("record_marketing_signup_completed", {
        p_intent_id: args.intentId,
        p_user_id: args.userId,
      }),
    );
    if (error) throw error;
    return data === true;
  } catch (error) {
    console.warn("marketing_signup_completed_capture_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

export async function recordMarketingOnboardingCompleted(args: {
  sessionId: string;
  shopId: string;
}): Promise<boolean> {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await withLifecycleTimeout(
      admin.rpc("record_marketing_onboarding_completed", {
        p_session_id: args.sessionId,
        p_shop_id: args.shopId,
      }),
    );
    if (error) throw error;
    return data === true;
  } catch (error) {
    console.warn("marketing_onboarding_completed_capture_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

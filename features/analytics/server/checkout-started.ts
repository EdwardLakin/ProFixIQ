import "server-only";

import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { ProductPackageKey } from "@/features/stripe/lib/stripe/product-packages";

type AdminClient = ReturnType<typeof createAdminSupabase>;
type MarketingCheckoutMode = "trial" | "paid";
type MarketingCheckoutInterval = "monthly" | null;

export async function recordMarketingCheckoutStarted(input: {
  admin: AdminClient;
  checkoutAttemptId: string;
  packageKey: ProductPackageKey | null;
  interval: MarketingCheckoutInterval;
  checkoutMode: MarketingCheckoutMode;
}): Promise<void> {
  try {
    const { error } = await input.admin.from("marketing_events").insert({
      event_name: "checkout_started",
      destination: "stripe_checkout",
      package_key: input.packageKey,
      interval: input.interval,
      checkout_mode: input.checkoutMode,
      checkout_attempt_id: input.checkoutAttemptId,
    });

    if (!error || error.code === "23505") return;

    console.error("marketing_checkout_started_persistence_failed", {
      code: error.code ?? "unknown",
    });
  } catch (error) {
    console.error("marketing_checkout_started_persistence_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

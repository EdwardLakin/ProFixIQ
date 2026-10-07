import "server-only";

import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { ProductPackageKey } from "@/features/stripe/lib/stripe/product-packages";

type AdminClient = ReturnType<typeof createAdminSupabase>;
type MarketingCheckoutMode = "trial" | "paid";
type MarketingCheckoutInterval = "monthly" | null;

const MARKETING_PERSISTENCE_TIMEOUT_MS = 250;

export async function recordMarketingCheckoutStarted(input: {
  admin: AdminClient;
  checkoutAttemptId: string;
  packageKey: ProductPackageKey | null;
  interval: MarketingCheckoutInterval;
  checkoutMode: MarketingCheckoutMode;
}): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      input.admin.from("marketing_events").insert({
        event_name: "checkout_started",
        destination: "stripe_checkout",
        package_key: input.packageKey,
        interval: input.interval,
        checkout_mode: input.checkoutMode,
        checkout_attempt_id: input.checkoutAttemptId,
      }),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(
          () => resolve(null),
          MARKETING_PERSISTENCE_TIMEOUT_MS,
        );
      }),
    ]);

    if (result === null) {
      console.error("marketing_checkout_started_persistence_timed_out");
      return;
    }

    const { error } = result;
    if (!error || error.code === "23505") return;

    console.error("marketing_checkout_started_persistence_failed", {
      code: error.code ?? "unknown",
    });
  } catch (error) {
    console.error("marketing_checkout_started_persistence_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

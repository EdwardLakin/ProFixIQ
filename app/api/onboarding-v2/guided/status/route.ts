import { NextResponse } from "next/server";

import {
  GUIDED_ONBOARDING_STEPS,
  getGuidedOnboardingStepStatus,
  type GuidedOnboardingStepKey,
  type GuidedOnboardingStepStatus,
} from "@/features/onboarding-v2/guided/steps";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

type StepStatusPayload = {
  stepKey: GuidedOnboardingStepKey;
  status: GuidedOnboardingStepStatus;
  detail: string;
};

type QueryWithShopFilter = {
  eq: (column: string, value: string) => QueryWithShopFilter;
};

function withShop<T extends QueryWithShopFilter>(query: T, shopId: string): T {
  return query.eq("shop_id", shopId) as T;
}

export async function GET() {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile?.shop_id) {
    return NextResponse.json({ shopId: null, steps: [] satisfies StepStatusPayload[] });
  }

  const shopId = profile.shop_id;
  const steps = await Promise.all(
    GUIDED_ONBOARDING_STEPS.map(async (step): Promise<StepStatusPayload> => {
      if (step.dataSource.kind === "shop_settings") {
        const { data: shop } = await supabase
          .from("shops")
          .select(step.dataSource.fields.join(","))
          .eq("id", shopId)
          .maybeSingle();
        const readyCount = step.dataSource.fields.filter((field) => {
          const value = shop?.[field as keyof typeof shop];
          return typeof value === "number" && Number.isFinite(value) && value > 0;
        }).length;
        return {
          stepKey: step.stepKey,
          status: readyCount === step.dataSource.fields.length ? "complete" : readyCount > 0 ? "in_progress" : "not_started",
          detail: `${readyCount}/${step.dataSource.fields.length} defaults set`,
        };
      }

      if (step.dataSource.kind !== "table_count") {
        return { stepKey: step.stepKey, status: "unknown", detail: step.dataSource.label };
      }

      const query = supabase.from(step.dataSource.table).select("id", { count: "exact", head: true });
      const { count, error } = await withShop(query, shopId);
      const nextCount = error ? null : count ?? 0;
      return {
        stepKey: step.stepKey,
        status: getGuidedOnboardingStepStatus(nextCount, step.dataSource.completeAt),
        detail: nextCount == null ? `Could not verify ${step.dataSource.label}` : `${nextCount.toLocaleString()} ${step.dataSource.label}`,
      };
    }),
  );

  return NextResponse.json({ shopId, role: profile.role ?? null, steps });
}

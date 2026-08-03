import "server-only";

import type { Database } from "@shared/types/types/supabase";
import { shopLocalDateTimeToUtc } from "@/features/shared/lib/utils/shopDayWindow";

type SupabaseLike = {
  from: (table: "shops") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => PromiseLike<{
          data: Pick<
            Database["public"]["Tables"]["shops"]["Row"],
            "timezone"
          > | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

export async function resolveEstimateExpiry(input: {
  supabase: SupabaseLike;
  shopId: string;
  expiresOn?: string | null;
  expiresAt?: string | null;
}): Promise<string | null> {
  if (!input.expiresOn) return input.expiresAt ?? null;

  const { data, error } = await input.supabase
    .from("shops")
    .select("timezone")
    .eq("id", input.shopId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return shopLocalDateTimeToUtc(input.expiresOn, "23:59:59", data?.timezone);
}

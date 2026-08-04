import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260804052000_narrow_profile_user_count_trigger.sql";

function migrationSource() {
  return readFileSync(migrationPath, "utf8");
}

describe("profile user count trigger scope", () => {
  it("recalculates counts only when shop membership can change", () => {
    const migration = migrationSource();

    expect(migration).toContain(
      "after insert or delete or update of shop_id on public.profiles",
    );
    expect(migration).not.toContain(
      "after insert or delete or update on public.profiles",
    );
  });

  it("retains the canonical count recalculation function", () => {
    const migration = migrationSource();

    expect(migration).toContain(
      "execute function public.tg_profiles_recalc_shop_user_count()",
    );
  });
});

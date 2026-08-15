import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const handoffSource = readFileSync(
  "app/onboarding/shop-boost/page.tsx",
  "utf8",
);

describe("Shop Boost onboarding handoff context", () => {
  it("uses the forwarded URL activation context as the authoritative handoff", () => {
    expect(handoffSource).toContain('useSearchParams');
    expect(handoffSource).toContain('parseActivationContextFromSearchParams');
    expect(handoffSource).toContain(
      'const context = parseActivationContextFromSearchParams(searchParams)',
    );
    expect(handoffSource).not.toContain('readPersistedActivationContext');
    expect(handoffSource).toContain('demoId: context.demoId');
    expect(handoffSource).toContain('intakeId: context.intakeId');
  });
});

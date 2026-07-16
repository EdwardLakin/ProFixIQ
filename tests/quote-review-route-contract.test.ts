import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const middleware = readFileSync("middleware.ts", "utf8");
const quotePage = readFileSync("app/quote-review/[id]/page.tsx", "utf8");

describe("work-order quote review route", () => {
  it("uses the shared authenticated middleware boundary", () => {
    expect(middleware).toContain('"/quote-review/:path*"');
    expect(middleware).not.toContain(
      'pathname.startsWith("/work-orders/quote-review")',
    );
  });

  it("does not start a second page-level authentication redirect", () => {
    expect(quotePage).toContain('export const dynamic = "force-dynamic"');
    expect(quotePage).toContain("<QuoteReviewView workOrderId={id} />");
    expect(quotePage).not.toContain("auth.getUser()");
    expect(quotePage).not.toContain("redirect(");
  });
});

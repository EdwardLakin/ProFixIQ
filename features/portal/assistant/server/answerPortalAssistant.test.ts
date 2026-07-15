import { describe, expect, it } from "vitest";

import { portalRequestedDate, portalServiceTerms } from "./answerPortalAssistant";

describe("portal assistant request parsing", () => {
  it("carries an exact requested appointment date into review", () => {
    expect(portalRequestedDate("Book me for 2026-08-12")).toBe("2026-08-12");
  });

  it("extracts meaningful service terms without generic history words", () => {
    expect(portalServiceTerms("When was the last time my oil filter service was completed?"))
      .toEqual(["oil", "filter"]);
  });
});

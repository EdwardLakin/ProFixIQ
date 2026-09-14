import { describe, expect, it } from "vitest";

import {
  getProFixOperationsIdentity,
  parseProFixOperationsExperience,
  resolveProFixOperationsExperience,
  withProFixOperationsExperience,
} from "@/features/assistant/lib/proFixOperationsIdentity";

describe("ProFix Operations identity", () => {
  it.each(["owner", "admin", "manager"])(
    "uses the management experience for %s",
    (role) => {
      expect(resolveProFixOperationsExperience(role)).toBe("management");
    },
  );

  it.each(["advisor", "service", "parts", "lead_hand", "foreman"])(
    "uses the operations experience for %s",
    (role) => {
      expect(resolveProFixOperationsExperience(role)).toBe("operations");
    },
  );

  it("keeps one product identity across role-specific experiences", () => {
    expect(getProFixOperationsIdentity("operations").name).toBe(
      "ProFix Operations",
    );
    expect(getProFixOperationsIdentity("management").name).toBe(
      "ProFix Operations",
    );
    expect(getProFixOperationsIdentity("management").eyebrow).toBe(
      "Management view",
    );
  });

  it("preserves existing context while adding the role experience", () => {
    expect(
      withProFixOperationsExperience(
        "/assistant?workOrderId=wo-1&pageType=work_order",
        "management",
      ),
    ).toBe(
      "/assistant?workOrderId=wo-1&pageType=work_order&experience=management",
    );
  });

  it("treats unknown URL values as the operations experience", () => {
    expect(parseProFixOperationsExperience("unexpected")).toBe("operations");
    expect(parseProFixOperationsExperience("management")).toBe("management");
  });
});

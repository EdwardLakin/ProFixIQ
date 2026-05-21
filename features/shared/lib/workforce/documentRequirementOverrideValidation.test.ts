import { describe, expect, it } from "vitest";
import { isActiveOverrideConflict, validateDocumentRequirementPayload } from "./documentRequirementOverrideValidation";

describe("document requirement override validation", () => {
  it("rejects invalid doc_type", () => {
    expect(() => validateDocumentRequirementPayload({ doc_type: "bad", label: "x" }, "create")).toThrow("doc_type is invalid");
  });

  it("rejects invalid statuses", () => {
    expect(() =>
      validateDocumentRequirementPayload({ doc_type: "other", label: "x", accept_statuses: ["bad"] }, "create")
    ).toThrow("accept_statuses contains invalid value");
  });

  it("rejects missing label", () => {
    expect(() => validateDocumentRequirementPayload({ doc_type: "other" }, "create")).toThrow("label is required");
  });

  it("rejects client shop_id", () => {
    expect(() => validateDocumentRequirementPayload({ doc_type: "other", label: "x", shop_id: "a" }, "create")).toThrow(
      "shop_id is not allowed"
    );
  });

  it("allows patch disable", () => {
    const parsed = validateDocumentRequirementPayload({ is_active: false }, "patch");
    expect(parsed).toEqual({ is_active: false });
  });

  it("detects unique conflict", () => {
    expect(
      isActiveOverrideConflict({ code: "23505", message: "duplicate key value violates unique constraint workforce_document_requirements_active" })
    ).toBe(true);
  });
});

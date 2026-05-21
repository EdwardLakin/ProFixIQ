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

  it("rejects create is_required string", () => {
    expect(() =>
      validateDocumentRequirementPayload({ doc_type: "other", label: "x", is_required: "false" }, "create")
    ).toThrow("is_required must be a boolean");
  });

  it("rejects create expires_required string", () => {
    expect(() =>
      validateDocumentRequirementPayload({ doc_type: "other", label: "x", expires_required: "true" }, "create")
    ).toThrow("expires_required must be a boolean");
  });

  it("rejects create is_active number", () => {
    expect(() => validateDocumentRequirementPayload({ doc_type: "other", label: "x", is_active: 1 }, "create")).toThrow(
      "is_active must be a boolean"
    );
  });

  it("rejects patch is_active string", () => {
    expect(() => validateDocumentRequirementPayload({ is_active: "false" }, "patch")).toThrow("is_active must be a boolean");
  });

  it("accepts patch is_required false", () => {
    const parsed = validateDocumentRequirementPayload({ is_required: false }, "patch");
    expect(parsed).toEqual({ is_required: false });
  });

  it("accepts patch expires_required false", () => {
    const parsed = validateDocumentRequirementPayload({ expires_required: false }, "patch");
    expect(parsed).toEqual({ expires_required: false });
  });

  it("applies create defaults using DB column keys", () => {
    const parsed = validateDocumentRequirementPayload({ doc_type: "other", label: "x" }, "create") as Record<string, unknown>;
    expect(parsed.is_required).toBe(true);
    expect(parsed.expires_warning_days).toBe(30);
    expect(parsed).not.toHaveProperty("required");
    expect(parsed).not.toHaveProperty("warning_days");
  });

  it("accepts patch expires_warning_days", () => {
    const parsed = validateDocumentRequirementPayload({ expires_warning_days: 14 }, "patch");
    expect(parsed).toEqual({ expires_warning_days: 14 });
  });

  it("detects unique conflict", () => {
    expect(
      isActiveOverrideConflict({ code: "23505", message: "duplicate key value violates unique constraint workforce_document_requirements_active" })
    ).toBe(true);
  });
});

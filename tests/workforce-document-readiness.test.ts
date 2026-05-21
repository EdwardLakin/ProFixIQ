import { describe, expect, it } from "vitest";
import { buildDocumentRequirementsReadiness } from "@/features/shared/lib/workforce/documentReadiness";

const makePerson = (overrides?: Partial<{ id: string; full_name: string; workforce_role: string | null; workforce_category: string | null; employment_status: string }>) => ({
  id: "1",
  full_name: "Worker",
  workforce_role: null,
  workforce_category: "driver",
  employment_status: "active",
  ...overrides,
});

const makeDocuments = (status: string, expiresAt: string | null) => [
  { id: "tax", user_id: "1", doc_type: "tax_form", status: "accepted", expires_at: null, uploaded_at: "2024-01-01" },
  { id: "license", user_id: "1", doc_type: "drivers_license", status, expires_at: expiresAt, uploaded_at: "2024-01-01" },
];

describe("buildDocumentRequirementsReadiness", () => {
  it("marks active employee missing required doc", () => {
    const result = buildDocumentRequirementsReadiness({
      people: [{ id: "1", full_name: "Tech", workforce_role: "technician", workforce_category: null, employment_status: "active" }],
      documents: [],
    });
    expect(result.readinessItems[0].readiness).toBe("missing_required");
  });

  it("ignores inactive employee", () => {
    const result = buildDocumentRequirementsReadiness({
      people: [{ id: "1", full_name: "Old", workforce_role: "technician", workforce_category: null, employment_status: "inactive" }],
      documents: [],
    });
    expect(result.summary.activePeople).toBe(0);
  });

  it("marks expired required documents", () => {
    const result = buildDocumentRequirementsReadiness({
      people: [{ id: "1", full_name: "Driver", workforce_role: null, workforce_category: "driver", employment_status: "active" }],
      documents: [
        { id: "d0", user_id: "1", doc_type: "tax_form", status: "accepted", expires_at: null, uploaded_at: "2019-01-01" },
        { id: "d1", user_id: "1", doc_type: "drivers_license", status: "accepted", expires_at: "2020-01-01", uploaded_at: "2019-01-01" },
      ],
    });
    expect(result.readinessItems[0].readiness).toBe("expired_required");
  });

  it("keeps accepted older doc valid even when newer pending exists", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString();
    const result = buildDocumentRequirementsReadiness({
      people: [{ id: "1", full_name: "Driver", workforce_role: null, workforce_category: "driver", employment_status: "active" }],
      documents: [
        { id: "d0", user_id: "1", doc_type: "tax_form", status: "accepted", expires_at: null, uploaded_at: "2024-01-01" },
        { id: "d1", user_id: "1", doc_type: "drivers_license", status: "accepted", expires_at: future, uploaded_at: "2024-01-01" },
        { id: "d2", user_id: "1", doc_type: "drivers_license", status: "pending", expires_at: future, uploaded_at: "2025-01-01" },
      ],
    });
    expect(result.readinessItems[0].readiness).toBe("ready");
  });

  it("matches role and category requirements", () => {
    const result = buildDocumentRequirementsReadiness({
      people: [{ id: "1", full_name: "Office", workforce_role: null, workforce_category: "office", employment_status: "active" }],
      documents: [],
    });
    expect(result.readinessItems[0].missingDocTypes).toContain("tax_form");
  });

  it.each(["active", "approved", "accepted"])("treats accepted status '%s' as satisfying required documents", (status) => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString();
    const result = buildDocumentRequirementsReadiness({
      people: [makePerson()],
      documents: makeDocuments(status, future),
    });

    expect(result.readinessItems[0].readiness).toBe("ready");
  });

  it.each(["received", "pending", "review", "needs_review"])("treats review status '%s' as needs_review when no accepted doc exists", (status) => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString();
    const result = buildDocumentRequirementsReadiness({
      people: [makePerson()],
      documents: [
        { id: "tax", user_id: "1", doc_type: "tax_form", status: "accepted", expires_at: null, uploaded_at: "2024-01-01" },
        { id: "license", user_id: "1", doc_type: "drivers_license", status, expires_at: future, uploaded_at: "2024-01-01" },
      ],
    });

    expect(result.readinessItems[0].readiness).toBe("needs_review");
  });

  it("marks accepted doc expiring within warning window as expiring_soon", () => {
    const tenDays = new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString();
    const result = buildDocumentRequirementsReadiness({
      people: [makePerson()],
      documents: makeDocuments("accepted", tenDays),
      warningDays: 30,
    });

    expect(result.readinessItems[0].readiness).toBe("expiring_soon");
  });

  it("marks accepted doc outside warning window as ready", () => {
    const sixtyDays = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString();
    const result = buildDocumentRequirementsReadiness({
      people: [makePerson()],
      documents: makeDocuments("accepted", sixtyDays),
      warningDays: 30,
    });

    expect(result.readinessItems[0].readiness).toBe("ready");
  });

  it("prioritizes missing_required over needs_review", () => {
    const result = buildDocumentRequirementsReadiness({
      people: [makePerson({ workforce_category: "technician" })],
      documents: [{ id: "cert", user_id: "1", doc_type: "certification", status: "pending", expires_at: null, uploaded_at: "2024-01-01" }],
    });

    expect(result.readinessItems[0].readiness).toBe("missing_required");
  });

  it("prioritizes missing_required over expired_required", () => {
    const result = buildDocumentRequirementsReadiness({
      people: [makePerson({ workforce_category: "driver" })],
      documents: [
        { id: "license", user_id: "1", doc_type: "drivers_license", status: "accepted", expires_at: "2020-01-01", uploaded_at: "2019-01-01" },
      ],
    });

    expect(result.readinessItems[0].readiness).toBe("missing_required");
  });

  it("prioritizes expired_required over needs_review", () => {
    const result = buildDocumentRequirementsReadiness({
      people: [makePerson()],
      documents: [
        { id: "tax", user_id: "1", doc_type: "tax_form", status: "accepted", expires_at: null, uploaded_at: "2024-01-01" },
        { id: "license", user_id: "1", doc_type: "drivers_license", status: "accepted", expires_at: "2020-01-01", uploaded_at: "2019-01-01" },
        { id: "license-review", user_id: "1", doc_type: "drivers_license", status: "pending", expires_at: null, uploaded_at: "2024-01-01" },
      ],
    });

    expect(result.readinessItems[0].readiness).toBe("expired_required");
  });

  it("prioritizes needs_review over expiring_soon", () => {
    const result = buildDocumentRequirementsReadiness({
      people: [makePerson({ workforce_category: "technician" })],
      documents: [
        { id: "cert", user_id: "1", doc_type: "certification", status: "pending", expires_at: null, uploaded_at: "2024-01-01" },
        {
          id: "tax",
          user_id: "1",
          doc_type: "tax_form",
          status: "accepted",
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString(),
          uploaded_at: "2024-01-01",
        },
      ],
      requirements: [
        { key: "custom:certification", docType: "certification", label: "Certification", workforceCategory: "technician", workforceRole: null, required: true, expiresRequired: false, warningDays: 30 },
        { key: "custom:tax_form", docType: "tax_form", label: "Tax Form", workforceCategory: "technician", workforceRole: null, required: true, expiresRequired: true, warningDays: 30 },
      ],
      warningDays: 30,
    });

    expect(result.readinessItems[0].readiness).toBe("needs_review");
  });
});

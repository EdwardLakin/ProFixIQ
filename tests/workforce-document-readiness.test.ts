import { describe, expect, it } from "vitest";
import { buildDocumentRequirementsReadiness } from "@/features/shared/lib/workforce/documentReadiness";

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
});

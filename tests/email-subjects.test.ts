import { describe, expect, it } from "vitest";
import { normalizeEmailSubject, resolveEmailSubject } from "../features/email/server/emailSubjects";
import { toolEmailInvoice } from "../features/agent/tools/emailInvoice";
import { customerPortalInviteAccessStatus } from "../features/portal/lib/customerPortalInviteDelivery";

describe("resolveEmailSubject", () => {
  it("preserves explicit subjects after removing header-breaking whitespace", () => {
    expect(
      resolveEmailSubject("quote_ready", {}, " Estimate ready\r\nBcc:someone@example.com "),
    ).toBe("Estimate ready Bcc:someone@example.com");
  });

  it("provides a subject for every dynamic email template", () => {
    expect(resolveEmailSubject("portal_invite", { shop_name: "North Shop" })).toBe(
      "Your North Shop customer portal invitation",
    );
    expect(
      resolveEmailSubject("portal_invite", {
        portal_type: "fleet",
        fleet_name: "Road Crew",
      }),
    ).toBe("Your Road Crew Fleet invitation");
    expect(resolveEmailSubject("quote_ready", { shop_name: "North Shop" })).toBe(
      "Your estimate from North Shop is ready",
    );
    expect(resolveEmailSubject("invoice_ready", {})).toBe(
      "Your invoice from ProFixIQ is ready",
    );
    expect(resolveEmailSubject("user_invite", { shop_name: "North Shop" })).toBe(
      "You're invited to join North Shop on ProFixIQ",
    );
  });

  it("caps subject length and uses a fallback when the provided value is blank", () => {
    expect(resolveEmailSubject("invoice_ready", {}, " ".repeat(500))).toBe(
      "Your invoice from ProFixIQ is ready",
    );
    expect(resolveEmailSubject("invoice_ready", {}, "x".repeat(300))).toHaveLength(255);
  });
});

describe("customer portal invite delivery state", () => {
  it("keeps failed and suppressed delivery out of pending state after reload", () => {
    expect(customerPortalInviteAccessStatus("suppressed")).toBe("not_delivered");
    expect(customerPortalInviteAccessStatus("failed")).toBe("delivery_issue");
    expect(customerPortalInviteAccessStatus(null)).toBe("delivery_unknown");
    expect(customerPortalInviteAccessStatus("queued")).toBe("sending");
  });
});

describe("AI invoice subject normalization", () => {
  it("uses the fallback for whitespace-only invoice subjects", () => {
    const parsed = toolEmailInvoice.inputSchema.parse({
      toEmail: "customer@example.com",
      subject: "   ",
      html: "<p>Invoice</p>",
    });

    expect(parsed.subject).toBe("Invoice from ProFixIQ");
    expect(normalizeEmailSubject("   ")).toBeNull();
  });
});

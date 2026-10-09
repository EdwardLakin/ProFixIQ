import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatUsd,
  quoteReadyContent,
} from "@/features/email/server/emailEvents";

describe("quote ready email", () => {
  it("formats float-drifted totals as currency", () => {
    expect(formatUsd(1691.6400000000003)).toBe("$1,691.64");
    expect(formatUsd("1691.6400000000003")).toBe("$1,691.64");
    // Same rendering as the portal's Intl.NumberFormat for half-cent totals.
    expect(formatUsd(4.515)).toBe(
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(4.515),
    );
    expect(formatUsd(null)).toBe("");
    expect(formatUsd("not a number")).toBe("");
  });

  it("builds a subject, plain text, and explicit-color html", () => {
    const content = quoteReadyContent({
      quoteUrl: "https://app.example.com/portal/quotes/abc",
      totalLabel: "$1,691.64",
      vehicleLabel: "2021 Ford F350",
      shopName: "Pro Fix",
      year: 2026,
    });

    expect(content.subject).toBe(
      "Your estimate for your 2021 Ford F350 is ready – $1,691.64",
    );
    expect(content.text).toContain("Estimate total: $1,691.64");
    expect(content.text).toContain("https://app.example.com/portal/quotes/abc");
    expect(content.html).toContain("$1,691.64");
    expect(content.html).not.toContain("1691.64000");
    expect(content.html).not.toContain("gradient");
  });

  it("escapes untrusted values and ignores non-https logos", () => {
    const content = quoteReadyContent({
      quoteUrl: "https://app.example.com/q?a=1&b=2",
      totalLabel: "",
      vehicleLabel: "<script>alert(1)</script>",
      shopName: "A & B",
      brandLogoUrl: "javascript:alert(1)",
    });

    expect(content.html).not.toContain("<script>");
    expect(content.html).not.toContain("javascript:");
    expect(content.html).toContain("a=1&amp;b=2");
    expect(content.html).not.toContain("Estimate total");
  });
});

describe("sendDynamicTemplateEmail sender and template scoping", () => {
  const src = readFileSync(
    "features/email/server/sendDynamicTemplateEmail.ts",
    "utf8",
  );

  it("does not read SENDGRID_FROM_NAME in the shared helper", () => {
    expect(src).not.toContain("SENDGRID_FROM_NAME");
    expect(src).toContain("input.fromName");
  });

  it("resolves and logs a template id only for the template path", () => {
    expect(src).toContain(
      "const templateId = input.content ? null : getTemplateId(input.templateKey);",
    );
  });

  it("passes the resolved subject to dynamic template variables", () => {
    expect(src).toContain("const templateData = {");
    expect(src).toContain("dynamicTemplateData: templateData,");
  });

  it("does not report accepted until the delivery state is durable", () => {
    expect(src).toContain('.is("last_event_at", null)');
    expect(src).toContain("if (updateError) {");
    expect(src).toContain("delivery state could not be persisted");
    expect(src).toContain("providerLog?.last_event_type");
  });
});

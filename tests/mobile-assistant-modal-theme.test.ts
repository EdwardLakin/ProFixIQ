import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modal = readFileSync(
  "features/work-orders/components/workorders/AiAssistantModal.tsx",
  "utf8",
);
const assistant = readFileSync(
  "features/mobile/technician/MobileTechnicianAssistant.tsx",
  "utf8",
);

describe("mobile Ask ProFixIQ modal theming", () => {
  it("uses the brand accent bar like ModalShell, not the legacy copper rgba", () => {
    expect(modal).not.toContain("184,115,51");
    expect(modal).toContain("var(--brand-primary),var(--brand-accent)");
  });

  it("keeps assistant text and surfaces on theme tokens in both themes", () => {
    // The attachment wash sits inside the always-blue user bubble, so it must
    // stay a dark translucent wash (a light-mode inset token would wash out the
    // white filename).
    expect(assistant).toContain("rounded-lg bg-black/15 p-1");
    expect(assistant).not.toMatch(/\bbg-red-950\b/);
    expect(assistant).not.toMatch(/(?<![\w:-])text-(?:white|red-100|red-300)\b/);
    expect(assistant).toContain("text-[color:var(--theme-text-on-accent)]");
  });
});

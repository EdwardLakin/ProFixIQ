import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customerPage = readFileSync(
  "features/customers/app/customers/[id]/page.tsx",
  "utf8",
);
const modalShell = readFileSync(
  "features/shared/components/ModalShell.tsx",
  "utf8",
);

describe("customer creation modal shell", () => {
  it("uses the canonical shared shell for customer creation", () => {
    expect(customerPage).toContain(
      'import ModalShell from "@/features/shared/components/ModalShell"',
    );
    expect(customerPage).toMatch(
      /<ModalShell\s+title="Create customer"\s+isOpen={createCustomerOpen}/,
    );
    expect(customerPage).toContain(
      'submitText={creatingCustomer ? "Creating…" : "Create customer"}',
    );
    expect(customerPage).toContain("busy={creatingCustomer}");
    expect(customerPage).not.toMatch(
      /<Modal\s+title="Create customer"\s+open={createCustomerOpen}/,
    );
  });

  it("prevents dismissal and duplicate submission while the shell is busy", () => {
    expect(modalShell).toContain("if (!busy) onClose()");
    expect(modalShell).toContain("aria-busy={busy}");
    expect(modalShell).toContain("disabled={busy}");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app shell PWA update button", () => {
  const shell = readFileSync(
    "features/shared/components/AppShell.tsx",
    "utf8",
  );

  it("listens to the PWA runtime status and requests a status snapshot", () => {
    expect(shell).toContain('"profixiq:pwa-runtime-status"');
    expect(shell).toContain('"profixiq:pwa-runtime-status-request"');
  });

  it("only renders the navbar update button when an update is ready", () => {
    expect(shell).toContain("{pwaUpdate.ready ? (");
    expect(shell).toContain('new Event("profixiq:pwa-update-request")');
  });

  it("blocks the update while offline changes are pending or activating", () => {
    expect(shell).toContain("pwaUpdate.activating || pwaUpdate.pending > 0");
    expect(shell).toContain('"Sync first"');
  });
});

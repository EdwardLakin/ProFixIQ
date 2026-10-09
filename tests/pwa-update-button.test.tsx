import React from "react";
import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PwaUpdateButton from "@/features/shared/components/pwa/PwaUpdateButton";

function emitStatus(detail: Record<string, unknown>) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent("profixiq:pwa-runtime-status", { detail }),
    );
  });
}

describe("PwaUpdateButton", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requests a status snapshot on mount and renders nothing without an update", () => {
    const requested = vi.fn();
    window.addEventListener("profixiq:pwa-runtime-status-request", requested);
    const { container } = render(<PwaUpdateButton />);

    expect(requested).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();

    emitStatus({ updateReady: false, activatingUpdate: false, pending: 0 });
    expect(container).toBeEmptyDOMElement();
    window.removeEventListener(
      "profixiq:pwa-runtime-status-request",
      requested,
    );
  });

  it("shows an enabled Update button that requests activation when an update is ready", () => {
    const updateRequested = vi.fn();
    window.addEventListener("profixiq:pwa-update-request", updateRequested);
    render(<PwaUpdateButton />);

    emitStatus({ updateReady: true, activatingUpdate: false, pending: 0 });
    const button = screen.getByRole("button", { name: "Update" });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(updateRequested).toHaveBeenCalledTimes(1);
    window.removeEventListener("profixiq:pwa-update-request", updateRequested);
  });

  it("is disabled and does not request activation while offline changes are pending", () => {
    const updateRequested = vi.fn();
    window.addEventListener("profixiq:pwa-update-request", updateRequested);
    render(<PwaUpdateButton />);

    emitStatus({ updateReady: true, activatingUpdate: false, pending: 2 });
    const button = screen.getByRole("button", { name: "Sync first" });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(updateRequested).not.toHaveBeenCalled();
    window.removeEventListener("profixiq:pwa-update-request", updateRequested);
  });

  it("is disabled while the update is activating, and disappears once cleared", () => {
    render(<PwaUpdateButton />);

    emitStatus({ updateReady: true, activatingUpdate: true, pending: 0 });
    expect(screen.getByRole("button", { name: "Updating…" })).toBeDisabled();

    emitStatus({ updateReady: false, activatingUpdate: false, pending: 0 });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is mounted in the AppShell navbar", () => {
    const shell = readFileSync(
      "features/shared/components/AppShell.tsx",
      "utf8",
    );
    expect(shell).toContain("<PwaUpdateButton />");
  });
});

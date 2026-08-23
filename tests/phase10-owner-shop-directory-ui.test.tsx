import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminShopsClient from "@/features/dashboard/app/dashboard/admin/ShopsClient";
import type { OwnerShopDirectoryRow } from "@/features/dashboard/lib/ownerShopDirectory";

const directoryRow: OwnerShopDirectoryRow = {
  id: "shop-prairie",
  name: "Prairie Fleet & Diesel Demo",
  city: "Calgary",
  province: "AB",
  email: "prairie@example.test",
  phone: "403-555-0100",
  timezone: "America/Edmonton",
  ownerId: "owner-prairie",
  ownerName: null,
  ownerEmail: null,
  ownerSummaryAvailable: false,
  plan: { label: "Complete Operations", source: "subscription_package" },
  health: "Unavailable",
  profileHealthAvailable: false,
  profileUpdatedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Phase 10 owner shop directory UI", () => {
  it("keeps the primary directory visible when optional summaries fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            shops: [directoryRow],
            secondary: {
              profileHealth: "unavailable",
              ownerSummary: "unavailable",
            },
            warnings: [
              "Profile health is temporarily unavailable.",
              "Owner summaries are temporarily unavailable.",
            ],
            requestId: "phase-10-success-ref",
            loadedAt: "2026-08-23T06:00:00.000Z",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Request-Id": "phase-10-success-ref",
            },
          },
        ),
      ),
    );

    render(<AdminShopsClient />);

    expect(
      await screen.findByText("Prairie Fleet & Diesel Demo"),
    ).toBeVisible();
    expect(screen.getByText("Complete Operations")).toBeVisible();
    expect(
      screen.getByText(/Profile health is temporarily unavailable/),
    ).toBeVisible();
    expect(screen.getAllByText(/phase-10-success-ref/).length).toBeGreaterThan(
      0,
    );
  });

  it("shows the server request reference with a retryable primary failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "The shop directory could not be loaded.",
            requestId: "phase-10-error-ref",
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "X-Request-Id": "phase-10-error-ref",
            },
          },
        ),
      ),
    );

    render(<AdminShopsClient />);

    expect(await screen.findByText("Shop directory unavailable")).toBeVisible();
    expect(screen.getAllByText(/phase-10-error-ref/).length).toBeGreaterThan(0);
    expect(
      screen.queryByText("No shops are configured"),
    ).not.toBeInTheDocument();
  });
});

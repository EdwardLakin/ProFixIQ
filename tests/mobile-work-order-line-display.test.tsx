import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { JobCard } from "@/features/work-orders/components/JobCard";
import { resolveMobileLineDisplayNumbers } from "@/features/work-orders/mobile/mobileLineDisplay";

describe("Shop Mobile repair-line display numbers", () => {
  it("assigns stable, collision-free numbers to legacy unnumbered lines", () => {
    const lines = [
      { id: "canonical", line_no: 2, created_at: "2026-08-21T18:02:00Z" },
      { id: "legacy-newer", line_no: null, created_at: "2026-08-21T18:01:00Z" },
      { id: "legacy-older", line_no: null, created_at: "2026-08-21T18:00:00Z" },
    ];

    expect(resolveMobileLineDisplayNumbers(lines)).toEqual({
      canonical: 2,
      "legacy-older": 3,
      "legacy-newer": 4,
    });
    expect(resolveMobileLineDisplayNumbers([...lines].reverse())).toEqual({
      canonical: 2,
      "legacy-older": 3,
      "legacy-newer": 4,
    });
  });

  it("uses the supplied stable number in the real card badge and accessible name", () => {
    render(
      <JobCard
        index={0}
        displayNumber={7}
        line={
          {
            id: "line-7",
            description: "Front brake pads",
            status: "awaiting",
            approval_state: "approved",
          } as never
        }
        parts={[]}
        technicians={[]}
        canAssign={false}
        isPunchedIn={false}
        onOpen={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Open job 7: Front brake pads" }),
    ).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});

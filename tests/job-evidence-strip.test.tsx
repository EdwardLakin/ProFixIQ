import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import JobEvidenceStrip, {
  nextEvidenceIndex,
} from "@/features/work-orders/components/evidence/JobEvidenceStrip";
import type { WorkOrderEvidenceItem } from "@/features/work-orders/lib/evidence/workOrderEvidence";

function evidence(
  id: string,
  fileName: string,
  kind: "photo" | "video" = "photo",
): WorkOrderEvidenceItem {
  return {
    id,
    workOrderId: "work-order-1",
    workOrderLineId: "line-1",
    quoteLineId: null,
    kind,
    source: "inspection",
    visibility: "customer",
    fileName,
    contentType: kind === "video" ? "video/mp4" : "image/jpeg",
    fileSize: 100,
    createdAt: "2026-07-30T12:00:00.000Z",
    displayUrl:
      kind === "video"
        ? "https://example.test/evidence.mp4"
        : `https://example.test/${id}.jpg`,
    annotation: null,
  };
}

const items = [
  evidence("one", "Front brake.jpg"),
  evidence("two", "Rear brake.jpg"),
  evidence("three", "Road test.mp4", "video"),
  evidence("four", "Tire.jpg"),
];

describe("job evidence strip", () => {
  it("wraps previous and next navigation", () => {
    expect(nextEvidenceIndex(0, 4, -1)).toBe(3);
    expect(nextEvidenceIndex(3, 4, 1)).toBe(0);
    expect(nextEvidenceIndex(0, 0, 1)).toBe(0);
  });

  it("opens a medium preview without activating the parent job card", async () => {
    const user = userEvent.setup();
    const parentClick = vi.fn();

    render(
      <div onClick={parentClick}>
        <JobEvidenceStrip evidence={items} />
      </div>,
    );

    await user.click(
      screen.getByRole("button", { name: "Open Front brake.jpg" }),
    );

    expect(parentClick).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveStyle({ width: "min(92vw, 48rem)" });
    expect(dialog).toHaveStyle({ maxWidth: "48rem" });
    expect(
      screen.getByRole("heading", { name: "Front brake.jpg" }),
    ).toBeInTheDocument();
  });

  it("navigates through photos and video evidence", async () => {
    const user = userEvent.setup();
    render(<JobEvidenceStrip evidence={items} />);

    await user.click(
      screen.getByRole("button", { name: "Open Front brake.jpg" }),
    );
    await user.click(screen.getByRole("button", { name: "Next evidence" }));
    expect(
      screen.getByRole("heading", { name: "Rear brake.jpg" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next evidence" }));
    expect(
      screen.getByRole("heading", { name: "Road test.mp4" }),
    ).toBeInTheDocument();
    expect(document.querySelector("video[controls]")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous evidence" }));
    expect(
      screen.getByRole("heading", { name: "Rear brake.jpg" }),
    ).toBeInTheDocument();
  });

  it("opens hidden evidence from the overflow control and closes cleanly", async () => {
    const user = userEvent.setup();
    render(<JobEvidenceStrip evidence={items} />);

    await user.click(
      screen.getByRole("button", { name: "Open 1 more evidence item" }),
    );
    expect(
      screen.getByRole("heading", { name: "Tire.jpg" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Close evidence preview" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

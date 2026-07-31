import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

function mockMediaResponse(canEdit = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ items, canEdit }),
    })),
  );
}

describe("job evidence strip", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockMediaResponse();
  });

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

  it("offers markup only for authorized photo evidence", async () => {
    const user = userEvent.setup();
    render(<JobEvidenceStrip evidence={items} />);

    await user.click(
      screen.getByRole("button", { name: "Open Front brake.jpg" }),
    );
    expect(
      await screen.findByRole("button", { name: "Mark up" }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/work-orders/work-order-1/media?scope=line&lineId=line-1",
      { credentials: "include", cache: "no-store" },
    );

    await user.click(screen.getByRole("button", { name: "Next evidence" }));
    await user.click(screen.getByRole("button", { name: "Next evidence" }));
    expect(
      screen.getByRole("heading", { name: "Road test.mp4" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark up" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Video evidence is view-only")).toBeInTheDocument();
  });

  it("mounts markup as a viewport editor instead of clipping it inside the preview dialog", async () => {
    const user = userEvent.setup();
    render(<JobEvidenceStrip evidence={items} />);

    await user.click(
      screen.getByRole("button", { name: "Open Front brake.jpg" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Mark up" }),
    );

    expect(await screen.findByText("Mark up evidence")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save markup" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      await screen.findByRole("heading", { name: "Front brake.jpg" }),
    ).toBeInTheDocument();
  });

  it("keeps markup hidden for read-only viewers", async () => {
    mockMediaResponse(false);
    const user = userEvent.setup();
    render(<JobEvidenceStrip evidence={items} />);

    await user.click(
      screen.getByRole("button", { name: "Open Front brake.jpg" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "Mark up" }),
    ).not.toBeInTheDocument();
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

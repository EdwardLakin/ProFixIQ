import { describe, expect, it, vi } from "vitest";

import { handleTranscriptFn } from "@/features/inspections/lib/inspection/handleTranscript";
import type {
  InspectionItem,
  InspectionSession,
  ParsedCommandIndexed,
} from "@/features/inspections/lib/inspection/types";

function makeSession(item: Partial<InspectionItem> = {}): InspectionSession {
  return {
    currentSectionIndex: 0,
    currentItemIndex: 0,
    isListening: false,
    status: "in_progress",
    started: true,
    completed: false,
    isPaused: false,
    sections: [
      {
        title: "Steering",
        items: [{ item: "Tie rod ends", notes: "", ...item }],
      },
    ],
  };
}

async function run(command: ParsedCommandIndexed, session: InspectionSession) {
  const updateItem = vi.fn();
  const result = await handleTranscriptFn({
    command,
    session,
    updateInspection: vi.fn(),
    updateItem,
    updateSection: vi.fn(),
    finishSession: vi.fn(),
    rawSpeech: "tie rod ends",
  });
  return { result, updateItem };
}

describe("handleTranscriptFn: oneshot_item", () => {
  it("applies status, note, parts, and laborHours from one bundled command", async () => {
    const session = makeSession();
    const { result, updateItem } = await run(
      {
        command: "oneshot_item",
        item: "Tie rod ends",
        status: "fail",
        note: "left tie rod worn out",
        parts: [{ description: "Left tie rod end", qty: 1 }],
        laborHours: 1,
      },
      session,
    );

    expect(result.appliedTarget).toEqual({ sectionIndex: 0, itemIndex: 0 });
    expect(updateItem).toHaveBeenCalledWith(
      0,
      0,
      expect.objectContaining({
        status: "fail",
        notes: "left tie rod worn out",
        parts: [{ description: "Left tie rod end", qty: 1 }],
        laborHours: 1,
      }),
    );
  });
});

describe("handleTranscriptFn: add_part", () => {
  it("adds a new part when the item has none yet", async () => {
    const session = makeSession();
    const { updateItem } = await run(
      {
        command: "add_part",
        item: "Tie rod ends",
        partName: "Left tie rod end",
        quantity: 1,
      },
      session,
    );

    expect(updateItem).toHaveBeenCalledWith(
      0,
      0,
      expect.objectContaining({
        parts: [{ description: "Left tie rod end", qty: 1 }],
      }),
    );
  });

  it("accumulates quantity instead of duplicating an already-reported part", async () => {
    const session = makeSession({
      parts: [{ description: "Left tie rod end", qty: 1 }],
    });
    const { updateItem } = await run(
      {
        command: "add_part",
        item: "Tie rod ends",
        partName: "left tie rod end",
        quantity: 1,
      },
      session,
    );

    expect(updateItem).toHaveBeenCalledWith(
      0,
      0,
      expect.objectContaining({
        parts: [{ description: "Left tie rod end", qty: 2 }],
      }),
    );
  });

  it("defaults quantity to 1 when omitted or invalid", async () => {
    const session = makeSession();
    const { updateItem } = await run(
      { command: "add_part", item: "Tie rod ends", partName: "Boot" },
      session,
    );

    expect(updateItem).toHaveBeenCalledWith(
      0,
      0,
      expect.objectContaining({ parts: [{ description: "Boot", qty: 1 }] }),
    );
  });

  it("does nothing without a part name", async () => {
    const session = makeSession();
    const { result, updateItem } = await run(
      { command: "add_part", item: "Tie rod ends" },
      session,
    );

    expect(updateItem).not.toHaveBeenCalled();
    expect(result.appliedTarget).toBeNull();
  });
});

describe("handleTranscriptFn: add_labor", () => {
  it("adds to existing labor hours and keeps the technician's label as a note", async () => {
    const session = makeSession({ laborHours: 1 });
    const { updateItem } = await run(
      {
        command: "add_labor",
        item: "Tie rod ends",
        hours: 0.5,
        label: "R&R tie rod end",
      },
      session,
    );

    expect(updateItem).toHaveBeenCalledWith(
      0,
      0,
      expect.objectContaining({
        laborHours: 1.5,
        notes: "Labor: R&R tie rod end",
      }),
    );
  });

  it("starts from zero when the item has no labor hours yet", async () => {
    const session = makeSession();
    const { updateItem } = await run(
      { command: "add_labor", item: "Tie rod ends", hours: 1 },
      session,
    );

    expect(updateItem).toHaveBeenCalledWith(
      0,
      0,
      expect.objectContaining({ laborHours: 1 }),
    );
  });
});

describe("handleTranscriptFn: complete_item", () => {
  it("acknowledges an existing fail finding", async () => {
    const session = makeSession({ status: "fail" });
    const { updateItem } = await run(
      { command: "complete_item", item: "Tie rod ends" },
      session,
    );

    expect(updateItem).toHaveBeenCalledWith(
      0,
      0,
      expect.objectContaining({ findingReviewed: true }),
    );
  });

  it("never invents a status for an item with nothing recorded", async () => {
    const session = makeSession();
    const { result, updateItem } = await run(
      { command: "complete_item", item: "Tie rod ends" },
      session,
    );

    expect(updateItem).not.toHaveBeenCalled();
    expect(result.appliedTarget).toBeNull();
  });
});

describe("handleTranscriptFn: skip_item", () => {
  it("marks an unset item not applicable", async () => {
    const session = makeSession();
    const { updateItem } = await run(
      { command: "skip_item", item: "Tie rod ends" },
      session,
    );

    expect(updateItem).toHaveBeenCalledWith(
      0,
      0,
      expect.objectContaining({ status: "na" }),
    );
  });

  it("never overwrites an existing fail finding", async () => {
    const session = makeSession({ status: "fail" });
    const { result, updateItem } = await run(
      { command: "skip_item", item: "Tie rod ends" },
      session,
    );

    expect(updateItem).not.toHaveBeenCalled();
    expect(result.appliedTarget).toBeNull();
  });

  it("never overwrites an existing recommend finding", async () => {
    const session = makeSession({ status: "recommend" });
    const { result, updateItem } = await run(
      { command: "skip_item", item: "Tie rod ends" },
      session,
    );

    expect(updateItem).not.toHaveBeenCalled();
    expect(result.appliedTarget).toBeNull();
  });
});

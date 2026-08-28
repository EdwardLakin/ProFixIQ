import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SectionDisplay from "@/features/inspections/lib/inspection/SectionDisplay";

vi.mock(
  "../features/inspections/lib/inspection/InspectionItemCard",
  () => ({
    default: ({
      item,
      readOnly,
    }: {
      item: { notes?: string };
      readOnly?: boolean;
    }) => (
      <textarea
        placeholder="Notes…"
        value={item.notes ?? ""}
        readOnly={readOnly}
        onChange={() => undefined}
      />
    ),
  }),
);

const baseProps = {
  title: "Brakes",
  sectionIndex: 0,
  showNotes: true,
  showPhotos: false,
  inspectionId: "inspection-1",
  onUpdateStatus: vi.fn(),
  onUpdateNote: vi.fn(),
  onUpdatePhotos: vi.fn(),
};

describe("inspection early finding submission UI", () => {
  it("submits one failed finding without signing the inspection", () => {
    const onSubmit = vi.fn();
    render(
      <SectionDisplay
        {...baseProps}
        section={{
          title: "Brakes",
          items: [
            {
              item: "Brake pedal travel",
              unit: null,
              status: "fail",
              notes: "Brake pedal is soft.",
            },
          ],
        }}
        requireNoteForAI
        onSubmitAI={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit item" }));

    expect(onSubmit).toHaveBeenCalledWith(0, 0);
    expect(
      screen.getByText(/without completing the inspection/i),
    ).toBeTruthy();
  });

  it("shows a submitted finding as read-only", () => {
    render(
      <SectionDisplay
        {...baseProps}
        section={{
          title: "Brakes",
          items: [
            {
              item: "Brake pedal travel",
              unit: null,
              status: "fail",
              notes: "Brake pedal is soft.",
              estimateSubmitted: true,
            },
          ],
        }}
        requireNoteForAI
        onSubmitAI={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Submitted to Quote Review" }),
    ).toBeDisabled();
    expect(screen.getByPlaceholderText("Notes…")).toHaveAttribute(
      "readonly",
    );
  });
});

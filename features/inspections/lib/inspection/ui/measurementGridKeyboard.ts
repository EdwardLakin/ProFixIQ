import type { KeyboardEvent } from "react";

const MEASUREMENT_INPUT_SELECTOR =
  'input[data-inspection-measurement-input="true"]:not(:disabled)';

export function handleMeasurementGridKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
): void {
  if (event.key !== "Tab" && event.key !== "Enter") return;

  const grid = event.currentTarget.closest<HTMLElement>(
    "[data-inspection-measurement-grid]",
  );
  if (!grid) return;

  const inputs = Array.from(
    grid.querySelectorAll<HTMLInputElement>(MEASUREMENT_INPUT_SELECTOR),
  );
  const currentIndex = inputs.indexOf(event.currentTarget);
  if (currentIndex < 0) return;

  const direction = event.shiftKey ? -1 : 1;
  const next = inputs[currentIndex + direction];

  // At the first/last input, leave normal browser Tab behavior intact so
  // keyboard users can enter/exit the grid naturally. Enter stays put.
  if (!next) {
    if (event.key === "Enter") event.preventDefault();
    return;
  }

  event.preventDefault();
  next.focus();
  next.select();
}

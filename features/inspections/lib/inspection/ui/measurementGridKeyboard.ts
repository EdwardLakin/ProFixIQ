import type { KeyboardEvent } from "react";

const MEASUREMENT_INPUT_SELECTOR =
  'input[data-inspection-measurement-input="true"]:not(:disabled)';

function keyKind(event: KeyboardEvent<HTMLInputElement>): "tab" | "enter" | null {
  const native = event.nativeEvent as KeyboardEvent["nativeEvent"] & {
    keyCode?: number;
    which?: number;
  };

  const key = event.key;
  const code = event.code;
  const legacyCode = native.keyCode ?? native.which;

  if (key === "Tab" || code === "Tab" || legacyCode === 9) return "tab";
  if (key === "Enter" || code === "Enter" || legacyCode === 13) return "enter";
  return null;
}

export function handleMeasurementGridKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
): void {
  const kind = keyKind(event);
  if (!kind) return;

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

  // Keep normal browser Tab behavior only when leaving the grid. Enter never
  // leaves the grid implicitly.
  if (!next) {
    if (kind === "enter") event.preventDefault();
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  next.focus({ preventScroll: true });
  next.select();
}

// features/inspections/lib/inspection/ui/MeasurementInput.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type MeasurementInputProps = {
  value: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
  type?: "text" | "number";
  inputMode?: "decimal" | "text";
  placeholder?: string;
  className: string;
  onFocus?: () => void;
};

// inputMode="decimal" fields are plain measurements (mm, psi, CCA, ft·lb, ...).
// inputMode="text" fields are the inch-unit tread/pressure cells, which are
// legitimately entered as a fraction (e.g. "5/32") as well as a decimal.
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;
const FRACTION_OR_DECIMAL_RE = /^\d+(\.\d+)?(\/\d+(\.\d+)?)?"?$/;

function isValidMeasurement(raw: string, allowFraction: boolean): boolean {
  const trimmed = raw.trim();
  if (trimmed === "") return true;
  return allowFraction ? FRACTION_OR_DECIMAL_RE.test(trimmed) : DECIMAL_RE.test(trimmed);
}

/**
 * A grid measurement field that only touches session state on commit
 * (blur, or the tab becoming hidden), not on every keystroke. Keeps its own
 * buffer so typing never re-renders the rest of the inspection form, but
 * still behaves like a controlled input: it resyncs from `value` whenever
 * it isn't focused (so remote/voice updates aren't silently clobbered) and
 * skips committing when nothing changed (so a plain tab-through doesn't
 * bump the session revision).
 *
 * Renders as type="text" (Safari does not reliably include type="number"
 * inputs in Tab order), so non-numeric text is rejected on commit instead
 * of relying on the browser to block it at the keystroke level.
 */
export default function MeasurementInput({
  value,
  onCommit,
  disabled,
  type = "number",
  inputMode = "decimal",
  placeholder,
  className,
  onFocus,
}: MeasurementInputProps) {
  const [local, setLocal] = useState(value);
  const editingRef = useRef(false);
  const localRef = useRef(local);
  const valueRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  const allowFractionRef = useRef(inputMode === "text");

  localRef.current = local;
  valueRef.current = value;
  onCommitRef.current = onCommit;
  allowFractionRef.current = inputMode === "text";

  useEffect(() => {
    if (!editingRef.current) setLocal(value);
  }, [value]);

  const commitIfChanged = (next: string) => {
    const trimmed = next.trim();
    if (!isValidMeasurement(trimmed, allowFractionRef.current)) return false;
    if (trimmed !== valueRef.current) onCommitRef.current(trimmed);
    return true;
  };

  useEffect(() => {
    const flushIfEditing = () => {
      if (editingRef.current) commitIfChanged(localRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushIfEditing();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushIfEditing);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushIfEditing);
    };
  }, []);

  return (
    <input
      className={className}
      type={type}
      inputMode={inputMode}
      placeholder={placeholder}
      autoComplete="off"
      value={local}
      disabled={disabled}
      onFocus={() => {
        editingRef.current = true;
        onFocus?.();
      }}
      onChange={(event) => setLocal(event.currentTarget.value)}
      onBlur={(event) => {
        editingRef.current = false;
        const ok = commitIfChanged(event.currentTarget.value);
        if (!ok) setLocal(valueRef.current);
      }}
    />
  );
}

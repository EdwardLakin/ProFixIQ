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

/**
 * A grid measurement field that only touches session state on commit
 * (blur, or the tab becoming hidden), not on every keystroke. Keeps its own
 * buffer so typing never re-renders the rest of the inspection form, but
 * still behaves like a controlled input: it resyncs from `value` whenever
 * it isn't focused (so remote/voice updates aren't silently clobbered) and
 * skips committing when nothing changed (so a plain tab-through doesn't
 * bump the session revision).
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

  localRef.current = local;
  valueRef.current = value;
  onCommitRef.current = onCommit;

  useEffect(() => {
    if (!editingRef.current) setLocal(value);
  }, [value]);

  const commitIfChanged = (next: string) => {
    if (next !== valueRef.current) onCommitRef.current(next);
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
        commitIfChanged(event.currentTarget.value);
      }}
    />
  );
}

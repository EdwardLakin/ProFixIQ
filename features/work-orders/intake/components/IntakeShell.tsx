import React from "react";

export function IntakeShell(props: {
  title: string;
  stepTitle: string;
  stepIndex: number;
  stepCount: number;
  onBack?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  primaryActionLabel?: string;
  children: React.ReactNode;
}) {
  const {
    title,
    stepTitle,
    stepIndex,
    stepCount,
    onBack,
    onNext,
    nextDisabled,
    primaryActionLabel,
    children,
  } = props;

  return (
    <div
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: 16,
        display: "grid",
        gap: 12,
      }}
    >
      <header style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Step {stepIndex + 1} of {stepCount}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.85 }}>
          {stepTitle}
        </div>
      </header>

      <main style={{ display: "grid", gap: 12 }}>{children}</main>

      <footer
        style={{
          position: "sticky",
          bottom: 0,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          paddingTop: 10,
          paddingBottom: 10,
          display: "flex",
          gap: 10,
          justifyContent: "space-between",
          borderTop: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          disabled={!onBack}
          style={{ padding: "12px 14px", borderRadius: 10, minWidth: 110 }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!onNext || !!nextDisabled}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            minWidth: 110,
            fontWeight: 800,
          }}
        >
          {primaryActionLabel ?? "Next"}
        </button>
      </footer>
    </div>
  );
}

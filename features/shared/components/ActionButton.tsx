"use client";

export default function ActionButton({
  onClick,
  children,
  title,
  disabled = false,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="app-shell-action inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium shadow-sm backdrop-blur-md transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        borderColor: "var(--theme-border-soft)",
        background: "var(--theme-gradient-panel)",
        color: "var(--theme-text-primary)",
      }}
    >
      {children}
    </button>
  );
}

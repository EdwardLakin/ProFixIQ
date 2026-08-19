import type { ReactNode } from "react";

export type WorkspaceStatusProps = {
  children: ReactNode;
};

export function WorkspaceStatus({ children }: WorkspaceStatusProps) {
  return (
    <span className="inline-flex max-w-full rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--theme-text-secondary)]">
      {children}
    </span>
  );
}

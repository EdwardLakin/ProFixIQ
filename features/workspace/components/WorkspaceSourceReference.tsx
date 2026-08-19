export type WorkspaceSourceReferenceProps = {
  label: string;
  canOpen?: boolean;
};

export function WorkspaceSourceReference({
  label,
  canOpen = true,
}: WorkspaceSourceReferenceProps) {
  return (
    <span className="mt-3 flex items-center justify-between gap-3 border-t border-[color:var(--theme-border-soft)] pt-3 text-xs text-[color:var(--theme-text-muted)]">
      <span className="min-w-0 truncate">Source: {label}</span>
      <span
        aria-hidden="true"
        className="shrink-0 text-[color:var(--accent-copper-light,#fdba74)]"
      >
        {canOpen ? "Open →" : "Source retained"}
      </span>
    </span>
  );
}

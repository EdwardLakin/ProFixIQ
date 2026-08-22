export default function PortalQuotesLoading(): JSX.Element {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-3 py-4">
      <div className="h-24 animate-pulse rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-44 animate-pulse rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]" />
        <div className="h-44 animate-pulse rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]" />
      </div>
    </div>
  );
}

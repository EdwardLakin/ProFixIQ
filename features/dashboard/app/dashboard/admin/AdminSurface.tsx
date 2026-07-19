import type { ReactNode } from "react";

const shellFrame =
  "mx-auto w-full max-w-[1800px] space-y-4 px-3 pb-6 pt-4 text-[color:var(--theme-text-primary)] sm:px-5 lg:px-6";

const panelFrame =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] shadow-[var(--theme-shadow-medium)] backdrop-blur-md";

export function AdminPageShell({ children }: { children: ReactNode }) {
  return <div className={shellFrame}>{children}</div>;
}

export function AdminPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-[color:var(--theme-border-soft)] pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        {eyebrow ? (
          <p className="text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold text-[color:var(--theme-text-primary)] sm:text-3xl">{title}</h1>
        <p className="max-w-3xl text-sm text-[color:var(--theme-text-secondary)]">{subtitle}</p>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function AdminPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`${panelFrame} ${className}`.trim()}>{children}</section>;
}

export function AdminPanelTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[color:var(--theme-border-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-primary)]">{title}</h2>
        {description ? <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function AdminEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-[color:var(--theme-text-primary)]">{title}</p>
      <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">{body}</p>
    </div>
  );
}

export function AdminStatGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function AdminStatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <article className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{hint}</p> : null}
    </article>
  );
}

export function AdminToolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 p-4 md:flex-row md:items-end">{children}</div>;
}

export function AdminField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)] ${className}`.trim()}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function AdminBadge({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-0.5 text-xs">{children}</span>;
}

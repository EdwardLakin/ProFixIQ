import type { ReactNode } from "react";

const shellFrame =
  "mx-auto w-full max-w-7xl space-y-5 px-4 pb-8 pt-6 text-neutral-100 sm:px-6 lg:px-8";

const panelFrame =
  "rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] shadow-[0_18px_45px_rgba(0,0,0,0.45)] backdrop-blur-md";

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
    <header className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        {eyebrow ? (
          <p className="text-[0.7rem] uppercase tracking-[0.16em] text-neutral-400">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h1>
        <p className="max-w-3xl text-sm text-neutral-300">{subtitle}</p>
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
    <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-neutral-200">{title}</h2>
        {description ? <p className="mt-1 text-xs text-neutral-400">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function AdminEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-neutral-200">{title}</p>
      <p className="mt-1 text-sm text-neutral-400">{body}</p>
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
    <article className="rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-400">{hint}</p> : null}
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
    <label className={`block text-xs uppercase tracking-[0.12em] text-neutral-400 ${className}`.trim()}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function AdminBadge({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-xs">{children}</span>;
}

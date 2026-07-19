import Link from "next/link";

export default function MobileNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-4 py-10">
      <section className="w-full rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 text-center shadow-[var(--theme-shadow-medium)]">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          ProFixIQ mobile
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
          Mobile page not found
        </h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          This destination is not available on the current mobile build. Return to
          your role-specific mobile home instead of leaving the mobile app.
        </p>
        <Link
          href="/mobile"
          className="mt-5 flex min-h-12 items-center justify-center rounded-2xl bg-[color:var(--accent-copper)] px-4 text-sm font-semibold text-white"
        >
          Return to mobile home
        </Link>
      </section>
    </div>
  );
}

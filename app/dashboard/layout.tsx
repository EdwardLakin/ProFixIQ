// app/dashboard/layout.tsx
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative w-full overflow-hidden rounded-[28px]">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "var(--dashboard-shell-bg, radial-gradient(1200px_640px_at_14%_-8%, color-mix(in srgb, var(--brand-primary, #C1663B) 10%, transparent), transparent 62%), radial-gradient(1100px_700px_at_100%_100%, rgba(2,6,23,0.45), transparent 64%), linear-gradient(180deg, var(--theme-app-bg, #050910) 0%, var(--theme-app-bg, #050910) 100%))",
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

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
            "var(--dashboard-shell-bg, radial-gradient(1200px_640px_at_14%_-8%, color-mix(in srgb, #F97316 14%, transparent), transparent 58%), linear-gradient(180deg, #020617 0%, #020617 100%))",
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

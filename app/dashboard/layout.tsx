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
            "var(--theme-gradient-panel)",
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

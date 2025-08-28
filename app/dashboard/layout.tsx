export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white">
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

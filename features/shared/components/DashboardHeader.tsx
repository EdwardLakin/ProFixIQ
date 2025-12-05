

export default function DashboardHeader() {
  return (
    <header className="w-full p-6 bg-surface text-accent shadow-card rounded-md mb-6">
      <div className="flex flex-col items-start">
        <h1 className="text-3xl font-bold tracking-tight">ProFixIQ</h1>
        <p className="text-sm text-muted mt-1">
          AI-powered repair assistant built for mechanics
        </p>
      </div>
    </header>
  );
}

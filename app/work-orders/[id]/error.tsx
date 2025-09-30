"use client";
export default function Error({ error, reset }: { error: unknown; reset: () => void }) {
  console.error("[wo/[id]] error boundary:", error);
  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-red-400">Something went wrong</h1>
      <p className="mt-2 text-sm text-white/70">This page failed to load.</p>
      <button
        onClick={() => reset()}
        className="mt-4 rounded bg-orange-500 px-3 py-1.5 text-sm font-semibold text-black hover:bg-orange-400"
      >
        Try again
      </button>
    </div>
  );
}

// app/dashboard/inspections/error.tsx
"use client";

import { useEffect } from "react";

export default function InspectionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Inspections error:", error);
  }, [error]);

  return (
    <div className="p-6 text-red-400 space-y-4">
      <h1 className="text-xl font-bold">⚠️ Inspections Error</h1>
      <p>Something went wrong while loading Inspections.</p>

      <pre className="whitespace-pre-wrap bg-neutral-900 text-orange-400 p-3 rounded-lg overflow-x-auto">
        {error.message}
        {error.digest ? `\nDigest: ${error.digest}` : null}
      </pre>

      <button
        onClick={() => reset()}
        className="mt-4 rounded bg-orange-600 px-4 py-2 text-white hover:bg-orange-500"
      >
        Try again
      </button>
    </div>
  );
}
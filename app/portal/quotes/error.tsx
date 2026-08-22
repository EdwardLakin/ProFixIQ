"use client";

import { useEffect, useMemo } from "react";

import RouteLoadPanel from "@/features/shared/components/ui/RouteLoadPanel";
import { asRouteLoadFailure } from "@/features/shared/lib/route-load";

export default function PortalQuotesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  useEffect(() => {
    console.error("[portal/quotes] route boundary", {
      digest: error.digest,
      name: error.name,
      message: error.message,
    });
  }, [error]);

  const failure = useMemo(
    () => asRouteLoadFailure(error, "Quotes could not be loaded."),
    [error],
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <RouteLoadPanel failure={failure} onRetry={reset} />
    </div>
  );
}

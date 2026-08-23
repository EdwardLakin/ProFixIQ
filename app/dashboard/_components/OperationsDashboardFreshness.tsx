"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { useOperationsLiveRefresh } from "@/features/work-orders/hooks/useOperationsLiveRefresh";

export default function OperationsDashboardFreshness({
  children,
  shopId,
}: {
  children: ReactNode;
  shopId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const refreshRequested = useRef(false);

  useEffect(() => setLastUpdatedAt(new Date()), []);
  useEffect(() => {
    if (!isPending && refreshRequested.current) {
      refreshRequested.current = false;
      setLastUpdatedAt(new Date());
    }
  }, [isPending]);

  const refresh = useCallback(() => {
    refreshRequested.current = true;
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  const liveStatus = useOperationsLiveRefresh({
    shopId,
    onRefresh: refresh,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3 px-1 text-xs text-[color:var(--theme-text-secondary)]">
        <div className="text-right">
          <div>
            {liveStatus === "live"
              ? "Live updates connected"
              : liveStatus === "connecting"
                ? "Connecting live updates…"
                : "Live updates unavailable"}
          </div>
          <div>
            Last updated{" "}
            {lastUpdatedAt
              ? lastUpdatedAt.toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "—"}
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 font-semibold text-[color:var(--theme-text-primary)] disabled:opacity-55"
        >
          <RefreshCw
            aria-hidden
            className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>
      {children}
    </div>
  );
}

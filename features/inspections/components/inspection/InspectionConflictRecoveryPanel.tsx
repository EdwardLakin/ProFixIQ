"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@shared/components/ui/Button";
import { cn } from "@shared/lib/utils";
import {
  inspectionConflictRows,
  mergeInspectionConflict,
  type InspectionConflictChoice,
} from "@inspections/lib/inspection/conflictRecovery";
import type {
  InspectionItem,
  InspectionSession,
} from "@inspections/lib/inspection/types";

type LoadResponse = { session?: InspectionSession | null };

function summary(item: InspectionItem): string {
  const parts = [
    item.status ? String(item.status).toUpperCase() : "No status",
    item.value !== null && item.value !== undefined && String(item.value).trim()
      ? `${item.value}${item.unit ? ` ${item.unit}` : ""}`
      : null,
    (item.notes ?? item.note)?.trim() || null,
    item.parts?.length
      ? `${item.parts.length} part request${item.parts.length === 1 ? "" : "s"}`
      : null,
    typeof item.laborHours === "number" ? `${item.laborHours} labor hr` : null,
    item.photoUrls?.length
      ? `${item.photoUrls.length} uploaded photo${item.photoUrls.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export default function InspectionConflictRecoveryPanel({
  deviceSession,
  workOrderLineId,
  onResolve,
}: {
  deviceSession: InspectionSession;
  workOrderLineId: string;
  onResolve: (session: InspectionSession) => Promise<void>;
}) {
  const [serverSession, setServerSession] = useState<InspectionSession | null>(
    null,
  );
  const [choices, setChoices] = useState<
    Record<string, InspectionConflictChoice>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ workOrderLineId });
        const response = await fetch(`/api/inspections/load?${params}`, {
          cache: "no-store",
          credentials: "include",
        });
        const json = (await response
          .json()
          .catch(() => null)) as LoadResponse | null;
        if (!response.ok || !json?.session) {
          throw new Error("Unable to load the shop copy for comparison.");
        }
        if (!cancelled) setServerSession(json.session);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load the shop copy.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [workOrderLineId]);

  const rows = useMemo(
    () =>
      serverSession ? inspectionConflictRows(deviceSession, serverSession) : [],
    [deviceSession, serverSession],
  );

  const apply = async (useServerOnly = false) => {
    if (!serverSession) return;
    setSaving(true);
    setError(null);
    try {
      const merged = useServerOnly
        ? serverSession
        : mergeInspectionConflict({
            device: deviceSession,
            server: serverSession,
            choices,
          });
      await onResolve(merged);
      toast.success(
        useServerOnly
          ? "Shop copy kept. Device conflict cleared."
          : "Selected inspection details merged and synced.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Recovery could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-amber-400/40 bg-amber-950/20 p-3 text-amber-50 shadow-[var(--theme-shadow-medium)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            Review this device against the shop copy
          </p>
          <p className="mt-1 max-w-3xl text-xs text-amber-100/80">
            Nothing is chosen by time. Select the correct result for each
            changed item, then sync one reviewed revision. Pending photos remain
            queued and upload afterward.
          </p>
        </div>
        {serverSession && (
          <span className="rounded-full border border-amber-300/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider">
            Shop revision {serverSession.syncRevision ?? 0}
          </span>
        )}
      </div>

      {loading && <p className="mt-3 text-xs">Loading shop copy…</p>}
      {error && <p className="mt-3 text-xs text-red-200">{error}</p>}

      {!loading && serverSession && rows.length > 0 && (
        <div className="mt-3 space-y-2">
          {rows.map((row) => {
            const choice = choices[row.key] ?? "device";
            return (
              <div
                key={row.key}
                className="rounded-xl border border-white/10 bg-black/15 p-2.5"
              >
                <p className="text-xs font-semibold">
                  {row.sectionTitle} · {row.itemLabel}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(["device", "server"] as const).map((source) => {
                    const selected = choice === source;
                    const item =
                      source === "device" ? row.deviceItem : row.serverItem;
                    return (
                      <button
                        key={source}
                        type="button"
                        onClick={() =>
                          setChoices((current) => ({
                            ...current,
                            [row.key]: source,
                          }))
                        }
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left transition",
                          selected
                            ? "border-[color:var(--accent-copper)] bg-[color:var(--accent-copper-soft)]"
                            : "border-white/10 bg-black/10",
                        )}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                          {source === "device" ? "This device" : "Shop copy"}
                        </span>
                        <span className="mt-1 block text-xs text-current/85">
                          {summary(item)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && serverSession && rows.length === 0 && (
        <p className="mt-3 rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs">
          Item results now match. You can keep the shop copy and clear the stale
          device operation.
        </p>
      )}

      {serverSession && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={saving}
            onClick={() => void apply(false)}
          >
            {saving
              ? "Syncing…"
              : rows.length
                ? "Apply selected & sync"
                : "Clear resolved conflict"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => void apply(true)}
          >
            Keep shop copy
          </Button>
        </div>
      )}
    </section>
  );
}

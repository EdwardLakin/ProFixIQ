"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@shared/components/ui/Button";

type MappingItem = {
  serviceCode: string;
  label: string;
  defaultJobType: string | null;
  menuItemId: string | null;
  menuItemName: string | null;
  menuRepairItemId: string | null;
  labelOverride: string | null;
  isActive: boolean;
  matchSource: string | null;
  confidence: number | null;
};

type Suggestion = {
  menuItemId: string | null;
  menuItemName: string | null;
  confidence: number | null;
  reason: string;
};

export default function MaintenanceMappingsAdmin() {
  const [rows, setRows] = useState<MappingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [suggestingCode, setSuggestingCode] = useState<string | null>(null);
  const [menuItemEdits, setMenuItemEdits] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/maintenance/mappings", { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; mappings?: MappingItem[]; error?: string };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to load mappings");
      }

      const items = Array.isArray(json.mappings) ? json.mappings : [];
      setRows(items);
      setMenuItemEdits(
        Object.fromEntries(items.map((item) => [item.serviceCode, item.menuItemId ?? ""]))
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load mappings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function suggest(serviceCode: string, label: string) {
    setSuggestingCode(serviceCode);
    setMessage(null);

    try {
      const res = await fetch("/api/maintenance/mappings/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceCode, label }),
      });

      const json = (await res.json()) as {
        ok?: boolean;
        suggestion?: Suggestion;
        error?: string;
      };

      if (!res.ok || !json.ok || !json.suggestion) {
        throw new Error(json.error || "No suggestion available");
      }

      if (json.suggestion.menuItemId) {
        setMenuItemEdits((prev) => ({
          ...prev,
          [serviceCode]: json.suggestion!.menuItemId ?? "",
        }));
        setMessage(
          `Suggested ${serviceCode}: ${json.suggestion.menuItemName ?? "menu item"} (${json.suggestion.reason})`
        );
      } else {
        setMessage(`No strong suggestion for ${serviceCode}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to suggest mapping");
    } finally {
      setSuggestingCode(null);
    }
  }

  async function save(serviceCode: string) {
    setSavingCode(serviceCode);
    setMessage(null);

    try {
      const menuItemId = (menuItemEdits[serviceCode] ?? "").trim();
      if (!menuItemId) {
        throw new Error("Enter a menu item id first");
      }

      const res = await fetch("/api/maintenance/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceCode,
          menuItemId,
          matchSource: "manual",
          isActive: true,
        }),
      });

      const json = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to save mapping");
      }

      setMessage(`Saved mapping for ${serviceCode}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save mapping");
    } finally {
      setSavingCode(null);
    }
  }

  const activeCount = useMemo(
    () => rows.filter((row) => Boolean(row.menuItemId || row.menuRepairItemId)).length,
    [rows],
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-black/30 p-4 text-white shadow-card backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-200">
            Maintenance Mappings
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Map maintenance service codes to shop menu items.
          </p>
        </div>

        <div className="text-xs text-neutral-400">
          {activeCount} mapped / {rows.length} total
        </div>
      </div>

      {message ? (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-300">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-neutral-400">Loading mappings…</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const isSaving = savingCode === row.serviceCode;
            const isSuggesting = suggestingCode === row.serviceCode;

            return (
              <div
                key={row.serviceCode}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-100">{row.label}</span>
                  <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                    {row.serviceCode}
                  </span>
                  {row.menuItemId ? (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
                      mapped
                    </span>
                  ) : (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                      unmapped
                    </span>
                  )}
                </div>

                {row.menuItemId ? (
                  <div className="mb-2 text-xs text-neutral-400">
                    Current menu item: <span className="text-neutral-200">{row.menuItemName ?? row.menuItemId}</span>
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <input
                    value={menuItemEdits[row.serviceCode] ?? ""}
                    onChange={(e) =>
                      setMenuItemEdits((prev) => ({
                        ...prev,
                        [row.serviceCode]: e.target.value,
                      }))
                    }
                    placeholder="menu_item_id"
                    className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  />

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void suggest(row.serviceCode, row.label)}
                    disabled={isSuggesting}
                    className="border-white/15 bg-white/5 text-xs text-neutral-200 hover:bg-white/10"
                  >
                    {isSuggesting ? "Suggesting…" : "Auto-suggest"}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void save(row.serviceCode)}
                    disabled={isSaving}
                    className="bg-orange-500 text-black hover:bg-orange-400"
                  >
                    {isSaving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

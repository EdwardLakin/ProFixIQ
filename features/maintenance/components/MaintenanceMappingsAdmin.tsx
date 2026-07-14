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

type MenuItemOption = {
  id: string;
  name: string;
};

export default function MaintenanceMappingsAdmin() {
  const [rows, setRows] = useState<MappingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [suggestingCode, setSuggestingCode] = useState<string | null>(null);
  const [menuItemEdits, setMenuItemEdits] = useState<Record<string, string>>({});
  const [menuSearch, setMenuSearch] = useState<Record<string, string>>({});
  const [menuOptions, setMenuOptions] = useState<Record<string, MenuItemOption[]>>({});
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

  async function searchMenuItems(serviceCode: string, q: string) {
    try {
      const res = await fetch(
        `/api/maintenance/menu-items/search?q=${encodeURIComponent(q)}`,
        { cache: "no-store" },
      );

      const json = (await res.json()) as {
        ok?: boolean;
        items?: MenuItemOption[];
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to search menu items");
      }

      setMenuOptions((prev) => ({
        ...prev,
        [serviceCode]: Array.isArray(json.items) ? json.items : [],
      }));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to search menu items",
      );
    }
  }

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
    <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-[color:var(--theme-text-primary)] shadow-card backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-primary)]">
            Maintenance Mappings
          </h2>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Map maintenance service codes to shop menu items.
          </p>
        </div>

        <div className="text-xs text-[color:var(--theme-text-secondary)]">
          {activeCount} mapped / {rows.length} total
        </div>
      </div>

      {message ? (
        <div className="mb-4 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading mappings…</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const isSaving = savingCode === row.serviceCode;
            const isSuggesting = suggestingCode === row.serviceCode;

            return (
              <div
                key={row.serviceCode}
                className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{row.label}</span>
                  <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
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
                  <div className="mb-2 text-xs text-[color:var(--theme-text-secondary)]">
                    Current menu item: <span className="text-[color:var(--theme-text-primary)]">{row.menuItemName ?? row.menuItemId}</span>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <input
                    value={menuSearch[row.serviceCode] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setMenuSearch((prev) => ({
                        ...prev,
                        [row.serviceCode]: value,
                      }));
                      void searchMenuItems(row.serviceCode, value);
                    }}
                    placeholder="Search menu items by name"
                    className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none"
                  />

                  <select
                    value={menuItemEdits[row.serviceCode] ?? ""}
                    onChange={(e) =>
                      setMenuItemEdits((prev) => ({
                        ...prev,
                        [row.serviceCode]: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none"
                  >
                    <option value="">Select a menu item</option>
                    {(menuOptions[row.serviceCode] ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>

                  <div className="grid gap-3 md:grid-cols-[auto_auto]">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void suggest(row.serviceCode, row.label)}
                      disabled={isSuggesting}
                      className="border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-xs text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
                    >
                      {isSuggesting ? "Suggesting…" : "Auto-suggest"}
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void save(row.serviceCode)}
                      disabled={isSaving}
                      className="bg-orange-500 text-[color:var(--theme-text-on-accent)] hover:bg-orange-400"
                    >
                      {isSaving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

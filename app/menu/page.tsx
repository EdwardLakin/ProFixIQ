// app/menu/page.tsx (FULL FILE REPLACEMENT)
// Menu list routes to: /menu/item/[id]
// NO `any` casts.
// IMPORTANT: labor rate is pulled from shops table (no manual labor rate input).
// Menu totals are stored as: parts subtotal + (labor_time * shops.labor_rate)
// Tax is NOT applied on Menu Items (tax belongs at quote/invoice time).

"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useUser } from "@auth/hooks/useUser";
import { toast } from "sonner";

import { PartPicker, type PickedPart } from "@parts/components/PartPicker";
import { masterServicesList } from "@inspections/lib/inspection/masterServicesList";

type DB = Database;

type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"];
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"] & {
  labor_hours?: number | null;
};

type PartFormRow = {
  name: string;
  quantityStr: string;
  unitCostStr: string;
  part_id?: string | null;
};

type FormState = {
  source: "master" | "manual";
  name: string;
  description: string;
  laborTimeStr: string;
  inspectionTemplateId: string;
};

type ShopDefaults = {
  country: "US" | "CA";
  labor_rate: number | null;
};

function toNum(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function cleanNumericString(raw: string): string {
  if (raw === "") return "";
  const v = raw.replace(/[^\d.]/g, "");
  return v === "" ? "" : v.replace(/^0+(?=\d)/, "");
}

function money(currency: "CAD" | "USD", n: number | null | undefined): string {
  const x = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `${currency} $${x.toFixed(2)}`;
}

function getShopIdFromUser(user: unknown): string | null {
  if (!user || typeof user !== "object") return null;
  const rec = user as Record<string, unknown>;
  const v = rec["shop_id"];
  return typeof v === "string" && v.length ? v : null;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function includesText(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return normalize(haystack).includes(needle);
}

type PartsRequestBodyItem = {
  description: string;
  qty: number;
};

type PartsRequestBody = {
  workOrderId: string;
  jobId?: string | null;
  items: PartsRequestBodyItem[];
  notes?: string | null;
};

export default function MenuItemsPage() {
  const supabase = createClientComponentClient<DB>();
  const router = useRouter();
  const { user, isLoading } = useUser();

  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [shopDefaults, setShopDefaults] = useState<ShopDefaults | null>(null);

  // create form
  const [pickerOpenForRow, setPickerOpenForRow] = useState<number | null>(null);
  const [parts, setParts] = useState<PartFormRow[]>([
    { name: "", quantityStr: "", unitCostStr: "", part_id: null },
  ]);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [form, setForm] = useState<FormState>({
    source: "master",
    name: "",
    description: "",
    laborTimeStr: "",
    inspectionTemplateId: "",
  });

  // saved items search (MUST be above any return)
  const [savedQuery, setSavedQuery] = useState<string>("");

  // manual parts request (MUST be above any return)
  const [requesting, setRequesting] = useState(false);
  const [requestWorkOrderId, setRequestWorkOrderId] = useState<string>("");
  const [requestNotes, setRequestNotes] = useState<string>("");
  const [requestIncludeUnlinkedOnly, setRequestIncludeUnlinkedOnly] =
    useState<boolean>(true);

  const shopId = useMemo(() => getShopIdFromUser(user), [user]);

  const currency: "CAD" | "USD" = useMemo(
    () => (shopDefaults?.country === "CA" ? "CAD" : "USD"),
    [shopDefaults],
  );

  const laborRate = useMemo(() => {
    const r = shopDefaults?.labor_rate;
    return typeof r === "number" && Number.isFinite(r) ? r : 0;
  }, [shopDefaults]);

  // ---------------------------
  // SHOP DEFAULTS (use shops table)
  // ---------------------------
  const fetchShopDefaults = useCallback(async () => {
    if (!shopId) {
      setShopDefaults(null);
      return;
    }

    const { error: ctxErr } = await supabase.rpc("set_current_shop_id", {
      p_shop_id: shopId,
    });
    if (ctxErr) {
      console.warn("[menu] set_current_shop_id failed:", ctxErr.message);
    }

    const { data, error } = await supabase
      .from("shops")
      .select("country, labor_rate")
      .eq("id", shopId)
      .maybeSingle();

    if (error) {
      toast.message(error.message);
      setShopDefaults(null);
      return;
    }

    const countrySafe: "US" | "CA" = data?.country === "CA" ? "CA" : "US";

    setShopDefaults({
      country: countrySafe,
      labor_rate: typeof data?.labor_rate === "number" ? data.labor_rate : null,
    });
  }, [supabase, shopId]);

  // ---------------------------
  // CREATE FORM TOTALS (no tax here)
  // ---------------------------
  const partsTotal = useMemo(
    () =>
      parts.reduce((sum, p) => {
        const q = toNum(p.quantityStr);
        const u = toNum(p.unitCostStr);
        return sum + q * u;
      }, 0),
    [parts],
  );

  const selectedTemplate = useMemo(() => {
    if (!form.inspectionTemplateId) return null;
    return templates.find((t) => t.id === form.inspectionTemplateId) ?? null;
  }, [templates, form.inspectionTemplateId]);

  const effectiveLaborHours = useMemo(() => {
    // Option A: manual labor overrides; otherwise use template labor_hours
    const manual = form.laborTimeStr.trim();
    if (manual) return toNum(manual);

    const t = selectedTemplate?.labor_hours;
    return typeof t === "number" && Number.isFinite(t) ? t : 0;
  }, [form.laborTimeStr, selectedTemplate]);

  const laborTotal = useMemo(
    () => effectiveLaborHours * laborRate,
    [effectiveLaborHours, laborRate],
  );

  const subtotal = useMemo(
    () => partsTotal + laborTotal,
    [partsTotal, laborTotal],
  );

  // Auto-fill labor when template selected and labor box is empty
  useEffect(() => {
    if (!form.inspectionTemplateId) return;
    if (form.laborTimeStr.trim()) return;

    const t = templates.find((x) => x.id === form.inspectionTemplateId);
    const lh = t?.labor_hours;

    if (typeof lh === "number" && Number.isFinite(lh) && lh > 0) {
      setForm((f) => ({ ...f, laborTimeStr: String(lh) }));
    }
  }, [form.inspectionTemplateId, form.laborTimeStr, templates]);

  // ---------------------------
  // LIST + REALTIME
  // ---------------------------
  const fetchItems = useCallback(async () => {
    if (!shopId) {
      setMenuItems([]);
      return;
    }

    const { error: ctxErr } = await supabase.rpc("set_current_shop_id", {
      p_shop_id: shopId,
    });
    if (ctxErr) {
      console.warn("[menu] set_current_shop_id failed:", ctxErr.message);
    }

    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Failed to fetch menu items:", error);
      toast.error("Could not load menu items");
      return;
    }

    setMenuItems(data ?? []);
  }, [supabase, shopId]);

  const fetchTemplates = useCallback(async () => {
    const { data: me } = await supabase.auth.getUser();
    const uid = me?.user?.id ?? null;

    const minePromise = uid
      ? supabase
          .from("inspection_templates")
          .select("*")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as TemplateRow[], error: null });

    const sharedPromise = supabase
      .from("inspection_templates")
      .select("*")
      .eq("is_public", true)
      .order("created_at", { ascending: false });

    const [{ data: mineRaw }, { data: sharedRaw }] = await Promise.all([
      minePromise,
      sharedPromise,
    ]);

    setTemplates([
      ...(Array.isArray(mineRaw) ? (mineRaw as TemplateRow[]) : []),
      ...(Array.isArray(sharedRaw) ? (sharedRaw as TemplateRow[]) : []),
    ]);
  }, [supabase]);

  useEffect(() => {
    if (!shopId) return;

    void fetchShopDefaults();
    void fetchItems();
    void fetchTemplates();

    const channel = supabase
      .channel("menu-items-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_items" },
        () => void fetchItems(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, shopId, fetchShopDefaults, fetchItems, fetchTemplates]);

  // ---------------------------
  // PARTS EDITOR HELPERS
  // ---------------------------
  const setPartField = useCallback(
    (idx: number, field: "name" | "quantityStr" | "unitCostStr", value: string) => {
      setParts((rows) =>
        rows.map((r, i) =>
          i === idx
            ? { ...r, [field]: field === "name" ? value : cleanNumericString(value) }
            : r,
        ),
      );
    },
    [],
  );

  const addPartRow = useCallback(() => {
    setParts((rows) => [
      ...rows,
      { name: "", quantityStr: "", unitCostStr: "", part_id: null },
    ]);
  }, []);

  const removePartRow = useCallback((idx: number) => {
    setParts((rows) => rows.filter((_, i) => i !== idx));
  }, []);

  const handlePickPart = useCallback(
    (rowIdx: number) =>
      (sel: PickedPart): void => {
        (async () => {
          const { data } = await supabase
            .from("parts")
            .select("name, unit_cost")
            .eq("id", sel.part_id)
            .maybeSingle();

          const label = data?.name ?? "Part";
          const qtyFromSel = sel.qty && sel.qty > 0 ? String(sel.qty) : "";
          const unitCostFromSel =
            sel.unit_cost != null && !Number.isNaN(sel.unit_cost)
              ? String(sel.unit_cost)
              : data?.unit_cost != null
                ? String(data.unit_cost)
                : "";

          setParts((rows) =>
            rows.map((r, i) =>
              i === rowIdx
                ? {
                    ...r,
                    part_id: sel.part_id,
                    name: label,
                    quantityStr: r.quantityStr || qtyFromSel,
                    unitCostStr: r.unitCostStr || unitCostFromSel,
                  }
                : r,
            ),
          );

          toast.success(`Picked ${label}`);
        })().catch(() => {
          setParts((rows) =>
            rows.map((r, i) =>
              i === rowIdx ? { ...r, part_id: sel.part_id } : r,
            ),
          );
        });
      },
    [supabase],
  );

  // ---------------------------
  // MANUAL PARTS REQUEST DERIVED
  // ---------------------------
  const requestItemsPreview = useMemo(() => {
    const rows = parts
      .map((p) => {
        const desc = p.name.trim();
        const qty = Math.max(1, Math.floor(toNum(p.quantityStr) || 1));
        const linked = typeof p.part_id === "string" && p.part_id.length > 0;
        return { desc, qty, linked };
      })
      .filter((x) => x.desc.length > 0);

    return requestIncludeUnlinkedOnly ? rows.filter((r) => !r.linked) : rows;
  }, [parts, requestIncludeUnlinkedOnly]);

  const canRequestParts = useMemo(() => {
    return (
      requestItemsPreview.length > 0 &&
      requestWorkOrderId.trim().length > 0 &&
      !requesting
    );
  }, [requestItemsPreview.length, requestWorkOrderId, requesting]);

  const createPartsRequest = useCallback(async () => {
    if (!canRequestParts) return;

    const workOrderId = requestWorkOrderId.trim();
    if (!workOrderId) return;

    const items: PartsRequestBodyItem[] = requestItemsPreview.map((r) => ({
      description: r.desc,
      qty: r.qty,
    }));

    const body: PartsRequestBody = {
      workOrderId,
      items,
      notes: requestNotes.trim().length > 0 ? requestNotes.trim() : null,
    };

    setRequesting(true);
    try {
      const res = await fetch("/api/parts/requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json().catch(() => null)) as
        | { requestId?: string; error?: string }
        | null;

      if (!res.ok) {
        toast.error(
          json?.error || `Failed to create parts request (HTTP ${res.status})`,
        );
        return;
      }

      if (!json?.requestId) {
        toast.error("Parts request created, but no requestId returned.");
        return;
      }

      toast.success("Parts request created (internal)");
      setRequestNotes("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create parts request");
    } finally {
      setRequesting(false);
    }
  }, [canRequestParts, requestItemsPreview, requestWorkOrderId, requestNotes]);

  // ---------------------------
  // CREATE (POST /api/menu/save)
  // ---------------------------
  const handleSubmit = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error("Service name is required");
      return;
    }

    if (!shopId) {
      toast.error("Missing shop context (shop_id).");
      return;
    }

    setSaving(true);
    try {
      const cleanedParts = parts
        .filter((p) => p.name.trim().length > 0 && toNum(p.quantityStr) > 0)
        .map((p) => ({
          name: p.name.trim(),
          quantity: toNum(p.quantityStr),
          unit_cost: toNum(p.unitCostStr),
          part_id: p.part_id ?? null,
        }));

      const itemLaborHours = effectiveLaborHours > 0 ? effectiveLaborHours : null;

      const computedTotal = partsTotal + (itemLaborHours ?? 0) * laborRate;

      const payload = {
        item: {
          name: form.name.trim(),
          description: form.description.trim() || null,
          labor_time: itemLaborHours,
          part_cost: partsTotal,
          total_price: computedTotal,
          inspection_template_id: form.inspectionTemplateId || null,
          shop_id: shopId,
        },
        parts: cleanedParts,
      };

      const res = await fetch("/api/menu/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };

      if (!res.ok || !json.ok) {
        toast.error(json.detail || json.error || "Failed to save menu item.");
        return;
      }

      toast.success("Menu item created");

      setForm((f) => ({
        ...f,
        source: "master",
        name: "",
        description: "",
        laborTimeStr: "",
        inspectionTemplateId: "",
      }));
      setParts([{ name: "", quantityStr: "", unitCostStr: "", part_id: null }]);

      await fetchItems();
    } catch (err) {
      console.error("[menu] unexpected save error", err);
      toast.error("Could not save menu item.");
    } finally {
      setSaving(false);
    }
  }, [
    form,
    parts,
    partsTotal,
    laborRate,
    shopId,
    fetchItems,
    effectiveLaborHours,
  ]);

  // ---------------------------
  // Saved menu items: collapsible + searchable
  // ---------------------------
  const savedNeedle = useMemo(() => normalize(savedQuery), [savedQuery]);

  const filteredMenuItems = useMemo(() => {
    if (!savedNeedle) return menuItems;
    return menuItems.filter((mi) => {
      const name = typeof mi.name === "string" ? mi.name : String(mi.name ?? "");
      const desc =
        typeof mi.description === "string"
          ? mi.description
          : String(mi.description ?? "");
      return includesText(name, savedNeedle) || includesText(desc, savedNeedle);
    });
  }, [menuItems, savedNeedle]);

  const activeMenuItems = useMemo(
    () => filteredMenuItems.filter((x) => x.is_active),
    [filteredMenuItems],
  );
  const inactiveMenuItems = useMemo(
    () => filteredMenuItems.filter((x) => !x.is_active),
    [filteredMenuItems],
  );

  // SAFE now: hooks are already declared above
  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-neutral-300">
        Loading…
      </div>
    );
  }

  const flatMaster = masterServicesList.flatMap((cat) =>
    cat.items.map((i) => i.item),
  );

  return (
    <div className="relative space-y-8 fade-in">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.95),#020617_70%)]"
      />

      {/* Header */}
      <section className="metal-card mb-2 flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-r from-black/85 via-slate-950/95 to-black/85 px-5 py-4 shadow-[0_22px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <div>
          <h1
            className="text-2xl font-semibold text-white"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            Service Menu
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Build reusable service packages with linked inspections, labor, and parts.
          </p>
        </div>

        <div className="hidden items-center gap-2 text-[11px] text-neutral-400 md:flex">
          <span className="rounded-full border border-white/10 bg-black/60 px-3 py-1">
            Labor rate:{" "}
            <span className="text-neutral-200">
              {laborRate > 0 ? `${laborRate.toFixed(0)}/${currency}/hr` : "—"}
            </span>
          </span>
        </div>
      </section>

      {/* Create */}
      <section className="metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/65 p-4 shadow-[0_22px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">
            Create menu item
          </h2>
          <div className="rounded-full border border-[color:var(--accent-copper,#f97316)]/50 bg-black/70 px-3 py-1 text-[11px] text-neutral-300">
            Parts + labor + inspection template
          </div>
        </div>

        <div className="mb-8 grid max-w-3xl gap-4">
          {/* name */}
          <div className="grid gap-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Service name
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={form.source}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    source: e.target.value === "manual" ? "manual" : "master",
                  }))
                }
                className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.9)] backdrop-blur-md sm:w-44"
              >
                <option value="master">From master list</option>
                <option value="manual">Manual</option>
              </select>

              <div className="flex-1">
                <input
                  placeholder="e.g. Front brake pads & rotors"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  list={form.source === "master" ? "master-services" : undefined}
                  autoComplete="off"
                  className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.9)] placeholder:text-neutral-500 backdrop-blur-md"
                />
                {form.source === "master" ? (
                  <datalist id="master-services">
                    {flatMaster.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                ) : null}
              </div>
            </div>
          </div>

          {/* template */}
          <div className="grid gap-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Inspection template (optional)
            </label>
            <select
              value={form.inspectionTemplateId}
              onChange={(e) =>
                setForm((f) => ({ ...f, inspectionTemplateId: e.target.value }))
              }
              className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.9)] backdrop-blur-md"
            >
              <option value="">— none —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.template_name ?? "Untitled"}
                  {typeof t.labor_hours === "number"
                    ? ` (${t.labor_hours.toFixed(1)}h)`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          {/* description */}
          <div className="grid gap-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Description
            </label>
            <textarea
              placeholder="Optional details visible to customer"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="min-h-[80px] rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.9)] placeholder:text-neutral-500 backdrop-blur-md"
            />
          </div>

          {/* labor */}
          <div className="grid gap-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Labor time (hrs)
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 1.5"
              value={form.laborTimeStr}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  laborTimeStr: cleanNumericString(e.target.value),
                }))
              }
              className="rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.9)] placeholder:text-neutral-500 backdrop-blur-md"
            />

            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-neutral-400">
              <span className="rounded-full border border-white/10 bg-black/60 px-3 py-1">
                Labor rate:{" "}
                <span className="text-neutral-200">
                  {laborRate > 0 ? `${laborRate.toFixed(0)}/${currency}/hr` : "—"}
                </span>
              </span>
              <span className="rounded-full border border-white/10 bg-black/60 px-3 py-1">
                Labor total:{" "}
                <span className="text-neutral-200">
                  {money(currency, laborTotal)}
                </span>
              </span>
              <span className="rounded-full border border-white/10 bg-black/60 px-3 py-1">
                Parts total:{" "}
                <span className="text-neutral-200">
                  {money(currency, partsTotal)}
                </span>
              </span>
            </div>
          </div>

          {/* parts */}
          <div className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-black/80 via-slate-950/80 to-black/80 px-4 py-2.5">
              <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
                Parts
              </h3>
              <span className="text-[11px] text-neutral-500">
                Linked to parts catalog
              </span>
            </div>

            <div className="space-y-3 p-4">
              {parts.map((p, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 items-center gap-2 rounded-xl border border-white/5 bg-black/60 p-3 text-sm shadow-[0_12px_30px_rgba(0,0,0,0.9)] backdrop-blur-md md:grid-cols-[2fr_0.8fr_0.8fr_auto_auto]"
                >
                  <input
                    placeholder="Part name (or pick)"
                    value={p.name}
                    onChange={(e) => setPartField(idx, "name", e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-transparent px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
                  />
                  <input
                    placeholder="Qty"
                    inputMode="numeric"
                    value={p.quantityStr}
                    onChange={(e) => setPartField(idx, "quantityStr", e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-transparent px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
                  />
                  <input
                    placeholder="Unit cost"
                    inputMode="decimal"
                    value={p.unitCostStr}
                    onChange={(e) => setPartField(idx, "unitCostStr", e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-transparent px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setPickerOpenForRow(idx)}
                    className="rounded-lg border border-[color:var(--accent-copper-soft,#fdba74)]/60 px-3 py-2 text-xs font-medium text-neutral-100 hover:bg-[color:var(--accent-copper,#f97316)]/15"
                  >
                    Pick
                  </button>
                  <button
                    type="button"
                    onClick={() => removePartRow(idx)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                onClick={addPartRow}
                type="button"
                className="text-xs font-medium text-[color:var(--accent-copper,#f97316)] hover:text-[color:var(--accent-copper-light,#fed7aa)]"
              >
                + Add part
              </button>

              {/* Manual parts request (internal flag in UI only) */}
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/55 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.9)] backdrop-blur-md">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                      Manual parts request
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-500">
                      Internal (UI flag only). Creates a parts request from the current parts rows.
                    </div>
                  </div>

                  <span className="rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[11px] text-neutral-400">
                    Items:{" "}
                    <span className="text-neutral-200">
                      {requestItemsPreview.length}
                    </span>
                  </span>
                </div>

                <div className="mt-3 grid gap-2">
                  <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                    Work order ID (required)
                  </label>
                  <input
                    value={requestWorkOrderId}
                    onChange={(e) => setRequestWorkOrderId(e.target.value)}
                    placeholder="Paste work_order_id"
                    className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 backdrop-blur-md"
                  />

                  <div className="flex items-center gap-2 pt-1 text-[11px] text-neutral-400">
                    <input
                      id="unlinked-only"
                      type="checkbox"
                      checked={requestIncludeUnlinkedOnly}
                      onChange={(e) => setRequestIncludeUnlinkedOnly(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <label htmlFor="unlinked-only" className="select-none">
                      Only include unlinked/manual parts
                    </label>
                  </div>

                  <label className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                    Notes (optional)
                  </label>
                  <textarea
                    value={requestNotes}
                    onChange={(e) => setRequestNotes(e.target.value)}
                    placeholder="e.g. Urgent, customer waiting…"
                    className="min-h-[70px] w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 backdrop-blur-md"
                  />

                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="text-[11px] text-neutral-500">
                      {requestItemsPreview.length ? (
                        <span>
                          Preview:{" "}
                          <span className="text-neutral-300">
                            {requestItemsPreview
                              .slice(0, 3)
                              .map((r) => `${r.desc} ×${r.qty}`)
                              .join(", ")}
                            {requestItemsPreview.length > 3 ? "…" : ""}
                          </span>
                        </span>
                      ) : (
                        <span>No requestable items yet.</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={createPartsRequest}
                      disabled={!canRequestParts}
                      className="inline-flex items-center justify-center rounded-full border border-[color:var(--accent-copper,#f97316)]/70 bg-black/70 px-4 py-2 text-xs font-semibold text-neutral-100 hover:bg-[color:var(--accent-copper,#f97316)]/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {requesting ? "Requesting…" : "Create parts request (internal)"}
                    </button>
                  </div>
                </div>
              </div>
              {/* end manual parts request */}
            </div>
          </div>

          {/* totals + save */}
          <div className="flex flex-col items-end gap-3 pt-2 text-sm md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-4 text-xs md:text-sm">
              <div className="text-neutral-300">
                Parts: <span className="text-white">{money(currency, partsTotal)}</span>
              </div>
              <div className="text-neutral-300">
                Labor: <span className="text-white">{money(currency, laborTotal)}</span>
              </div>
              <div className="text-neutral-300">
                Total:{" "}
                <span className="font-semibold text-[color:var(--accent-copper,#f97316)]">
                  {money(currency, subtotal)}
                </span>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--accent-copper,#f97316)]/80 bg-gradient-to-r from-black/80 via-[color:var(--accent-copper,#f97316)]/15 to-black/80 px-6 py-2 text-sm font-semibold text-neutral-50 shadow-[0_16px_36px_rgba(0,0,0,0.95)] backdrop-blur-md transition hover:border-[color:var(--accent-copper-light,#fed7aa)] hover:bg-[color:var(--accent-copper,#f97316)]/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save menu item"}
            </button>
          </div>
        </div>
      </section>

      {/* Saved items (collapsible + searchable) */}
      <section className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Saved menu items
            </h2>
            <div className="mt-1 text-[11px] text-neutral-500">
              Showing <span className="text-neutral-200">{filteredMenuItems.length}</span> of{" "}
              <span className="text-neutral-200">{menuItems.length}</span>
            </div>
          </div>

          <div className="w-full md:w-[420px]">
            <input
              value={savedQuery}
              onChange={(e) => setSavedQuery(e.target.value)}
              placeholder="Search saved menu items…"
              className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.9)] placeholder:text-neutral-500 backdrop-blur-md"
            />
          </div>
        </div>

        <details
          open
          className="metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 shadow-[0_16px_36px_rgba(0,0,0,0.95)] backdrop-blur-xl"
        >
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-neutral-100">
            Active <span className="text-neutral-500">• {activeMenuItems.length}</span>
          </summary>
          <div className="space-y-2 p-3 pt-0">
            {activeMenuItems.map((mi) => (
              <div
                key={mi.id}
                className="metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 p-3 shadow-[0_16px_36px_rgba(0,0,0,0.95)] backdrop-blur-xl"
              >
                <div className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[color:var(--accent-copper,#f97316)]">
                      {mi.name}
                    </div>

                    {mi.description ? (
                      <span className="block line-clamp-2 text-xs text-neutral-400">
                        {mi.description}
                      </span>
                    ) : null}

                    <div className="mt-1 text-[11px] text-neutral-500">
                      {mi.is_active ? "Active" : "Inactive"}
                      {mi.labor_time != null ? ` • ${mi.labor_time}h` : ""}
                      {mi.part_cost != null ? ` • parts ${money(currency, mi.part_cost)}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-xs text-neutral-300 md:text-sm">
                      {typeof mi.total_price === "number" ? (
                        <span>
                          Total{" "}
                          <span className="font-semibold text-neutral-50">
                            {money(currency, mi.total_price)}
                          </span>
                        </span>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => router.push(`/menu/item/${mi.id}`)}
                      className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-100 hover:border-orange-500 hover:bg-neutral-900"
                    >
                      View / Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {activeMenuItems.length === 0 && (
              <div className="text-sm text-neutral-400">No active items match your search.</div>
            )}
          </div>
        </details>

        <details className="metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 shadow-[0_16px_36px_rgba(0,0,0,0.95)] backdrop-blur-xl">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-neutral-100">
            Inactive <span className="text-neutral-500">• {inactiveMenuItems.length}</span>
          </summary>
          <div className="space-y-2 p-3 pt-0">
            {inactiveMenuItems.map((mi) => (
              <div
                key={mi.id}
                className="metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 p-3 shadow-[0_16px_36px_rgba(0,0,0,0.95)] backdrop-blur-xl"
              >
                <div className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[color:var(--accent-copper,#f97316)]">
                      {mi.name}
                    </div>

                    {mi.description ? (
                      <span className="block line-clamp-2 text-xs text-neutral-400">
                        {mi.description}
                      </span>
                    ) : null}

                    <div className="mt-1 text-[11px] text-neutral-500">
                      {mi.is_active ? "Active" : "Inactive"}
                      {mi.labor_time != null ? ` • ${mi.labor_time}h` : ""}
                      {mi.part_cost != null ? ` • parts ${money(currency, mi.part_cost)}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-xs text-neutral-300 md:text-sm">
                      {typeof mi.total_price === "number" ? (
                        <span>
                          Total{" "}
                          <span className="font-semibold text-neutral-50">
                            {money(currency, mi.total_price)}
                          </span>
                        </span>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => router.push(`/menu/item/${mi.id}`)}
                      className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-100 hover:border-orange-500 hover:bg-neutral-900"
                    >
                      View / Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {inactiveMenuItems.length === 0 && (
              <div className="text-sm text-neutral-400">No inactive items match your search.</div>
            )}
          </div>
        </details>

        {menuItems.length === 0 && (
          <div className="text-sm text-neutral-400">
            No menu items yet. Create your first service above.
          </div>
        )}
      </section>

      {/* Part picker modal (create form only) */}
      {pickerOpenForRow !== null && (
        <PartPicker
          open={true}
          onClose={() => setPickerOpenForRow(null)}
          onPick={(sel) => {
            const idx = pickerOpenForRow;
            setPickerOpenForRow(null);
            handlePickPart(idx)(sel);
          }}
        />
      )}
    </div>
  );
}
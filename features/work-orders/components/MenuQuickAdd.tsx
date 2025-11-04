"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database, TablesInsert } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderLineInsert = TablesInsert<"work_order_lines">;

type JobType = "maintenance" | "repair" | "diagnosis" | "inspection";

type PackageItem = {
  description: string;
  jobType?: JobType;
  laborHours?: number | null;
  notes?: string | null;
};

type PackageDef = {
  id: string;
  name: string;
  summary: string;
  jobType: "inspection" | "maintenance";
  estLaborHours: number | null;
  items: PackageItem[];
};

type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"];

// DB table has labor_hours, so add it if your generated type is missing it
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"] & {
  labor_hours?: number | null;
};

type VehicleLite = {
  id?: string | null;
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  license_plate?: string | null;
};

type CustomerLite = {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type PartToAllocate = {
  sku?: string | null;
  name?: string | null;
  qty: number;
};

type AddMenuParams =
  | {
      kind?: "normal";
      name: string;
      jobType: JobType;
      laborHours?: number | null;
      notes?: string | null;
      source?: "single" | "package" | "menu_item" | "ai" | "inspection";
      returnLineId?: boolean;
      partsToAllocate?: PartToAllocate[];
    }
  | {
      kind: "template";
      template: TemplateRow;
      name?: string;
      laborHours?: number | null;
    };

export function MenuQuickAdd({ workOrderId }: { workOrderId: string }) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  // curated packages
  const packages: PackageDef[] = [
    {
      id: "oil-gas",
      name: "Oil Change – Gasoline",
      jobType: "maintenance",
      estLaborHours: 0.8,
      summary: "Oil & filter, fluids, tire pressures, quick leak check.",
      items: [],
    },
    {
      id: "insp-gas",
      name: "Multi-Point Inspection – Gas",
      jobType: "inspection",
      estLaborHours: 1.0,
      summary: "Brakes, tires, suspension, battery, lights, codes scan.",
      items: [],
    },
    {
      id: "maintenance-50",
      name: "Maintenance 50",
      jobType: "inspection",
      estLaborHours: 1.0,
      summary: "50-point inspection checklist.",
      items: [],
    },
    {
      id: "maintenance-50-air",
      name: "Maintenance 50 – Air",
      jobType: "inspection",
      estLaborHours: 1.0,
      summary: "50-point inspection checklist (air systems focus).",
      items: [],
    },
  ];

  const [addingId, setAddingId] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<VehicleLite | null>(null);
  const [, setCustomer] = useState<CustomerLite | null>(null);
  const [woLineCount, setWoLineCount] = useState<number | null>(null);

  // saved menu items
  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);

  // inspection templates
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // shop context
  const [shopId, setShopId] = useState<string | null>(null);
  const shopReady = !!shopId;
  const vehicleId = vehicle?.id ?? null;

  // AI modal
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const lastSetShopId = useRef<string | null>(null);
  async function ensureShopContext(id: string | null) {
    if (!id) return;
    if (lastSetShopId.current === id) return;
    const { error } = await supabase.rpc("set_current_shop_id", { p_shop_id: id });
    if (!error) {
      lastSetShopId.current = id;
    } else {
      throw error;
    }
  }

  // bootstrap WO + related
  useEffect(() => {
    (async () => {
      const { data: wo } = await supabase
        .from("work_orders")
        .select("id, vehicle_id, customer_id, shop_id")
        .eq("id", workOrderId)
        .maybeSingle();

      setShopId(wo?.shop_id ?? null);

      if (wo?.vehicle_id) {
        const { data: v } = await supabase
          .from("vehicles")
          .select("id, year, make, model, vin, license_plate")
          .eq("id", wo.vehicle_id)
          .maybeSingle();
        if (v) setVehicle(v as VehicleLite);
      } else {
        setVehicle(null);
      }

      if (wo?.customer_id) {
        const { data: c } = await supabase
          .from("customers")
          .select("id, first_name, last_name, phone, email")
          .eq("id", wo.customer_id)
          .maybeSingle();
        if (c) setCustomer(c as CustomerLite);
      } else {
        setCustomer(null);
      }

      const { count } = await supabase
        .from("work_order_lines")
        .select("*", { count: "exact", head: true })
        .eq("work_order_id", workOrderId);
      setWoLineCount(typeof count === "number" ? count : null);
    })();
  }, [supabase, workOrderId]);

  // load saved menu items
  const loadMenuItems = useCallback(async () => {
    setMenuLoading(true);
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      setMenuItems(data ?? []);
    } catch {
      // ignore
    } finally {
      setMenuLoading(false);
    }
  }, [supabase]);

  // load inspection templates (mine + public)
  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
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
        ...(Array.isArray(mineRaw) ? mineRaw : []),
        ...(Array.isArray(sharedRaw) ? sharedRaw : []),
      ]);
    } catch {
      // ignore
    } finally {
      setTemplatesLoading(false);
    }
  }, [supabase]);

  // initial loads
  useEffect(() => {
    void loadMenuItems();
    void loadTemplates();
  }, [loadMenuItems, loadTemplates]);

  // ============================================================
  // add line (menu or template)
  // ============================================================
  async function addMenuItem(params: AddMenuParams): Promise<string | null> {
    if (!shopReady) return null;

    setAddingId(params.kind === "template" ? params.template.id : params.name);
    try {
      await ensureShopContext(shopId);

      // template-backed line
      if (params.kind === "template") {
        const line: WorkOrderLineInsert & { inspection_template_id?: string | null } = {
          work_order_id: workOrderId,
          vehicle_id: vehicleId,
          description:
            params.name ?? params.template.template_name ?? "Inspection",
          job_type: "inspection",
          labor_time:
            params.laborHours ??
            (typeof params.template.labor_hours === "number"
              ? params.template.labor_hours
              : null),
          status: "awaiting",
          priority: 3,
          notes: params.template.description ?? null,
          shop_id: shopId!,
          inspection_template_id: params.template.id,
        };

        const { data, error } = await supabase
          .from("work_order_lines")
          .insert(line)
          .select("id")
          .single();

        if (error) throw error;

        window.dispatchEvent(new CustomEvent("wo:line-added"));
        toast.success("Inspection added");
        return data?.id ?? null;
      }

      // normal branch
      const line: WorkOrderLineInsert = {
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        description: params.name,
        job_type: params.jobType,
        labor_time: params.laborHours ?? null,
        status: "awaiting",
        priority: 3,
        notes: params.notes ?? null,
        shop_id: shopId!,
      };

      const { data, error } = await supabase
        .from("work_order_lines")
        .insert(line)
        .select("id")
        .single();

      if (error) throw error;

      if (params.partsToAllocate && params.partsToAllocate.length && data?.id) {
        await autoAllocateExplicitParts(params.partsToAllocate, data.id);
      }

      window.dispatchEvent(new CustomEvent("wo:line-added"));
      toast.success(
        params.source === "ai"
          ? "AI suggestion added"
          : params.source === "menu_item"
          ? "Menu item added"
          : "Job added",
      );

      return params.returnLineId ? (data?.id ?? null) : null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to add job.";
      lastSetShopId.current = null;
      toast.error(msg);
      return null;
    } finally {
      setAddingId(null);
    }
  }

  // ---------- allocation helpers ----------
  type MenuItemPartRow = {
    id: string;
    name: string | null;
    sku: string | null;
    quantity: number | null;
    unit_cost: number | null;
  };

  async function findPartIdForShop({
    sku,
    name,
    shop,
  }: {
    sku?: string | null;
    name?: string | null;
    shop: string;
  }): Promise<string | null> {
    if (sku) {
      const bySku = await supabase
        .from("parts")
        .select("id")
        .eq("shop_id", shop)
        .eq("sku", sku)
        .limit(1)
        .maybeSingle();
      if (!bySku.error && bySku.data?.id) return bySku.data.id;
    }
    if (name) {
      const byName = await supabase
        .from("parts")
        .select("id")
        .eq("shop_id", shop)
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if (byName.data?.id) return byName.data.id;
    }
    return null;
  }

  async function pickDefaultLocationId(
    partId: string,
    shop: string,
  ): Promise<string | null> {
    const withStock = await supabase
      .from("part_stock")
      .select("location_id, qty")
      .eq("part_id", partId)
      .order("qty", { ascending: false })
      .limit(1);

    if (!withStock.error && withStock.data?.length) {
      return withStock.data[0].location_id as unknown as string;
    }

    const anyLoc = await supabase
      .from("stock_locations")
      .select("id")
      .eq("shop_id", shop)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    return anyLoc.data?.id ?? null;
  }

  async function autoAllocateMenuParts(
    menuItemId: string,
    workOrderLineId: string,
  ) {
    if (!shopId) return;

    const { data: rows, error } = await supabase
      .from("menu_item_parts")
      .select("id, name, sku, quantity, unit_cost")
      .eq("menu_item_id", menuItemId);

    if (error) {
      toast.message("Added job, but couldn't read menu parts.");
      return;
    }

    const mParts = (rows ?? []) as MenuItemPartRow[];
    const allocations: {
      work_order_line_id: string;
      part_id: string;
      location_id: string;
      qty: number;
    }[] = [];

    for (const p of mParts) {
      const qty =
        typeof p.quantity === "number" && p.quantity > 0 ? p.quantity : 0;
      if (!qty) continue;

      const partId = await findPartIdForShop({
        sku: p.sku ?? undefined,
        name: p.name ?? undefined,
        shop: shopId,
      });
      if (!partId) {
        toast.message(
          `Skipped "${p.name ?? p.sku ?? "part"}" (not in Parts).`,
        );
        continue;
      }
      const locId = await pickDefaultLocationId(partId, shopId);
      if (!locId) {
        toast.message(
          `Skipped "${p.name ?? p.sku ?? "part"}" (no stock location).`,
        );
        continue;
      }
      allocations.push({
        work_order_line_id: workOrderLineId,
        part_id: partId,
        location_id: locId,
        qty,
      });
    }

    if (!allocations.length) return;

    const { error: allocErr } = await supabase
      .from("work_order_part_allocations")
      .insert(allocations);
    if (allocErr) {
      toast.warning("Job added, but parts couldn't be allocated.");
    } else {
      window.dispatchEvent(new CustomEvent("wo:parts-used"));
      toast.success(
        `Allocated ${allocations.length} part${
          allocations.length > 1 ? "s" : ""
        }`,
      );
    }
  }

  async function autoAllocateExplicitParts(
    list: PartToAllocate[],
    workOrderLineId: string,
  ) {
    if (!shopId || !list.length) return;

    const allocations: {
      work_order_line_id: string;
      part_id: string;
      location_id: string;
      qty: number;
    }[] = [];

    for (const raw of list) {
      const qty = typeof raw.qty === "number" && raw.qty > 0 ? raw.qty : 0;
      if (!qty) continue;

      const partId = await findPartIdForShop({
        sku: raw.sku ?? undefined,
        name: raw.name ?? undefined,
        shop: shopId,
      });
      if (!partId) continue;

      const locId = await pickDefaultLocationId(partId, shopId);
      if (!locId) continue;

      allocations.push({
        work_order_line_id: workOrderLineId,
        part_id: partId,
        location_id: locId,
        qty,
      });
    }

    if (!allocations.length) return;
    const { error } = await supabase
      .from("work_order_part_allocations")
      .insert(allocations);
    if (!error) window.dispatchEvent(new CustomEvent("wo:parts-used"));
  }

  // tiny wrappers
  async function addPackage(pkg: PackageDef) {
    await addMenuItem({
      kind: "normal",
      name: pkg.name,
      jobType: pkg.jobType === "inspection" ? "inspection" : "maintenance",
      laborHours: pkg.estLaborHours ?? null,
      notes: pkg.summary,
      source: "package",
    });
  }

  async function addSavedMenuItem(mi: MenuItemRow) {
    const lineId = await addMenuItem({
      kind: "normal",
      name: mi.name ?? "Service",
      jobType: "maintenance",
      laborHours:
        typeof mi.labor_time === "number"
          ? mi.labor_time
          : // fallback in case you add labor_hours to menu_items later
            null,
      notes: mi.description ?? null,
      source: "menu_item",
      returnLineId: true,
    });
    if (lineId && mi.id) {
      await autoAllocateMenuParts(mi.id, lineId);
    }
  }

  async function addTemplateAsLine(t: TemplateRow) {
    await addMenuItem({
      kind: "template",
      template: t,
    });
  }

  // AI
  async function runAiSuggest() {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    try {
      const res = await fetch("/api/ai/menu/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          vehicle: vehicle
            ? {
                year: vehicle.year,
                make: vehicle.make,
                model: vehicle.model,
              }
            : null,
        }),
      });
      const j = (await res.json()) as {
        items?: {
          name: string;
          jobType: JobType;
          laborHours?: number | null;
          notes?: string | null;
          parts?: PartToAllocate[];
        }[];
        error?: string;
      };
      if (!res.ok || j.error) throw new Error(j.error || "AI suggestion failed");

      const items = (j.items ?? []).slice(0, 5);
      if (!items.length) {
        toast.message("No suggestions returned.");
        return;
      }

      for (const it of items) {
        await addMenuItem({
          kind: "normal",
          name: it.name,
          jobType: it.jobType,
          laborHours: it.laborHours ?? null,
          notes: it.notes ?? null,
          partsToAllocate: Array.isArray(it.parts) ? it.parts : undefined,
          source: "ai",
        });
      }
      setAiOpen(false);
      setAiPrompt("");
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Could not get suggestions.";
      toast.error(msg);
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick header */}
      <div className="flex items-center justify-between">
        <h3 className="w-full text-center font-semibold text-orange-400">
          Quick Add
        </h3>
        <div className="absolute right-0 flex items-center gap-2 pr-0 sm:pr-0">
          <button
            type="button"
            onClick={() =>
              router.push(`/work-orders/quote-review?woId=${workOrderId}`)
            }
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm hover:bg-neutral-900"
          >
            Review Quote
            {typeof woLineCount === "number" && woLineCount > 0
              ? ` (${woLineCount})`
              : ""}
          </button>
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-300 hover:bg-blue-900/20"
            title="Describe work and let AI suggest service lines"
          >
            AI Suggest
          </button>
        </div>
      </div>

      {/* Packages */}
      <div>
        <div className="mb-2 flex items-center justify-center">
          <h4 className="text-center font-semibold text-neutral-200">
            Packages
          </h4>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {packages.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => addPackage(p)}
              disabled={addingId === p.id || !shopReady}
              className="rounded border border-neutral-800 bg-neutral-950 p-3 text-left hover:bg-neutral-900 disabled:opacity-60"
              title={p.summary}
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-neutral-400">
                {p.jobType} •{" "}
                {p.estLaborHours != null
                  ? `~${p.estLaborHours.toFixed(1)}h`
                  : "—"}
              </div>
              <div className="mt-1 line-clamp-2 text-xs text-neutral-500">
                {p.summary}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Inspection templates */}
      <div>
        <div className="mb-2 flex items-center justify-center">
          <h4 className="text-center font-semibold text-neutral-200">
            Inspection Templates
          </h4>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {templatesLoading && (
            <div className="w-full text-center text-sm text-neutral-400">
              Loading…
            </div>
          )}
          {!templatesLoading &&
            (templates.length ? (
              templates.slice(0, 9).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => addTemplateAsLine(t)}
                  disabled={addingId === t.id || !shopReady}
                  className="rounded border border-neutral-800 bg-neutral-950 p-3 text-left hover:bg-neutral-900 disabled:opacity-60"
                  title={t.description ?? undefined}
                >
                  <div className="font-medium">
                    {t.template_name ?? "Inspection"}
                  </div>
                  <div className="text-xs text-neutral-400">
                    inspection •{" "}
                    {typeof t.labor_hours === "number"
                      ? `${t.labor_hours.toFixed(1)}h`
                      : "—"}
                  </div>
                </button>
              ))
            ) : (
              <div className="w-full text-center text-sm text-neutral-400">
                No templates yet.
              </div>
            ))}
        </div>
      </div>

      {/* From My Menu */}
      <div>
        <div className="mb-2 flex items-center justify-center">
          <h4 className="text-center font-semibold text-neutral-200">
            From My Menu
          </h4>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {menuLoading && (
            <div className="w-full text-center text-sm text-neutral-400">
              Loading…
            </div>
          )}
          {!menuLoading &&
            (menuItems.length ? (
              menuItems.slice(0, 9).map((mi) => (
                <button
                  type="button"
                  key={mi.id}
                  onClick={() => addSavedMenuItem(mi)}
                  disabled={addingId === (mi.name ?? "") || !shopReady}
                  className="rounded border border-neutral-800 bg-neutral-950 p-3 text-left hover:bg-neutral-900 disabled:opacity-60"
                  title={mi.description ?? undefined}
                >
                  <div className="font-medium">{mi.name}</div>
                  <div className="text-xs text-neutral-400">
                    {/* prefer labor_time, but fall back if you later add labor_hours to this table */}
                    {typeof mi.labor_time === "number"
                      ? `${mi.labor_time.toFixed(1)}h`
                      : "—"}{" "}
                    •{" "}
                    {typeof mi.total_price === "number"
                      ? `$${mi.total_price.toFixed(0)}`
                      : "—"}
                  </div>
                </button>
              ))
            ) : (
              <div className="w-full text-center text-sm text-neutral-400">
                No saved menu items yet.
              </div>
            ))}
        </div>
      </div>

      {/* AI modal */}
      {aiOpen && (
        <div className="fixed inset-0 z-[300] grid place-items-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setAiOpen(false)}
          />
          <div
            className="relative z-[310] w-full max-w-xl rounded border border-orange-400 bg-neutral-950 p-4 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold">AI: Suggest Services</div>
              <button
                type="button"
                className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
                onClick={() => setAiOpen(false)}
              >
                ✕
              </button>
            </div>
            <textarea
              rows={4}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
              placeholder="Describe the issue or request…"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
                onClick={() => setAiOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={aiBusy}
                className="rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-300 hover:bg-blue-900/20 disabled:opacity-60"
                onClick={runAiSuggest}
              >
                {aiBusy ? "Thinking…" : "Suggest & Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
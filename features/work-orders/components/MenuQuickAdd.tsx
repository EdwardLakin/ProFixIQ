"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database, TablesInsert } from "@shared/types/types/supabase";
import { AiSuggestModal } from "@work-orders/components/AiSuggestModal";

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

  // AI modal (new, using shared AiSuggestModal)
  const [aiOpen, setAiOpen] = useState(false);

  // shop context setter (session var; good for SELECT policies, but not enough for INSERT)
  const lastSetShopId = useRef<string | null>(null);
  async function ensureShopContext(id: string | null) {
    if (!id) return;
    if (lastSetShopId.current === id) return;
    const { error } = await supabase.rpc("set_current_shop_id", {
      p_shop_id: id,
    });
    if (!error) {
      lastSetShopId.current = id;
    } else {
      throw error;
    }
  }

  /**
   * Critical: your INSERT RLS policy on work_order_lines checks:
   * work_orders.shop_id == profiles.shop_id for (profiles.id = auth.uid OR profiles.user_id = auth.uid)
   * So we must ensure the current user's profile is linked to the same shop as the WO.
   *
   * If profile.shop_id is null, we can safely self-heal by writing shop_id.
   * If it’s set to a different shop, we must hard-fail with a clear message.
   */
  async function ensureProfileLinkedToShop(targetShopId: string) {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    const uid = auth?.user?.id;
    if (!uid) throw new Error("Not signed in.");

    const { data: prof, error } = await supabase
      .from("profiles")
      .select("id, user_id, shop_id")
      .or(`id.eq.${uid},user_id.eq.${uid}`)
      .maybeSingle();

    if (error) throw error;
    if (!prof) {
      throw new Error(
        "No profile row found for this user. Ensure profiles has a row where id=auth.uid() (or user_id=auth.uid()).",
      );
    }

    if (!prof.shop_id) {
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ shop_id: targetShopId })
        .or(`id.eq.${uid},user_id.eq.${uid}`);
      if (updErr) throw updErr;
      return;
    }

    if (prof.shop_id !== targetShopId) {
      throw new Error(
        `Shop mismatch: your profile is linked to ${prof.shop_id} but this work order is ${targetShopId}.`,
      );
    }
  }

  // bootstrap WO + related (shop, vehicle, customer, line count)
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

  // load saved menu items – prefer matches for this vehicle’s YMM
  const loadMenuItems = useCallback(async () => {
    if (!shopId) return;

    setMenuLoading(true);
    try {
      const vYear =
        typeof vehicle?.year === "number"
          ? vehicle.year
          : typeof vehicle?.year === "string"
          ? parseInt(vehicle.year, 10)
          : null;

      const vMake =
        typeof vehicle?.make === "string" && vehicle.make.trim().length
          ? vehicle.make.trim()
          : null;

      const vModel =
        typeof vehicle?.model === "string" && vehicle.model.trim().length
          ? vehicle.model.trim()
          : null;

      let preferred: MenuItemRow[] = [];
      let others: MenuItemRow[] = [];

      if (vYear || vMake || vModel) {
        // 1) items that match this vehicle’s YMM
        let q = supabase
          .from("menu_items")
          .select("*")
          .eq("shop_id", shopId)
          .eq("is_active", true)
          .order("created_at", { ascending: false });

        if (vYear) q = q.eq("vehicle_year", vYear);
        if (vMake) q = q.ilike("vehicle_make", vMake);
        if (vModel) q = q.ilike("vehicle_model", vModel);

        const { data: exact, error: exactErr } = await q.limit(20);
        if (exactErr) throw exactErr;
        preferred = (exact ?? []) as MenuItemRow[];

        const excludeIds = preferred.map((mi) => mi.id);
        // 2) recent active items for this shop, excluding the ones already in preferred
        let fbQuery = supabase
          .from("menu_items")
          .select("*")
          .eq("shop_id", shopId)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(30);

        if (excludeIds.length) {
          fbQuery = fbQuery.not("id", "in", `(${excludeIds.join(",")})`);
        }

        const { data: fb, error: fbErr } = await fbQuery;
        if (fbErr) throw fbErr;
        others = (fb ?? []) as MenuItemRow[];
      } else {
        // No vehicle context yet: just recent active menu items for this shop
        const { data, error } = await supabase
          .from("menu_items")
          .select("*")
          .eq("shop_id", shopId)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        preferred = (data ?? []) as MenuItemRow[];
        others = [];
      }

      setMenuItems([...preferred, ...others]);
    } catch {
      // ignore; soft fail
    } finally {
      setMenuLoading(false);
    }
  }, [supabase, shopId, vehicle]);

  // load inspection templates (owner + public + same-shop via RLS)
  const loadTemplates = useCallback(async () => {
    if (!shopId) return;

    setTemplatesLoading(true);
    try {
      // Make sure current_shop_id is set so shop-wide SELECT RLS kicks in
      await ensureShopContext(shopId);

      const [{ data: auth }, { data, error }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("inspection_templates")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

      if (error) throw error;

      const uid = auth?.user?.id ?? null;
      const rows = (data ?? []) as TemplateRow[];

      // Sort: mine → same-shop → public → rest
      const score = (t: TemplateRow): number => {
        if (uid && t.user_id === uid) return 0;
        if (t.shop_id && t.shop_id === shopId) return 1;
        if (t.is_public) return 2;
        return 3;
      };

      rows.sort((a, b) => score(a) - score(b));
      setTemplates(rows);
    } catch {
      // ignore; soft fail – user just sees "No templates yet"
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }, [supabase, shopId]);

  // initial loads
  useEffect(() => {
    if (shopId) {
      void loadMenuItems();
      void loadTemplates();
    }
  }, [shopId, loadMenuItems, loadTemplates]);

  // ============================================================
  // add line (menu or template)
  // ============================================================
  async function addMenuItem(params: AddMenuParams): Promise<string | null> {
    if (!shopReady || !shopId) return null;

    setAddingId(params.kind === "template" ? params.template.id : params.name);
    try {
      // ✅ Critical: make INSERT RLS pass
      await ensureProfileLinkedToShop(shopId);

      // Optional: helps SELECT policies / other reads
      await ensureShopContext(shopId);

      // template-backed line
      if (params.kind === "template") {
        const line: WorkOrderLineInsert & {
          inspection_template_id?: string | null;
        } = {
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
          shop_id: shopId,
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
        shop_id: shopId,
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
      const msg =
        e instanceof Error ? e.message : "Failed to add job (RLS blocked).";
      lastSetShopId.current = null;

      // Make the RLS cause obvious in the toast
      if (/row-level security/i.test(msg)) {
        toast.error(
          "Blocked by RLS. Your profile shop_id likely doesn’t match this work order’s shop.",
        );
      } else {
        toast.error(msg);
      }
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
          typeof (mi as any).labor_hours === "number"
          ? (mi as any).labor_hours
          : null,
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

  const vehicleLabel =
    vehicle && (vehicle.year || vehicle.make || vehicle.model)
      ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim()
      : vehicle?.license_plate
      ? `Plate ${vehicle.license_plate}`
      : null;

  return (
    <div className="space-y-5 text-white">
      {/* Header / context */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-3 sm:px-4 sm:py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-orange-400">
                Quick Add Jobs
              </h3>
              <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] font-mono text-neutral-300">
                WO {workOrderId.slice(0, 8)}…
              </span>
            </div>
            {vehicleLabel && (
              <p className="text-[11px] text-neutral-400">
                Vehicle:&nbsp;
                <span className="font-medium text-neutral-200">
                  {vehicleLabel}
                </span>
              </p>
            )}
            {!vehicleLabel && (
              <p className="text-[11px] text-neutral-500">
                Add lines now — you can update vehicle details later.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() =>
                router.push(`/work-orders/quote-review?woId=${workOrderId}`)
              }
              className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs sm:text-sm text-neutral-100 hover:border-orange-500 hover:bg-neutral-800"
            >
              Review quote
              {typeof woLineCount === "number" && woLineCount > 0
                ? ` (${woLineCount})`
                : ""}
            </button>
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className="rounded-md border border-blue-600 bg-neutral-950 px-3 py-1.5 text-xs sm:text-sm text-blue-300 hover:bg-blue-900/30"
              title="Describe work and let AI suggest service lines"
            >
              AI Suggest
            </button>
          </div>
        </div>
      </div>

      {/* Packages */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
            Packages
          </h4>
          <p className="text-[10px] text-neutral-500">
            Common services with pre-set labor & notes.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {packages.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => addPackage(p)}
              disabled={addingId === p.id || !shopReady}
              className="flex flex-col rounded-md border border-neutral-800 bg-neutral-950 p-3 text-left text-sm hover:border-orange-500/70 hover:bg-neutral-900 disabled:opacity-60"
              title={p.summary}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-neutral-50">{p.name}</span>
                <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
                  {p.jobType}
                </span>
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                {p.estLaborHours != null
                  ? `~${p.estLaborHours.toFixed(1)}h`
                  : "Labor TBD"}
              </div>
              <div className="mt-1 line-clamp-2 text-[11px] text-neutral-500">
                {p.summary}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Inspection templates */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
            Inspection Templates
          </h4>
          <p className="text-[10px] text-neutral-500">
            Saved/standard inspections you can attach as jobs.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {templatesLoading && (
            <div className="col-span-full w-full py-2 text-center text-sm text-neutral-400">
              Loading templates…
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
                  className="flex flex-col rounded-md border border-neutral-800 bg-neutral-950 p-3 text-left text-sm hover:border-orange-500/70 hover:bg-neutral-900 disabled:opacity-60"
                  title={t.description ?? undefined}
                >
                  <span className="font-medium text-neutral-50">
                    {t.template_name ?? "Inspection"}
                  </span>
                  <div className="mt-1 text-xs text-neutral-400">
                    inspection •{" "}
                    {typeof t.labor_hours === "number"
                      ? `${t.labor_hours.toFixed(1)}h`
                      : "Labor TBD"}
                  </div>
                  {t.description && (
                    <div className="mt-1 line-clamp-2 text-[11px] text-neutral-500">
                      {t.description}
                    </div>
                  )}
                </button>
              ))
            ) : (
              <div className="col-span-full w-full py-2 text-center text-sm text-neutral-400">
                No templates yet.
              </div>
            ))}
        </div>
      </div>

      {/* From My Menu (vehicle-matched first) */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
            From My Menu
          </h4>
          <p className="text-[10px] text-neutral-500">
            Saved services — best matches for this vehicle are shown first.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {menuLoading && (
            <div className="col-span-full w-full py-2 text-center text-sm text-neutral-400">
              Loading menu items…
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
                  className="flex flex-col rounded-md border border-neutral-800 bg-neutral-950 p-3 text-left text-sm hover:border-orange-500/70 hover:bg-neutral-900 disabled:opacity-60"
                  title={mi.description ?? undefined}
                >
                  <span className="font-medium text-neutral-50">{mi.name}</span>
                  <div className="mt-1 text-xs text-neutral-400">
                    {typeof mi.labor_time === "number"
                      ? `${mi.labor_time.toFixed(1)}h`
                      : typeof (mi as any).labor_hours === "number"
                      ? `${(mi as any).labor_hours.toFixed(1)}h`
                      : "Labor TBD"}{" "}
                    •{" "}
                    {typeof mi.total_price === "number"
                      ? `$${mi.total_price.toFixed(0)}`
                      : "No price"}
                  </div>
                  {mi.vehicle_year || mi.vehicle_make || mi.vehicle_model ? (
                    <div className="mt-1 text-[10px] text-neutral-500">
                      {[
                        mi.vehicle_year ?? "",
                        mi.vehicle_make ?? "",
                        mi.vehicle_model ?? "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                  ) : null}
                  {mi.description && (
                    <div className="mt-1 line-clamp-2 text-[11px] text-neutral-500">
                      {mi.description}
                    </div>
                  )}
                </button>
              ))
            ) : (
              <div className="col-span-full w-full py-2 text-center text-sm text-neutral-400">
                No saved menu items yet.
              </div>
            ))}
        </div>
      </div>

      {/* New shared AI Suggest modal */}
      <AiSuggestModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        workOrderId={workOrderId}
        vehicleId={vehicleId ?? null}
        vehicleLabel={vehicleLabel ?? null}
        onAdded={(count) => {
          setWoLineCount((prev) =>
            typeof prev === "number" ? prev + count : prev,
          );
        }}
      />
    </div>
  );
}

export default MenuQuickAdd;
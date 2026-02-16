// features/work-orders/components/MenuQuickAdd.tsx
// FULL FILE REPLACEMENT
//
// Fix: Menu item parts not allocating into work order
// - Uses server action allocateMenuItemParts() (which calls consumePart())
// - Correct input shape: { menu_item_id, work_order_line_id } (NO work_order_id)
// - Surfaces errors + shows allocated/skipped counts
// - Keeps existing shop context logic for menu/template loading

"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database, TablesInsert } from "@shared/types/types/supabase";
import { AiSuggestModal } from "@work-orders/components/AiSuggestModal";
import { calculateTax, type ProvinceCode } from "@/features/integrations/tax";

// ✅ server action that reads menu_item_parts + calls consumePart()
import { allocateMenuItemParts } from "@/features/work-orders/lib/parts/allocateMenuItemParts";

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

type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"] & {
  labor_hours?: number | null;
};

type VehicleLite = {
  id?: string | null;
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
  submodel?: string | null;
  engine_type?: string | null;
  transmission_type?: string | null;
  drivetrain?: string | null;
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

type AddMenuParams =
  | {
      kind?: "normal";
      name: string;
      jobType: JobType;
      laborHours?: number | null;
      notes?: string | null;
      source?: "single" | "package" | "menu_item" | "ai" | "inspection";
      returnLineId?: boolean;
      menuItemIdForParts?: string | null;
    }
  | {
      kind: "template";
      template: TemplateRow;
      name?: string;
      laborHours?: number | null;
    };

type ShopDefaults = {
  country: "US" | "CA";
  province: string | null;
  timezone: string | null;
  labor_rate: number | null;
  tax_rate: number | null; // percent in DB (e.g. 5 => 5%)
};

function normStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}
function normLower(v: unknown): string | null {
  const s = normStr(v);
  return s ? s.toLowerCase() : null;
}
function normYear(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isGlobalMenuItem(mi: MenuItemRow): boolean {
  const has =
    mi.vehicle_year != null ||
    !!normStr(mi.vehicle_make) ||
    !!normStr(mi.vehicle_model) ||
    !!normStr(mi.submodel) ||
    !!normStr(mi.engine_type) ||
    !!normStr(mi.transmission_type) ||
    !!normStr(mi.drivetrain);
  return !has;
}

function scoreMenuItemFit(args: { mi: MenuItemRow; vehicle: VehicleLite | null }): number {
  const { mi, vehicle } = args;
  if (!vehicle) return isGlobalMenuItem(mi) ? 5 : 0;

  const vYear = normYear(vehicle.year);
  const vMake = normLower(vehicle.make);
  const vModel = normLower(vehicle.model);
  const vSub = normLower(vehicle.submodel);
  const vEng = normLower(vehicle.engine_type);
  const vTrans = normLower(vehicle.transmission_type);
  const vDrive = normLower(vehicle.drivetrain);

  const miYear = mi.vehicle_year ?? null;
  const miMake = normLower(mi.vehicle_make);
  const miModel = normLower(mi.vehicle_model);
  const miSub = normLower(mi.submodel);
  const miEng = normLower(mi.engine_type);
  const miTrans = normLower(mi.transmission_type);
  const miDrive = normLower(mi.drivetrain);

  if (miYear != null && vYear != null && miYear !== vYear) return 0;
  if (miMake && vMake && miMake !== vMake) return 0;
  if (miModel && vModel && miModel !== vModel) return 0;
  if (miSub && vSub && miSub !== vSub) return 0;
  if (miEng && vEng && miEng !== vEng) return 0;
  if (miTrans && vTrans && miTrans !== vTrans) return 0;
  if (miDrive && vDrive && miDrive !== vDrive) return 0;

  let score = 0;

  if (miYear != null && vYear != null && miYear === vYear) score += 30;
  else if (miYear == null) score += 8;

  if (miMake && vMake && miMake === vMake) score += 25;
  else if (!miMake) score += 6;

  if (miModel && vModel && miModel === vModel) score += 25;
  else if (!miModel) score += 6;

  if (miSub && vSub && miSub === vSub) score += 10;
  else if (!miSub) score += 2;

  if (miEng && vEng && miEng === vEng) score += 6;
  else if (!miEng) score += 1;

  if (miTrans && vTrans && miEng === vEng) score += 0;

  if (miTrans && vTrans && miTrans === vTrans) score += 6;
  else if (!miTrans) score += 1;

  if (miDrive && vDrive && miDrive === vDrive) score += 6;
  else if (!miDrive) score += 1;

  return score;
}

function menuSearchHit(mi: MenuItemRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;

  const hay = [
    mi.name,
    mi.description,
    mi.category,
    mi.service_key,
    mi.complaint,
    mi.cause,
    mi.correction,
  ]
    .map((x) => (typeof x === "string" ? x : ""))
    .join(" ")
    .toLowerCase();

  return hay.includes(needle);
}

function isProvinceCode(v: string): v is ProvinceCode {
  return (
    v === "AB" ||
    v === "BC" ||
    v === "MB" ||
    v === "NB" ||
    v === "NL" ||
    v === "NS" ||
    v === "NT" ||
    v === "NU" ||
    v === "ON" ||
    v === "PE" ||
    v === "QC" ||
    v === "SK" ||
    v === "YT"
  );
}

function moneyLabel(currency: "CAD" | "USD", amount: number): string {
  const rounded = Number.isFinite(amount) ? amount : 0;
  return `${currency} $${rounded.toFixed(0)}`;
}

function calcMenuTotals(args: {
  mi: MenuItemRow;
  shop: ShopDefaults | null;
}): {
  laborHours: number;
  laborRate: number;
  laborTotal: number;
  partsTotal: number;
  subtotal: number;
  taxTotal: number;
  total: number;
  taxLabel: string | null;
} {
  const { mi, shop } = args;

  const laborHours =
    typeof mi.labor_time === "number" && Number.isFinite(mi.labor_time) ? mi.labor_time : 0;

  const partsTotal =
    typeof mi.part_cost === "number" && Number.isFinite(mi.part_cost) ? mi.part_cost : 0;

  const laborRate =
    shop && typeof shop.labor_rate === "number" && Number.isFinite(shop.labor_rate)
      ? shop.labor_rate
      : 0;

  const laborTotal = laborHours * laborRate;
  const subtotal = partsTotal + laborTotal;

  if (shop?.country === "CA") {
    const prov = (shop.province ?? "").trim().toUpperCase();
    if (isProvinceCode(prov)) {
      const res = calculateTax(subtotal, prov);
      const taxTotal = res.taxes.reduce((a, t) => a + t.amount, 0);
      const taxLabel = res.taxes.map((t) => t.label).join("+") || null;
      return {
        laborHours,
        laborRate,
        laborTotal,
        partsTotal,
        subtotal,
        taxTotal,
        total: res.total,
        taxLabel,
      };
    }
  }

  const pct =
    shop && typeof shop.tax_rate === "number" && Number.isFinite(shop.tax_rate)
      ? shop.tax_rate / 100
      : 0;

  const taxTotal = subtotal * pct;
  return {
    laborHours,
    laborRate,
    laborTotal,
    partsTotal,
    subtotal,
    taxTotal,
    total: subtotal + taxTotal,
    taxLabel: pct > 0 ? "Tax" : null,
  };
}

export function MenuQuickAdd({ workOrderId }: { workOrderId: string }) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

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

  const [menuItemsAll, setMenuItemsAll] = useState<MenuItemRow[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const [shopId, setShopId] = useState<string | null>(null);
  const shopReady = !!shopId;
  const vehicleId = vehicle?.id ?? null;

  const [shopDefaults, setShopDefaults] = useState<ShopDefaults | null>(null);

  const [aiOpen, setAiOpen] = useState(false);

  const [menuQuery, setMenuQuery] = useState("");
  const [includeGlobal, setIncludeGlobal] = useState(true);

  const lastSetShopId = useRef<string | null>(null);

  const ensureShopContext = useCallback(
    async (id: string | null) => {
      if (!id) return;
      if (lastSetShopId.current === id) return;

      const { error } = await supabase.rpc("set_current_shop_id", {
        p_shop_id: id,
      });

      if (error) throw new Error(error.message || "Failed to set shop context");
      lastSetShopId.current = id;
    },
    [supabase],
  );

  useEffect(() => {
    void (async () => {
      const { data: wo, error: woErr } = await supabase
        .from("work_orders")
        .select("id, vehicle_id, customer_id, shop_id")
        .eq("id", workOrderId)
        .maybeSingle();

      if (woErr) {
        toast.error(woErr.message);
        return;
      }

      const sid = wo?.shop_id ?? null;
      setShopId(sid);

      if (sid) {
        const { data: s, error: sErr } = await supabase
          .from("shops")
          .select("country, province, timezone, labor_rate, tax_rate")
          .eq("id", sid)
          .maybeSingle();

        if (sErr) {
          toast.message(sErr.message);
          setShopDefaults(null);
        } else {
          const countrySafe: "US" | "CA" = s?.country === "CA" ? "CA" : "US";
          setShopDefaults({
            country: countrySafe,
            province: typeof s?.province === "string" ? s.province : null,
            timezone: typeof s?.timezone === "string" ? s.timezone : null,
            labor_rate: typeof s?.labor_rate === "number" ? s.labor_rate : null,
            tax_rate: typeof s?.tax_rate === "number" ? s.tax_rate : null,
          });
        }
      } else {
        setShopDefaults(null);
      }

      if (wo?.vehicle_id) {
        const { data: v, error: vErr } = await supabase
          .from("vehicles")
          .select(
            "id, year, make, model, submodel, engine_type, transmission_type, drivetrain, vin, license_plate",
          )
          .eq("id", wo.vehicle_id)
          .maybeSingle();
        if (vErr) toast.message(vErr.message);
        setVehicle(v ? (v as VehicleLite) : null);
      } else {
        setVehicle(null);
      }

      if (wo?.customer_id) {
        const { data: c, error: cErr } = await supabase
          .from("customers")
          .select("id, first_name, last_name, phone, email")
          .eq("id", wo.customer_id)
          .maybeSingle();
        if (cErr) toast.message(cErr.message);
        setCustomer(c ? (c as CustomerLite) : null);
      } else {
        setCustomer(null);
      }

      const { count, error: cntErr } = await supabase
        .from("work_order_lines")
        .select("*", { count: "exact", head: true })
        .eq("work_order_id", workOrderId);

      if (cntErr) toast.message(cntErr.message);
      setWoLineCount(typeof count === "number" ? count : null);
    })();
  }, [supabase, workOrderId]);

  const loadMenuItems = useCallback(async () => {
    if (!shopId) return;

    setMenuLoading(true);
    try {
      await ensureShopContext(shopId);

      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("shop_id", shopId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(400);

      if (error) throw error;

      setMenuItemsAll((data ?? []) as MenuItemRow[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load menu items.";
      toast.message(msg);
      setMenuItemsAll([]);
    } finally {
      setMenuLoading(false);
    }
  }, [ensureShopContext, supabase, shopId]);

  const loadTemplates = useCallback(async () => {
    if (!shopId) return;

    setTemplatesLoading(true);
    try {
      await ensureShopContext(shopId);

      const [{ data: auth }, { data, error }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("inspection_templates").select("*").order("created_at", { ascending: false }),
      ]);

      if (error) throw error;

      const uid = auth?.user?.id ?? null;
      const rows = (data ?? []) as TemplateRow[];

      const score = (t: TemplateRow): number => {
        if (uid && t.user_id === uid) return 0;
        if (t.shop_id && t.shop_id === shopId) return 1;
        if (t.is_public) return 2;
        return 3;
      };

      rows.sort((a, b) => score(a) - score(b));
      setTemplates(rows);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load templates.";
      toast.message(msg);
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }, [ensureShopContext, supabase, shopId]);

  useEffect(() => {
    if (!shopId) return;
    void loadMenuItems();
    void loadTemplates();
  }, [shopId, loadMenuItems, loadTemplates]);

  async function allocatePartsFromMenu(menuItemId: string, workOrderLineId: string) {
    // ✅ this confirms the call happened
    // (you’ll see it in browser console)
    console.log("ALLOCATE MENU PARTS", { menu_item_id: menuItemId, work_order_line_id: workOrderLineId });

    const tid = toast.loading("Allocating menu parts...");
    try {
      const res = await allocateMenuItemParts({
        menu_item_id: menuItemId,
        work_order_line_id: workOrderLineId,
      });

      const allocated =
        res && typeof (res as { allocated?: unknown }).allocated === "number"
          ? (res as { allocated: number }).allocated
          : 0;

      const skipped =
        res && typeof (res as { skipped?: unknown }).skipped === "number"
          ? (res as { skipped: number }).skipped
          : 0;

      toast.dismiss(tid);

      if (allocated > 0) {
        window.dispatchEvent(new CustomEvent("wo:parts-used"));
        toast.success(`Allocated ${allocated} part${allocated === 1 ? "" : "s"}${skipped ? ` (skipped ${skipped})` : ""}`);
      } else {
        toast.message(`No parts allocated${skipped ? ` (skipped ${skipped})` : ""}. Check menu_item_parts + part links.`);
      }
    } catch (e: unknown) {
      toast.dismiss(tid);
      const msg = e instanceof Error ? e.message : "Failed to allocate menu parts.";
      toast.error(msg);
    }
  }

  async function addMenuItem(params: AddMenuParams): Promise<string | null> {
    if (!shopReady || !shopId) return null;

    setAddingId(params.kind === "template" ? params.template.id : params.name);

    try {
      await ensureShopContext(shopId);

      if (params.kind === "template") {
        const line: WorkOrderLineInsert & { inspection_template_id?: string | null } = {
          work_order_id: workOrderId,
          vehicle_id: vehicleId,
          description: params.name ?? params.template.template_name ?? "Inspection",
          job_type: "inspection",
          labor_time:
            params.laborHours ??
            (typeof params.template.labor_hours === "number" ? params.template.labor_hours : null),
          status: "awaiting",
          priority: 3,
          notes: params.template.description ?? null,
          shop_id: shopId,
          inspection_template_id: params.template.id,
        };

        const { data, error } = await supabase.from("work_order_lines").insert(line).select("id").single();
        if (error) throw new Error(error.message);

        window.dispatchEvent(new CustomEvent("wo:line-added"));
        toast.success("Inspection added");
        return data?.id ?? null;
      }

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

      const { data, error } = await supabase.from("work_order_lines").insert(line).select("id").single();
      if (error) throw new Error(error.message);

      // ✅ allocate menu parts via server action (consumePart pipeline)
      if (params.menuItemIdForParts && data?.id) {
        await allocatePartsFromMenu(params.menuItemIdForParts, data.id);
      }

      window.dispatchEvent(new CustomEvent("wo:line-added"));
      toast.success("Job added");

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
    await addMenuItem({
      kind: "normal",
      name: mi.name ?? "Service",
      jobType: "maintenance",
      laborHours: typeof mi.labor_time === "number" ? mi.labor_time : null,
      notes: mi.description ?? null,
      source: "menu_item",
      returnLineId: false,
      menuItemIdForParts: mi.id ?? null,
    });
  }

  async function addTemplateAsLine(t: TemplateRow) {
    await addMenuItem({ kind: "template", template: t });
  }

  const vehicleLabel =
    vehicle && (vehicle.year || vehicle.make || vehicle.model)
      ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim()
      : vehicle?.license_plate
        ? `Plate ${vehicle.license_plate}`
        : null;

  const menuItemsDisplay = useMemo(() => {
    const q = menuQuery.trim();
    const scored = menuItemsAll
      .filter((mi) => menuSearchHit(mi, q))
      .map((mi) => ({
        mi,
        score: scoreMenuItemFit({ mi, vehicle }),
        global: isGlobalMenuItem(mi),
      }))
      .filter((x) => (includeGlobal ? true : !x.global))
      .filter((x) => {
        if (!vehicle) return true;
        if (x.global) return true;
        return x.score > 0;
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aT = new Date(a.mi.created_at ?? 0).getTime();
        const bT = new Date(b.mi.created_at ?? 0).getTime();
        return bT - aT;
      });

    return scored.map((x) => x.mi);
  }, [menuItemsAll, menuQuery, includeGlobal, vehicle]);

  const currency: "CAD" | "USD" = shopDefaults?.country === "CA" ? "CAD" : "USD";

  return (
    <div className="space-y-5 text-white">
      <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-3 sm:px-4 sm:py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-orange-400">Quick Add Jobs</h3>
              <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] font-mono text-neutral-300">
                WO {workOrderId.slice(0, 8)}…
              </span>
              {shopDefaults?.labor_rate != null ? (
                <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-300">
                  Labor {shopDefaults.labor_rate.toFixed(0)}/{currency}/hr
                </span>
              ) : null}
            </div>

            {vehicleLabel ? (
              <p className="text-[11px] text-neutral-400">
                Vehicle:&nbsp;<span className="font-medium text-neutral-200">{vehicleLabel}</span>
              </p>
            ) : (
              <p className="text-[11px] text-neutral-500">Add lines now — you can update vehicle details later.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => router.push(`/work-orders/quote-review?woId=${workOrderId}`)}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs sm:text-sm text-neutral-100 hover:border-orange-500 hover:bg-neutral-800"
            >
              Review quote
              {typeof woLineCount === "number" && woLineCount > 0 ? ` (${woLineCount})` : ""}
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

      <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">Packages</h4>
          <p className="text-[10px] text-neutral-500">Common services with pre-set labor & notes.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {packages.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => void addPackage(p)}
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
                {p.estLaborHours != null ? `~${p.estLaborHours.toFixed(1)}h` : "Labor TBD"}
              </div>
              <div className="mt-1 line-clamp-2 text-[11px] text-neutral-500">{p.summary}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">Inspection Templates</h4>
          <p className="text-[10px] text-neutral-500">Saved/standard inspections you can attach as jobs.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {templatesLoading ? (
            <div className="col-span-full w-full py-2 text-center text-sm text-neutral-400">Loading templates…</div>
          ) : templates.length ? (
            templates.slice(0, 9).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => void addTemplateAsLine(t)}
                disabled={addingId === t.id || !shopReady}
                className="flex flex-col rounded-md border border-neutral-800 bg-neutral-950 p-3 text-left text-sm hover:border-orange-500/70 hover:bg-neutral-900 disabled:opacity-60"
                title={t.description ?? undefined}
              >
                <span className="font-medium text-neutral-50">{t.template_name ?? "Inspection"}</span>
                <div className="mt-1 text-xs text-neutral-400">
                  inspection • {typeof t.labor_hours === "number" ? `${t.labor_hours.toFixed(1)}h` : "Labor TBD"}
                </div>
              </button>
            ))
          ) : (
            <div className="col-span-full w-full py-2 text-center text-sm text-neutral-400">No templates yet.</div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-3 sm:p-4">
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">From My Menu</h4>
            <p className="text-[10px] text-neutral-500">
              Matches for this vehicle are shown first. Totals use shop labor + tax rules (province engine for CA).
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={menuQuery}
              onChange={(e) => setMenuQuery(e.target.value)}
              placeholder="Search menu items (e.g. brakes, alignment, oil)…"
              className="w-full sm:w-[320px] rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs sm:text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
            />
            <label className="flex items-center gap-2 text-[11px] text-neutral-300">
              <input
                type="checkbox"
                checked={includeGlobal}
                onChange={(e) => setIncludeGlobal(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-700 bg-neutral-900"
              />
              Include global services
            </label>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {menuLoading ? (
            <div className="col-span-full w-full py-2 text-center text-sm text-neutral-400">Loading menu items…</div>
          ) : menuItemsDisplay.length ? (
            menuItemsDisplay.slice(0, 12).map((mi) => {
              const p = calcMenuTotals({ mi, shop: shopDefaults });

              const laborLabel = p.laborHours > 0 ? `${p.laborHours.toFixed(1)}h` : "Labor TBD";
              const partsLabel = p.partsTotal > 0 ? `${moneyLabel(currency, p.partsTotal)} parts` : "No parts";
              const totalLabel = p.total > 0 ? moneyLabel(currency, p.total) : "No total";
              const taxLabel =
                p.taxTotal > 0 ? `${p.taxLabel ?? "Tax"} ${moneyLabel(currency, p.taxTotal)}` : null;

              return (
                <button
                  type="button"
                  key={mi.id}
                  onClick={() => void addSavedMenuItem(mi)}
                  disabled={addingId === (mi.name ?? "") || !shopReady}
                  className="flex flex-col rounded-md border border-neutral-800 bg-neutral-950 p-3 text-left text-sm hover:border-orange-500/70 hover:bg-neutral-900 disabled:opacity-60"
                  title={mi.description ?? undefined}
                >
                  <span className="font-medium text-neutral-50">{mi.name}</span>

                  <div className="mt-1 text-xs text-neutral-400">
                    {laborLabel} • {partsLabel} • <span className="text-neutral-100">{totalLabel}</span>
                    {taxLabel ? <span className="ml-1 text-neutral-500">• {taxLabel}</span> : null}

                    {isGlobalMenuItem(mi) ? (
                      <span className="ml-2 rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-300">
                        GLOBAL
                      </span>
                    ) : (
                      <span className="ml-2 rounded-full border border-orange-500/60 bg-orange-500/10 px-2 py-0.5 text-[10px] text-orange-200">
                        FIT
                      </span>
                    )}
                  </div>

                  {mi.service_key ? (
                    <div className="mt-1 font-mono text-[10px] text-neutral-500">{mi.service_key}</div>
                  ) : null}
                </button>
              );
            })
          ) : (
            <div className="col-span-full w-full py-2 text-center text-sm text-neutral-400">
              No menu items match this filter.
            </div>
          )}
        </div>
      </div>

      <AiSuggestModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        workOrderId={workOrderId}
        vehicleId={vehicleId ?? null}
        vehicleLabel={vehicleLabel ?? null}
        onAdded={(count) => {
          setWoLineCount((prev) => (typeof prev === "number" ? prev + count : prev));
        }}
      />
    </div>
  );
}

export default MenuQuickAdd;
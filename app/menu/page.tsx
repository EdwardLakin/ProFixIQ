"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ClipboardCheck,
  History,
  Package,
  Plus,
  Search,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@auth/hooks/useUser";
import { PartPicker, type PickedPart } from "@parts/components/PartPicker";
import { masterServicesList } from "@inspections/lib/inspection/masterServicesList";
import GuidedPageStepPanel from "@/features/onboarding-v2/components/GuidedPageStepPanel";
import {
  COMPLETED_REPAIR_SOURCE,
  COMPLETED_REPAIR_STATUSES,
} from "@/features/menu-repair-items/lib/completedRepair";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database, Json } from "@shared/types/types/supabase";

type DB = Database;
type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"] & {
  inspection_template?: { template_name: string | null } | null;
};
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"] & {
  labor_hours?: number | null;
};
type LearnedRepairRow = Pick<
  DB["public"]["Tables"]["menu_repair_items"]["Row"],
  | "id"
  | "name"
  | "complaint"
  | "cause"
  | "correction"
  | "vehicle_year"
  | "vehicle_make"
  | "vehicle_model"
  | "engine"
  | "drivetrain"
  | "labor_hours"
  | "price_estimate"
  | "pricing_status"
  | "usage_count"
  | "parts"
  | "is_active"
  | "source_work_order_line_id"
  | "last_pricing_source"
  | "updated_at"
>;

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

type LibraryTab = "shop" | "learned";
type StatusFilter = "active" | "inactive";

const EMPTY_PART: PartFormRow = {
  name: "",
  quantityStr: "",
  unitCostStr: "",
  part_id: null,
};

const EMPTY_FORM: FormState = {
  source: "master",
  name: "",
  description: "",
  laborTimeStr: "",
  inspectionTemplateId: "",
};

const INPUT =
  "w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3.5 py-2.5 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] transition focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20";
const CARD =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] shadow-[var(--theme-shadow-medium)]";
const QUIET_BUTTON =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3.5 text-sm font-medium text-[color:var(--theme-text-primary)] transition hover:border-blue-500/30 hover:bg-[color:var(--theme-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30";
const PRIMARY_BUTTON =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-500/70 bg-blue-600 px-4 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.22)] transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60";

function toNum(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanNumericString(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d.]/g, "");
  return cleaned ? cleaned.replace(/^0+(?=\d)/, "") : "";
}

function money(currency: "CAD" | "USD", value: number | null | undefined): string {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(currency === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency,
  }).format(safeValue);
}

function getShopIdFromUser(user: unknown): string | null {
  if (!user || typeof user !== "object") return null;
  const value = (user as Record<string, unknown>).shop_id;
  return typeof value === "string" && value ? value : null;
}

function normalized(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function jsonArrayLength(value: Json): number {
  return Array.isArray(value) ? value.length : 0;
}

function vehicleLabel(item: LearnedRepairRow): string {
  return [item.vehicle_year, item.vehicle_make, item.vehicle_model]
    .filter((value) => value !== null && value !== "")
    .join(" ");
}

export default function MenuItemsPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const router = useRouter();
  const { user, isLoading } = useUser();
  const shopId = useMemo(() => getShopIdFromUser(user), [user]);

  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [learnedRepairs, setLearnedRepairs] = useState<LearnedRepairRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [shopDefaults, setShopDefaults] = useState<ShopDefaults | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [shopServicesLoadFailed, setShopServicesLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("shop");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [savedQuery, setSavedQuery] = useState("");
  const [pickerOpenForRow, setPickerOpenForRow] = useState<number | null>(null);
  const [parts, setParts] = useState<PartFormRow[]>([{ ...EMPTY_PART }]);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const creationRequestIdRef = useRef<string | null>(null);

  const currency: "CAD" | "USD" = shopDefaults?.country === "CA" ? "CAD" : "USD";
  const laborRate =
    typeof shopDefaults?.labor_rate === "number" && Number.isFinite(shopDefaults.labor_rate)
      ? shopDefaults.labor_rate
      : 0;

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.inspectionTemplateId) ?? null,
    [form.inspectionTemplateId, templates],
  );
  const effectiveLaborHours = useMemo(() => {
    if (form.laborTimeStr.trim()) return toNum(form.laborTimeStr);
    return typeof selectedTemplate?.labor_hours === "number" ? selectedTemplate.labor_hours : 0;
  }, [form.laborTimeStr, selectedTemplate]);
  const partsTotal = useMemo(
    () =>
      parts.reduce(
        (total, part) => total + toNum(part.quantityStr) * toNum(part.unitCostStr),
        0,
      ),
    [parts],
  );
  const laborTotal = effectiveLaborHours * laborRate;
  const serviceTotal = partsTotal + laborTotal;

  useEffect(() => {
    if (!selectedTemplate || form.laborTimeStr.trim()) return;
    if (typeof selectedTemplate.labor_hours === "number" && selectedTemplate.labor_hours > 0) {
      setForm((current) => ({
        ...current,
        laborTimeStr: String(selectedTemplate.labor_hours),
      }));
    }
  }, [form.laborTimeStr, selectedTemplate]);

  const setShopContext = useCallback(async () => {
    if (!shopId) return;
    const { error } = await supabase.rpc("set_current_shop_id", { p_shop_id: shopId });
    if (error) console.warn("[menu] set_current_shop_id failed", error.message);
  }, [shopId, supabase]);

  const fetchShopDefaults = useCallback(async () => {
    if (!shopId) return setShopDefaults(null);
    const { data, error } = await supabase
      .from("shops")
      .select("country, labor_rate")
      .eq("id", shopId)
      .maybeSingle();
    if (error) {
      toast.error("Could not load shop pricing defaults.");
      return setShopDefaults(null);
    }
    setShopDefaults({
      country: data?.country === "CA" ? "CA" : "US",
      labor_rate: typeof data?.labor_rate === "number" ? data.labor_rate : null,
    });
  }, [shopId, supabase]);

  const fetchMenuItems = useCallback(async () => {
    if (!shopId) {
      setMenuItems([]);
      setShopServicesLoadFailed(false);
      return;
    }
    const { data, error } = await supabase
      .from("menu_items")
      .select("*, inspection_template:inspection_templates(template_name)")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      console.error("[menu] shop services load failed", error);
      setShopServicesLoadFailed(true);
      toast.error("Could not load shop services.");
      return;
    }
    setShopServicesLoadFailed(false);
    setMenuItems((data ?? []) as MenuItemRow[]);
  }, [shopId, supabase]);

  const fetchLearnedRepairs = useCallback(async () => {
    if (!shopId) return setLearnedRepairs([]);
    const { data, error } = await supabase
      .from("menu_repair_items")
      .select(
        "id, name, complaint, cause, correction, vehicle_year, vehicle_make, vehicle_model, engine, drivetrain, labor_hours, price_estimate, pricing_status, usage_count, parts, is_active, source_work_order_line_id, last_pricing_source, updated_at",
      )
      .eq("shop_id", shopId)
      .eq("last_pricing_source", COMPLETED_REPAIR_SOURCE)
      .order("updated_at", { ascending: false })
      .limit(200)
      .returns<LearnedRepairRow[]>();
    if (error) {
      toast.error("Could not load completed repair history.");
      return;
    }

    const sourceIds = [
      ...new Set(
        (data ?? [])
          .map((item) => item.source_work_order_line_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (sourceIds.length === 0) return setLearnedRepairs([]);

    const { data: completedLines, error: sourceError } = await supabase
      .from("work_order_lines")
      .select("id, status")
      .eq("shop_id", shopId)
      .in("id", sourceIds)
      .in("status", [...COMPLETED_REPAIR_STATUSES]);
    if (sourceError) {
      toast.error("Could not verify completed repair history.");
      return setLearnedRepairs([]);
    }
    const completedIds = new Set((completedLines ?? []).map((line) => line.id));
    setLearnedRepairs(
      (data ?? []).filter(
        (item) =>
          Boolean(item.source_work_order_line_id) &&
          completedIds.has(item.source_work_order_line_id as string),
      ),
    );
  }, [shopId, supabase]);

  const fetchTemplates = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id ?? null;
    const mine = userId
      ? supabase
          .from("inspection_templates")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] as TemplateRow[], error: null });
    const shared = supabase
      .from("inspection_templates")
      .select("*")
      .eq("is_public", true)
      .order("updated_at", { ascending: false });
    const [{ data: mineRows }, { data: sharedRows }] = await Promise.all([mine, shared]);
    const unique = new Map<string, TemplateRow>();
    for (const template of [...(mineRows ?? []), ...(sharedRows ?? [])] as TemplateRow[]) {
      unique.set(template.id, template);
    }
    setTemplates([...unique.values()]);
  }, [supabase]);

  const refreshLibrary = useCallback(async () => {
    await Promise.all([fetchMenuItems(), fetchLearnedRepairs()]);
  }, [fetchLearnedRepairs, fetchMenuItems]);

  useEffect(() => {
    if (!shopId) {
      setLoadingLibrary(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoadingLibrary(true);
      await setShopContext();
      await Promise.all([fetchShopDefaults(), fetchTemplates(), refreshLibrary()]);
      if (!cancelled) setLoadingLibrary(false);
    };
    void load();

    const channel = supabase
      .channel(`service-menu-${shopId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_items", filter: `shop_id=eq.${shopId}` },
        () => void fetchMenuItems(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "menu_repair_items",
          filter: `shop_id=eq.${shopId}`,
        },
        () => void fetchLearnedRepairs(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [
    fetchLearnedRepairs,
    fetchMenuItems,
    fetchShopDefaults,
    fetchTemplates,
    refreshLibrary,
    setShopContext,
    shopId,
    supabase,
  ]);

  const setPartField = useCallback(
    (index: number, field: "name" | "quantityStr" | "unitCostStr", value: string) => {
      setParts((rows) =>
        rows.map((row, rowIndex) =>
          rowIndex === index
            ? { ...row, [field]: field === "name" ? value : cleanNumericString(value) }
            : row,
        ),
      );
    },
    [],
  );

  const handlePickPart = useCallback(
    (rowIndex: number) => async (selection: PickedPart) => {
      const { data } = await supabase
        .from("parts")
        .select("name, unit_cost")
        .eq("id", selection.part_id)
        .maybeSingle();
      const label = data?.name ?? "Part";
      setParts((rows) =>
        rows.map((row, index) =>
          index === rowIndex
            ? {
                ...row,
                part_id: selection.part_id,
                name: label,
                quantityStr: row.quantityStr || (selection.qty ? String(selection.qty) : ""),
                unitCostStr:
                  row.unitCostStr ||
                  (selection.unit_cost != null
                    ? String(selection.unit_cost)
                    : data?.unit_cost != null
                      ? String(data.unit_cost)
                      : ""),
              }
            : row,
        ),
      );
      toast.success(`Added ${label}`);
    },
    [supabase],
  );

  const resetEditor = useCallback(() => {
    setForm({ ...EMPTY_FORM });
    setParts([{ ...EMPTY_PART }]);
    creationRequestIdRef.current = null;
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim()) return toast.error("Service name is required.");
    if (!shopId) return toast.error("Shop context is unavailable.");

    const cleanedParts = parts
      .filter((part) => part.name.trim() && toNum(part.quantityStr) > 0)
      .map((part) => ({
        name: part.name.trim(),
        quantity: toNum(part.quantityStr),
        unit_cost: toNum(part.unitCostStr),
        part_id: part.part_id ?? null,
      }));

    setSaving(true);
    try {
      creationRequestIdRef.current ??= crypto.randomUUID();
      const response = await fetch("/api/menu/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: creationRequestIdRef.current,
          item: {
            name: form.name.trim(),
            description: form.description.trim() || null,
            labor_time: effectiveLaborHours > 0 ? effectiveLaborHours : null,
            inspection_template_id: form.inspectionTemplateId || null,
            shop_id: shopId,
          },
          parts: cleanedParts,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        partCount?: number;
      };
      if (!response.ok || !result.ok) {
        toast.error(result.detail || result.error || "Could not save service.");
        return;
      }

      toast.success(
        cleanedParts.length > 0
          ? "Service saved. Its parts will be requested when it is added to a work order."
          : "Service saved.",
      );
      resetEditor();
      setEditorOpen(false);
      setLibraryTab("shop");
      setStatusFilter("active");
      await fetchMenuItems();
    } catch (error) {
      console.error("[menu] service save failed", error);
      toast.error("Could not save service.");
    } finally {
      setSaving(false);
    }
  }, [effectiveLaborHours, fetchMenuItems, form, parts, resetEditor, shopId]);

  const query = normalized(savedQuery);
  const filteredShopItems = useMemo(
    () =>
      menuItems.filter((item) => {
        if (statusFilter === "active" ? !item.is_active : item.is_active) return false;
        if (!query) return true;
        return [item.name, item.description, item.category].some((value) =>
          normalized(value).includes(query),
        );
      }),
    [menuItems, query, statusFilter],
  );
  const filteredLearnedRepairs = useMemo(
    () =>
      learnedRepairs.filter((item) => {
        if (statusFilter === "active" ? !item.is_active : item.is_active) return false;
        if (!query) return true;
        return [
          item.name,
          item.complaint,
          item.cause,
          item.correction,
          vehicleLabel(item),
        ].some((value) => normalized(value).includes(query));
      }),
    [learnedRepairs, query, statusFilter],
  );
  const statusCounts = useMemo(() => {
    const items = libraryTab === "shop" ? menuItems : learnedRepairs;
    return items.reduce(
      (counts, item) => {
        if (item.is_active) counts.active += 1;
        else counts.inactive += 1;
        return counts;
      },
      { active: 0, inactive: 0 },
    );
  }, [learnedRepairs, libraryTab, menuItems]);

  const flatMaster = useMemo(
    () => masterServicesList.flatMap((category) => category.items.map((item) => item.item)),
    [],
  );
  const currentCount =
    libraryTab === "shop" ? filteredShopItems.length : filteredLearnedRepairs.length;

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-sm text-[color:var(--theme-text-secondary)]">
        Loading service menu…
      </div>
    );
  }

  return (
    <div className="relative space-y-5 pb-10 fade-in">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-72 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.11),transparent_55%)]" />
      <GuidedPageStepPanel />

      <header className="flex flex-col gap-4 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-5 shadow-[var(--theme-shadow-medium)] sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-500">
            <Wrench className="h-4 w-4" aria-hidden />
            Service Menu
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--theme-text-primary)] sm:text-3xl">
            Build once. Quote consistently.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
            Manage shop-created services and the repairs ProFixIQ has learned from completed work.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className={PRIMARY_BUTTON}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Create service
        </button>
      </header>

      <div className={editorOpen ? "grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_440px]" : ""}>
        <section className={`${CARD} min-w-0 overflow-hidden`} aria-label="Service library">
          <div className="border-b border-[color:var(--theme-border-soft)] p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="inline-flex w-full rounded-xl bg-[color:var(--theme-surface-subtle)] p-1 sm:w-auto" role="tablist" aria-label="Service source">
                <button
                  type="button"
                  role="tab"
                  aria-selected={libraryTab === "shop"}
                  onClick={() => setLibraryTab("shop")}
                  className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition sm:flex-none ${
                    libraryTab === "shop"
                      ? "bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)] shadow-sm"
                      : "text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
                  }`}
                >
                  <Sparkles className="h-4 w-4" aria-hidden />
                  <span className="sm:hidden">Shop</span>
                  <span className="hidden sm:inline">Shop services</span>
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-500">
                    {shopServicesLoadFailed ? "—" : menuItems.length}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={libraryTab === "learned"}
                  onClick={() => setLibraryTab("learned")}
                  className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition sm:flex-none ${
                    libraryTab === "learned"
                      ? "bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)] shadow-sm"
                      : "text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
                  }`}
                >
                  <History className="h-4 w-4" aria-hidden />
                  <span className="sm:hidden">Completed</span>
                  <span className="hidden sm:inline">Learned from completed work</span>
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-500">
                    {learnedRepairs.length}
                  </span>
                </button>
              </div>

              <div className="flex gap-2">
                {(["active", "inactive"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold capitalize transition ${
                      statusFilter === status
                        ? "border-blue-500/40 bg-blue-500/10 text-blue-500"
                        : "border-[color:var(--theme-border-soft)] text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
                    }`}
                  >
                    <span>{status}</span>
                    <span className="rounded-full bg-[color:var(--theme-surface-subtle)] px-1.5 py-0.5 text-[10px] tabular-nums">
                      {libraryTab === "shop" && shopServicesLoadFailed
                        ? "—"
                        : statusCounts[status]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]" aria-hidden />
              <input
                value={savedQuery}
                onChange={(event) => setSavedQuery(event.target.value)}
                placeholder={
                  libraryTab === "shop"
                    ? "Search service name, description, or category…"
                    : "Search repair, concern, or vehicle…"
                }
                aria-label="Search service menu"
                className={`${INPUT} pl-10`}
              />
            </div>
          </div>

          <div className="p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between px-1 text-xs text-[color:var(--theme-text-muted)]">
              <span>
                {libraryTab === "shop" && shopServicesLoadFailed
                  ? "Services unavailable"
                  : `${currentCount} ${currentCount === 1 ? "result" : "results"}`}
              </span>
              {libraryTab === "learned" ? (
                <span className="hidden sm:inline">Exact YMM suggestions only</span>
              ) : null}
            </div>

            {loadingLibrary ? (
              <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] px-4 py-12 text-center text-sm text-[color:var(--theme-text-secondary)]">
                Loading services…
              </div>
            ) : libraryTab === "shop" && shopServicesLoadFailed ? (
              <div
                role="alert"
                className="rounded-xl border border-red-500/35 bg-red-500/5 px-5 py-10 text-center"
              >
                <p className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  Shop services could not be loaded.
                </p>
                <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                  Your saved services have not been removed. Retry the request
                  to load them.
                </p>
                <button
                  type="button"
                  onClick={() => void fetchMenuItems()}
                  className={`${QUIET_BUTTON} mt-4`}
                >
                  Retry loading services
                </button>
              </div>
            ) : libraryTab === "shop" ? (
              <div className="space-y-2">
                {filteredShopItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => router.push(`/menu/item/${item.id}`)}
                    className="group grid w-full gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-4 text-left transition hover:border-blue-500/30 hover:bg-[color:var(--theme-surface-subtle)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                          {item.name}
                        </span>
                        {item.inspection_template_id ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
                            <ClipboardCheck className="h-3 w-3" aria-hidden />
                            Inspection
                          </span>
                        ) : null}
                      </span>
                      {item.description ? (
                        <span className="mt-1 block line-clamp-2 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                          {item.description}
                        </span>
                      ) : null}
                      <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[color:var(--theme-text-muted)]">
                        <span>{item.labor_time != null ? `${item.labor_time} hr labor` : "Labor not set"}</span>
                        <span>{item.part_cost != null ? `${money(currency, item.part_cost)} parts` : "No parts"}</span>
                        {item.inspection_template?.template_name ? (
                          <span>{item.inspection_template.template_name}</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {typeof item.total_price === "number" ? money(currency, item.total_price) : "Review price"}
                      </span>
                      <ChevronRight className="h-4 w-4 text-[color:var(--theme-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-blue-500" aria-hidden />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLearnedRepairs.map((item) => (
                  <details
                    key={item.id}
                    className="group rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] transition open:border-blue-500/25 open:bg-[color:var(--theme-surface-subtle)]"
                  >
                    <summary className="grid cursor-pointer list-none gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                            {item.name}
                          </span>
                          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-500">
                            Completed work
                          </span>
                        </span>
                        <span className="mt-1 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
                          {vehicleLabel(item) || "Vehicle details unavailable"}
                          {item.engine ? ` · ${item.engine}` : ""}
                        </span>
                        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[color:var(--theme-text-muted)]">
                          <span>Used {item.usage_count} {item.usage_count === 1 ? "time" : "times"}</span>
                          <span>{item.labor_hours != null ? `${item.labor_hours} hr` : "Labor not set"}</span>
                          <span>{jsonArrayLength(item.parts)} {jsonArrayLength(item.parts) === 1 ? "part" : "parts"}</span>
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-3 sm:justify-end">
                        <span className="text-right">
                          <span className="block text-sm font-semibold text-[color:var(--theme-text-primary)]">
                            {item.price_estimate != null ? money(currency, item.price_estimate) : "Review price"}
                          </span>
                          <span className="block text-[10px] text-amber-600 dark:text-amber-300">
                            Confirm before quoting
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 text-[color:var(--theme-text-muted)] transition group-open:rotate-90" aria-hidden />
                      </span>
                    </summary>
                    <div className="border-t border-[color:var(--theme-border-soft)] px-4 py-3 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="font-semibold text-[color:var(--theme-text-primary)]">Cause</div>
                          <p className="mt-0.5">{item.cause || item.complaint || "Not recorded"}</p>
                        </div>
                        <div>
                          <div className="font-semibold text-[color:var(--theme-text-primary)]">Correction</div>
                          <p className="mt-0.5">{item.correction || "Not recorded"}</p>
                        </div>
                      </div>
                      <p className="mt-3 rounded-lg bg-blue-500/10 px-3 py-2 text-[11px]">
                        Suggested only for matching year, make, and model. Pricing and fitment still require confirmation.
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            )}

            {!loadingLibrary &&
            !(libraryTab === "shop" && shopServicesLoadFailed) &&
            currentCount === 0 ? (
              <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] px-5 py-12 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                  {libraryTab === "shop" ? <Sparkles className="h-5 w-5" /> : <History className="h-5 w-5" />}
                </div>
                <p className="mt-3 text-sm font-medium text-[color:var(--theme-text-primary)]">
                  {savedQuery ? "No matching services" : libraryTab === "shop" ? "No shop services yet" : "No verified completed repairs yet"}
                </p>
                <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                  {libraryTab === "shop"
                    ? "Create a reusable service to keep quoting consistent."
                    : "Repairs appear here after a technician completes the job with final labor and parts."}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        {editorOpen ? (
          <aside className={`${CARD} mt-5 overflow-hidden xl:sticky xl:top-4 xl:mt-0`} aria-label="Create service">
            <div className="flex items-start justify-between border-b border-[color:var(--theme-border-soft)] px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-500">New service</div>
                <h2 className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">Create menu item</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                aria-label="Close service editor"
                className="rounded-lg p-2 text-[color:var(--theme-text-muted)] transition hover:bg-[color:var(--theme-surface-subtle)] hover:text-[color:var(--theme-text-primary)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="max-h-none space-y-5 overflow-y-auto p-5 xl:max-h-[calc(100vh-15rem)]">
              <section className="space-y-3" aria-labelledby="service-details-heading">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-bold text-blue-500">1</span>
                  <h3 id="service-details-heading" className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Service details</h3>
                </div>
                <div className="grid grid-cols-2 rounded-xl bg-[color:var(--theme-surface-subtle)] p-1">
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, source: "master" }))}
                    className={`min-h-9 rounded-lg text-xs font-medium transition ${form.source === "master" ? "bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)] shadow-sm" : "text-[color:var(--theme-text-secondary)]"}`}
                  >
                    Service library
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, source: "manual" }))}
                    className={`min-h-9 rounded-lg text-xs font-medium transition ${form.source === "manual" ? "bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)] shadow-sm" : "text-[color:var(--theme-text-secondary)]"}`}
                  >
                    Custom service
                  </button>
                </div>
                <label className="block text-xs font-medium text-[color:var(--theme-text-secondary)]">
                  Service name
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder={form.source === "master" ? "Search or enter a service…" : "Enter service name…"}
                    list={form.source === "master" ? "master-services" : undefined}
                    className={`${INPUT} mt-1.5`}
                  />
                  {form.source === "master" ? (
                    <datalist id="master-services">
                      {flatMaster.map((service) => <option key={service} value={service} />)}
                    </datalist>
                  ) : null}
                </label>
                <label className="block text-xs font-medium text-[color:var(--theme-text-secondary)]">
                  Customer-facing description
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="What is included in this service?"
                    className={`${INPUT} mt-1.5 min-h-20 resize-y`}
                  />
                </label>
              </section>

              <section className="space-y-3 border-t border-[color:var(--theme-border-soft)] pt-5" aria-labelledby="labor-heading">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-bold text-blue-500">2</span>
                  <h3 id="labor-heading" className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Labor</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-[color:var(--theme-text-secondary)]">
                    Labor hours
                    <input
                      inputMode="decimal"
                      value={form.laborTimeStr}
                      onChange={(event) => setForm((current) => ({ ...current, laborTimeStr: cleanNumericString(event.target.value) }))}
                      placeholder="1.5"
                      className={`${INPUT} mt-1.5`}
                    />
                  </label>
                  <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3.5 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">Shop rate</div>
                    <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">{money(currency, laborRate)} / hr</div>
                  </div>
                </div>
              </section>

              <section className="space-y-3 border-t border-[color:var(--theme-border-soft)] pt-5" aria-labelledby="inspection-heading">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-bold text-blue-500">3</span>
                  <h3 id="inspection-heading" className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Inspection</h3>
                </div>
                <label className="block text-xs font-medium text-[color:var(--theme-text-secondary)]">
                  Linked template <span className="font-normal text-[color:var(--theme-text-muted)]">(optional)</span>
                  <select
                    value={form.inspectionTemplateId}
                    onChange={(event) => setForm((current) => ({ ...current, inspectionTemplateId: event.target.value }))}
                    className={`${INPUT} mt-1.5`}
                  >
                    <option value="">No inspection</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.template_name ?? "Untitled inspection"}
                        {typeof template.labor_hours === "number" ? ` · ${template.labor_hours} hr` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-[11px] leading-5 text-[color:var(--theme-text-muted)]">
                  The selected inspection is added whenever this service is placed on a work order.
                </p>
              </section>

              <section className="space-y-3 border-t border-[color:var(--theme-border-soft)] pt-5" aria-labelledby="parts-heading">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-bold text-blue-500">4</span>
                    <h3 id="parts-heading" className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Parts and pricing</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setParts((rows) => [...rows, { ...EMPTY_PART }])}
                    className="text-xs font-semibold text-blue-500 hover:text-blue-400"
                  >
                    + Add part
                  </button>
                </div>
                <div className="space-y-2">
                  {parts.map((part, index) => (
                    <div key={index} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3">
                      <div className="flex items-start gap-2">
                        <input
                          value={part.name}
                          onChange={(event) => setPartField(index, "name", event.target.value)}
                          placeholder="Part name"
                          aria-label={`Part ${index + 1} name`}
                          className={`${INPUT} min-w-0 flex-1 bg-[color:var(--theme-surface-page)]`}
                        />
                        <button type="button" onClick={() => setPickerOpenForRow(index)} className={`${QUIET_BUTTON} shrink-0 px-3`}>
                          Pick
                        </button>
                        {parts.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setParts((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
                            aria-label={`Remove part ${index + 1}`}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[color:var(--theme-text-muted)] hover:bg-red-500/10 hover:text-red-500"
                          >
                            <X className="h-4 w-4" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          inputMode="decimal"
                          value={part.quantityStr}
                          onChange={(event) => setPartField(index, "quantityStr", event.target.value)}
                          placeholder="Quantity"
                          aria-label={`Part ${index + 1} quantity`}
                          className={`${INPUT} bg-[color:var(--theme-surface-page)]`}
                        />
                        <input
                          inputMode="decimal"
                          value={part.unitCostStr}
                          onChange={(event) => setPartField(index, "unitCostStr", event.target.value)}
                          placeholder="Unit cost"
                          aria-label={`Part ${index + 1} unit cost`}
                          className={`${INPUT} bg-[color:var(--theme-surface-page)]`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="flex gap-2 text-[11px] leading-5 text-[color:var(--theme-text-muted)]">
                  <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  These parts will be requested automatically whenever this service is added to a work order.
                </p>
              </section>
            </div>

            <div className="border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--theme-text-muted)]">Labor</div>
                  <div className="mt-1 text-xs font-semibold text-[color:var(--theme-text-primary)]">{money(currency, laborTotal)}</div>
                </div>
                <div className="border-x border-[color:var(--theme-border-soft)]">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--theme-text-muted)]">Parts</div>
                  <div className="mt-1 text-xs font-semibold text-[color:var(--theme-text-primary)]">{money(currency, partsTotal)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--theme-text-muted)]">Service</div>
                  <div className="mt-1 text-xs font-semibold text-blue-500">{money(currency, serviceTotal)}</div>
                </div>
              </div>
              <button type="button" onClick={handleSubmit} disabled={saving} className={`${PRIMARY_BUTTON} mt-4 w-full`}>
                {saving ? "Saving service…" : "Save service"}
              </button>
            </div>
          </aside>
        ) : null}
      </div>

      {pickerOpenForRow !== null ? (
        <PartPicker
          open
          onClose={() => setPickerOpenForRow(null)}
          onPick={(selection) => handlePickPart(pickerOpenForRow)(selection)}
        />
      ) : null}
    </div>
  );
}

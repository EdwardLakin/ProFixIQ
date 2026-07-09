// app/parts/inventory/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import GuidedPageStepPanel from "@/features/onboarding-v2/components/GuidedPageStepPanel";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  buildPartTrustMeta,
  trustBadgeTone,
  trustLevelLabel,
  type PartTrustMeta,
} from "@/features/parts/lib/trust-signals";
import { toPartDisplaySummary } from "@/features/parts/lib/part-display";
import { CsvImportProgress, type CsvImportProgressState } from "@/features/shared/components/import/CsvImportProgress";
import { GuidedImportSummary } from "@/features/shared/components/import/GuidedImportSummary";
import { GuidedImportCardLayout } from "@/features/shared/components/import/GuidedImportCardLayout";
import { GuidedImportFooterActions } from "@/features/shared/components/import/GuidedImportFooterActions";
import { parseGuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

/* ----------------------------- Types ----------------------------- */

type DB = Database;
type Part = DB["public"]["Tables"]["parts"]["Row"];
type PartInsert = DB["public"]["Tables"]["parts"]["Insert"];
type PartUpdate = DB["public"]["Tables"]["parts"]["Update"];
type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];
type StockMove = DB["public"]["Tables"]["stock_moves"]["Row"];
type AliasRow = {
  part_id: string;
  alias_type: string | null;
  source_system: string | null;
};
type StagingRow = {
  matched_part_id: string | null;
  source_system: string | null;
  status: string | null;
};
type TrustMeta = PartTrustMeta;

// app-side view of the enum
type StockMoveReason = "receive" | "adjust" | "consume" | "transfer";

/* --------------------------- UI helpers -------------------------- */

function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
}) {
  const { open, title, onClose, children, footer, widthClass = "max-w-xl" } = props;
  if (!open) return null;

  // ---- Theme (glass + neutral accent styling) ----
  const ACCENT_BORDER = "border-[color:var(--desktop-border-strong)]";
  const ACCENT_FOCUS_RING = "focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_35%,transparent)]";

  const shell =
    "rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] backdrop-blur-xl " +
    "shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] text-white";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${widthClass} ${shell} p-4`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className={`rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2 py-1 text-sm hover:bg-white/5 focus:outline-none ${ACCENT_FOCUS_RING}`}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div>{children}</div>

        {footer ? (
          <div className={`mt-4 border-t border-[color:var(--desktop-border)] pt-3 ${ACCENT_BORDER}`}>{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

function TextField(props: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const { label, value, placeholder, onChange } = props;
  return (
    <div>
      <div className="mb-1 text-xs text-neutral-400">{label}</div>
      <input
        className="w-full rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: number | "";
  min?: number;
  step?: number;
  onChange: (v: number | "") => void;
}) {
  const { label, value, min = 0, step = 0.01, onChange } = props;
  return (
    <div>
      <div className="mb-1 text-xs text-neutral-400">{label}</div>
      <input
        type="number"
        className="w-full rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
        value={value === "" ? "" : value}
        min={min}
        step={step}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? "" : Number(raw));
        }}
      />
    </div>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const { label, value, options, onChange } = props;
  return (
    <div>
      <div className="mb-1 text-xs text-neutral-400">{label}</div>
      <select
        className="w-full rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/30"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------------------- CSV parsing helper ---------------------- */

const PART_CSV_FIELDS = [
  "external_id",
  "sku",
  "part_number",
  "name",
  "description",
  "category",
  "brand",
  "vendor",
  "unit",
  "cost_price",
  "sell_price",
  "quantity_on_hand",
  "min_stock",
  "location",
  "bin",
  "barcode",
  "taxable",
  "active",
] as const;

type PartCsvField = (typeof PART_CSV_FIELDS)[number];
type PartCsvRow = Partial<Record<PartCsvField, string>>;
type ParsedPartCsvRow = {
  rowNumber: number;
  external_id?: string;
  sku?: string;
  part_number?: string;
  name: string;
  description?: string;
  category?: string;
  brand?: string;
  vendor?: string;
  unit?: string;
  cost_price?: number;
  sell_price?: number;
  quantity_on_hand?: number;
  min_stock?: number;
  location?: string;
  bin?: string;
  barcode?: string;
  taxable?: boolean;
  active?: boolean;
  warnings: string[];
  errors: string[];
};
type PartCsvImportCounts = { created: number; updated: number; skipped: number; failed: number };
type PartCsvImportResult = {
  counts: PartCsvImportCounts;
  errors: Array<{ row: number; error: string }>;
  skipped: Array<{ row: number; reason: string }>;
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        row.push(cell.trim());
        cell = "";
      } else if (ch === "\n") {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = "";
      } else if (ch !== "\r") {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.length > 0 && r.some((c) => c.length > 0));
}

function parseOptionalNumber(value: string | undefined, field: string, errors: string[]): number | undefined {
  const cleaned = (value ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    errors.push(`${field} must be numeric`);
    return undefined;
  }
  return parsed;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  if (["true", "yes", "y", "1", "active"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "inactive"].includes(normalized)) return false;
  return undefined;
}


function normalizeIdentity(value: string | undefined | null): string {
  return String(value ?? "").trim().toLowerCase();
}

function csvIdentityKey(row: ParsedPartCsvRow): string {
  const externalId = normalizeIdentity(row.external_id);
  if (externalId) return `external_id:${externalId}`;
  const sku = normalizeIdentity(row.sku);
  if (sku) return `sku:${sku}`;
  const partNumber = normalizeIdentity(row.part_number);
  if (partNumber) return `part_number:${partNumber}`;
  const barcode = normalizeIdentity(row.barcode);
  if (barcode) return `barcode:${barcode}`;
  return `row:${row.rowNumber}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function parsePartCsvRows(raw: string): ParsedPartCsvRow[] {
  const rows = parseCSV(raw);
  if (!rows.length) return [];
  const header = rows[0].map(normalizeHeader);
  const seen = new Set<string>();

  return rows.slice(1).map((cells, index) => {
    const source = {} as PartCsvRow;
    header.forEach((name, cellIndex) => {
      if ((PART_CSV_FIELDS as readonly string[]).includes(name)) {
        source[name as PartCsvField] = (cells[cellIndex] ?? "").trim();
      }
    });

    const errors: string[] = [];
    const warnings: string[] = [];
    const name = (source.name ?? "").trim();
    const sku = (source.sku ?? "").trim();
    const partNumber = (source.part_number ?? "").trim();
    if (!name) errors.push("name is required");
    if (!sku && !partNumber) warnings.push("sku or part_number is recommended for deterministic updates");

    const key = csvIdentityKey({ rowNumber: index + 2, external_id: source.external_id, sku, part_number: partNumber, name, warnings, errors });
    if (!key.startsWith("row:") && seen.has(key)) warnings.push("duplicate authoritative identity in this CSV; later duplicate rows will be skipped");
    if (!key.startsWith("row:")) seen.add(key);

    return {
      rowNumber: index + 2,
      external_id: source.external_id?.trim() || undefined,
      sku: sku || undefined,
      part_number: partNumber || undefined,
      name,
      description: source.description?.trim() || undefined,
      category: source.category?.trim() || undefined,
      brand: source.brand?.trim() || undefined,
      vendor: source.vendor?.trim() || undefined,
      unit: source.unit?.trim() || undefined,
      cost_price: parseOptionalNumber(source.cost_price, "cost_price", errors),
      sell_price: parseOptionalNumber(source.sell_price, "sell_price", errors),
      quantity_on_hand: parseOptionalNumber(source.quantity_on_hand, "quantity_on_hand", errors),
      min_stock: parseOptionalNumber(source.min_stock, "min_stock", errors),
      location: source.location?.trim() || undefined,
      bin: source.bin?.trim() || undefined,
      barcode: source.barcode?.trim() || undefined,
      taxable: parseOptionalBoolean(source.taxable),
      active: parseOptionalBoolean(source.active),
      warnings,
      errors,
    };
  });
}

/* ------------------------- Error helper ------------------------- */
function errMsg(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as Record<string, unknown>).message);
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/* ------------------------- RPC helper --------------------------- */
/** Try 6-arg function first; if schema cache hasn’t picked it up,
 * fall back to the 5-arg legacy shape. Strictly typed; ignores return value.
 */
async function applyStockMoveRPC(
  supabase: ReturnType<typeof createBrowserSupabase>,
  args: {
    p_part: string;
    p_loc: string;
    p_qty: number;
    p_reason: StockMoveReason;
    p_ref_kind: string;
    p_ref_id?: string | null;
  },
): Promise<void> {
  type FnArgs = DB["public"]["Functions"]["apply_stock_move"]["Args"];

  // 6-arg (conditionally include p_ref_id so shapes match)
  const payload6 = {
    p_part: args.p_part,
    p_loc: args.p_loc,
    p_qty: args.p_qty,
    p_reason: args.p_reason as FnArgs extends { p_reason: infer R } ? R : never,
    p_ref_kind: args.p_ref_kind,
    ...(args.p_ref_id !== undefined ? { p_ref_id: args.p_ref_id } : {}),
  } as FnArgs;

  const call6 = await supabase.rpc("apply_stock_move", payload6);
  if (!call6.error) return;

  const msg = (call6.error?.message ?? "").toLowerCase();
  const cacheShapeIssue =
    msg.includes("could not find the function") ||
    msg.includes("schema cache") ||
    msg.includes("function apply_stock_move(");

  if (!cacheShapeIssue) throw new Error(call6.error?.message ?? "apply_stock_move failed");

  // 5-arg (legacy, no p_ref_id)
  const payload5 = {
    p_part: args.p_part,
    p_loc: args.p_loc,
    p_qty: args.p_qty,
    p_reason: args.p_reason as FnArgs extends { p_reason: infer R } ? R : never,
    p_ref_kind: args.p_ref_kind,
  } as FnArgs;

  const call5 = await supabase.rpc("apply_stock_move", payload5);
  if (call5.error) {
    throw new Error(call5.error.message ?? "apply_stock_move failed");
  }
}

/* ---------------------------- Page ---------------------------- */

export default function InventoryPage(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const searchParams = useSearchParams();
  const router = useRouter();
  const guidedQuery = useMemo(() => parseGuidedOnboardingQuery(new URLSearchParams(searchParams.toString())), [searchParams]);
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);
  const csvSectionRef = useRef<HTMLDivElement | null>(null);
  const [shopId, setShopId] = useState<string>("");

  const [search, setSearch] = useState<string>("");
  const [parts, setParts] = useState<Part[]>([]);
  const [trustByPartId, setTrustByPartId] = useState<Record<string, TrustMeta>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [trustFilter, setTrustFilter] = useState<"all" | "review" | "low">("all");

  // stock locations
  const [locs, setLocs] = useState<StockLoc[]>([]);

  // on-hand map: partId -> total qty
  const [onHand, setOnHand] = useState<Record<string, number>>({});
  // per-location detail modal
  const [ohOpen, setOhOpen] = useState<boolean>(false);
  const [ohForPart, setOhForPart] = useState<Part | null>(null);
  const [ohLines, setOhLines] = useState<{ location: string; qty: number }[]>([]);

  // add modal
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const [sku, setSku] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [price, setPrice] = useState<number | "">("");
  const [partNumber, setPartNumber] = useState<string>("");

  // initial receive (optional) for Add
  const [initLoc, setInitLoc] = useState<string>("");
  const [initQty, setInitQty] = useState<number | "">("");

  // edit modal
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [editPart, setEditPart] = useState<Part | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editSku, setEditSku] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editPrice, setEditPrice] = useState<number | "">("");
  const [editPartNumber, setEditPartNumber] = useState<string>("");

  // receive modal (standalone quick receive)
  const [recvOpen, setRecvOpen] = useState<boolean>(false);
  const [recvPart, setRecvPart] = useState<Part | null>(null);
  const [recvLoc, setRecvLoc] = useState<string>("");
  const [recvQty, setRecvQty] = useState<number | "">("");

  // Import CSV
  const [csvRows, setCsvRows] = useState<ParsedPartCsvRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<boolean>(false);
  const [csvDefaultLoc, setCsvDefaultLoc] = useState<string>("");
  const [csvImporting, setCsvImporting] = useState<boolean>(false);
  const [csvCompletingOnboarding, setCsvCompletingOnboarding] = useState<boolean>(false);
  const [csvProgress, setCsvProgress] = useState<CsvImportProgressState | null>(null);
  const [csvResult, setCsvResult] = useState<PartCsvImportResult | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  // ---- Theme (glass + neutral accent styling) ----
  const ACCENT_TEXT = "text-[var(--theme-text-primary,#E2E8F0)]";
  const ACCENT_FOCUS_RING = "focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_35%,transparent)]";

  const pageWrap = "space-y-4 p-6 text-white";
  const glassCard =
    "rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]";
  const glassHeader = "bg-[linear-gradient(180deg,rgba(148,163,184,0.08),rgba(15,23,42,0))] border-b border-[color:var(--desktop-border)]";

  const inputBase =
    `rounded-lg border bg-neutral-950/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500 border-[color:var(--desktop-border)] focus:outline-none ${ACCENT_FOCUS_RING}`;

  const btnBase =
    "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-60";
  const btnGhost = `${btnBase} border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] hover:bg-white/5`;
  const btnCopper = `${btnBase} border-[rgba(197,122,74,0.55)] ${ACCENT_TEXT} bg-[linear-gradient(135deg,rgba(197,122,74,0.22),rgba(197,122,74,0.12))] hover:bg-[linear-gradient(135deg,rgba(197,122,74,0.3),rgba(197,122,74,0.18))]`;
  const btnBlue = `${btnBase} border-sky-500/30 bg-sky-950/25 text-sky-100 hover:bg-sky-900/25`;

  const pillBase =
    "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold";
  const pillOk = `${pillBase} border-emerald-500/30 bg-emerald-950/25 text-emerald-200`;
  const pillZero = `${pillBase} border-red-500/30 bg-red-950/35 text-red-200`;

  // ---------- on-hand loader (pass sid directly; avoids first-render zeros)
  const loadOnHand = useCallback(
    async (sid: string, partIds: string[]) => {
      if (!partIds.length) {
        setOnHand({});
        return;
      }
      const { data, error } = await supabase
        .from("stock_moves")
        .select("part_id, qty_change")
        .in("part_id", partIds)
        .eq("shop_id", sid);

      if (error || !data) {
        setOnHand({});
        return;
      }

      const totals: Record<string, number> = {};
      (data as StockMove[]).forEach((m) => {
        const delta = Number(m.qty_change) || 0;
        totals[m.part_id] = (totals[m.part_id] ?? 0) + delta;
      });
      setOnHand(totals);
    },
    [supabase],
  );

  const load = useCallback(
    async (sid: string) => {
      setLoading(true);

      const base = supabase
        .from("parts")
        .select("*")
        .eq("shop_id", sid)
        .order("name", { ascending: true });

      const q = search.trim();

      const { data, error } = await (q
        ? base.or(
            [
              `name.ilike.%${q}%`,
              `sku.ilike.%${q}%`,
              `part_number.ilike.%${q}%`,
              `category.ilike.%${q}%`,
            ].join(","),
          )
        : base);

      const partRows = (!error && (data as Part[])) || [];
      setParts(partRows);
      setLoading(false);

      if (partRows.length > 0) {
        const partIds = partRows.map((p) => p.id);
        const [aliasRes, stagingRes] = await Promise.all([
          supabase
            .from("shop_parts_source_aliases")
            .select("part_id, alias_type, source_system")
            .eq("shop_id", sid)
            .in("part_id", partIds),
          supabase
            .from("shop_parts_import_staging")
            .select("matched_part_id, source_system, status")
            .eq("shop_id", sid)
            .in("matched_part_id", partIds),
        ]);

        const aliasByPart = new Map<string, AliasRow[]>();
        ((aliasRes.data ?? []) as AliasRow[]).forEach((row) => {
          const key = String(row.part_id ?? "");
          if (!key) return;
          if (!aliasByPart.has(key)) aliasByPart.set(key, []);
          aliasByPart.get(key)?.push(row);
        });

        const stagingByPart = new Map<string, StagingRow[]>();
        ((stagingRes.data ?? []) as StagingRow[]).forEach((row) => {
          const key = String(row.matched_part_id ?? "");
          if (!key) return;
          if (!stagingByPart.has(key)) stagingByPart.set(key, []);
          stagingByPart.get(key)?.push(row);
        });

        const nextTrust: Record<string, TrustMeta> = {};
        partRows.forEach((p) => {
          const extended = p as Part & { import_confidence?: number | null };
          const aliases = aliasByPart.get(p.id) ?? [];
          const stagingRows = stagingByPart.get(p.id) ?? [];
          nextTrust[p.id] = buildPartTrustMeta({
            externalId: (p as Part & { external_id?: string | null }).external_id,
            sku: p.sku,
            partNumber: p.part_number,
            name: p.name,
            vendor: (p as Part & { supplier?: string | null }).supplier,
            category: p.category,
            price: typeof p.price === "number" ? p.price : null,
            cost: typeof (p as Part & { cost?: number | null }).cost === "number" ? (p as Part & { cost?: number | null }).cost ?? null : null,
            normalizedPartKey: p.normalized_part_key,
            sourceIntakeId: p.source_intake_id,
            aliasCount: aliases.length,
            pendingStagingCount: stagingRows.length,
            ambiguousCandidateCount: stagingRows.some((s) =>
              ["pending", "review", "ambiguous"].includes(String(s.status ?? "").toLowerCase()),
            )
              ? 1
              : 0,
            importConfidence: extended.import_confidence,
          });
        });

        setTrustByPartId(nextTrust);
      } else {
        setTrustByPartId({});
      }

      void loadOnHand(sid, partRows.map((p) => p.id));
    },
    [supabase, search, loadOnHand],
  );

  // --- on-hand detail (per-location)
  const openOnHandDetail = useCallback(
    async (p: Part) => {
      setOhForPart(p);

      const { data, error } = await supabase
        .from("stock_moves")
        .select("location_id, qty_change")
        .eq("part_id", p.id)
        .eq("shop_id", shopId);

      if (error || !data) {
        setOhLines([]);
        setOhOpen(true);
        return;
      }

      const byLoc: Record<string, number> = {};
      (data as StockMove[]).forEach((r) => {
        const loc = r.location_id as string;
        const q = Number(r.qty_change) || 0;
        byLoc[loc] = (byLoc[loc] ?? 0) + q;
      });

      const lines = locs
        .map((l) => ({
          location: `${l.code ?? "LOC"} — ${l.name ?? ""}`,
          qty: byLoc[l.id] ?? 0,
        }))
        .filter((x) => x.qty !== 0);

      setOhLines(lines);
      setOhOpen(true);
    },
    [supabase, shopId, locs],
  );

  /* boot */
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      if (!uid) return;

      const { data: profA } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .maybeSingle();

      const sidA = (profA?.shop_id as string) || "";

      const sid = sidA || "";
      setShopId(sid);
      if (!sid) return;

      const { data: l } = await supabase
        .from("stock_locations")
        .select("*")
        .eq("shop_id", sid)
        .order("code");

      const locRows = (l as StockLoc[]) ?? [];
      setLocs(locRows);

      const main = locRows.find((x) => (x.code ?? "").toUpperCase() === "MAIN");
      if (main) {
        setInitLoc(main.id);
        setRecvLoc(main.id);
        setCsvDefaultLoc(main.id);
      } else if (locRows[0]?.id) {
        setInitLoc(locRows[0].id);
        setRecvLoc(locRows[0].id);
        setCsvDefaultLoc(locRows[0].id);
      }

      await load(sid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, load]);

  /* refetch on search */
  useEffect(() => {
    if (shopId) void load(shopId);
  }, [search, shopId, load]);

  /* ----------------------- CRUD handlers ----------------------- */

  const createPart = async () => {
    if (!shopId || !name.trim()) return;

    const id = uuidv4();
    const insert: PartInsert = {
      id,
      shop_id: shopId,
      name: name.trim(),
      sku: sku.trim() ? sku.trim() : undefined,
      part_number: partNumber.trim() ? partNumber.trim() : undefined,
      category: category.trim() ? category.trim() : undefined,
      price: typeof price === "number" ? price : undefined,
    };

    const { error } = await supabase.from("parts").insert(insert);
    if (error) {
      alert(error.message);
      return;
    }

    // optional initial receive
    if (initLoc && typeof initQty === "number" && initQty > 0) {
      try {
        await applyStockMoveRPC(supabase, {
          p_part: id,
          p_loc: initLoc,
          p_qty: initQty,
          p_reason: "receive",
          p_ref_kind: "manual_receive",
          p_ref_id: null,
        });
      } catch (err: unknown) {
        alert(`Part created, but stock receive failed: ${errMsg(err)}`);
      }
    }

    setAddOpen(false);
    setName("");
    setSku("");
    setPartNumber("");
    setCategory("");
    setPrice("");
    setInitQty("");
    await load(shopId);
  };

  const openEdit = (p: Part) => {
    setEditPart(p);
    setEditName(p.name ?? "");
    setEditSku(p.sku ?? "");
    setEditPartNumber(p.part_number ?? "");
    setEditCategory(p.category ?? "");
    setEditPrice(typeof p.price === "number" ? p.price : "");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editPart?.id) return;

    const patch: PartUpdate = {
      name: editName.trim() ? editName.trim() : undefined,
      sku: editSku.trim() ? editSku.trim() : undefined,
      part_number: editPartNumber.trim() ? editPartNumber.trim() : undefined,
      category: editCategory.trim() ? editCategory.trim() : undefined,
      price: typeof editPrice === "number" ? editPrice : undefined,
    };

    const { error } = await supabase.from("parts").update(patch).eq("id", editPart.id);
    if (error) {
      alert(error.message);
      return;
    }

    setEditOpen(false);
    await load(shopId);
  };

  const openReceive = (p: Part) => {
    setRecvPart(p);
    setRecvQty("");
    setRecvOpen(true);
  };

  const applyReceive = async () => {
    if (!recvPart?.id || !recvLoc || typeof recvQty !== "number" || recvQty <= 0) return;

    try {
      await applyStockMoveRPC(supabase, {
        p_part: recvPart.id,
        p_loc: recvLoc,
        p_qty: recvQty,
        p_reason: "receive",
        p_ref_kind: "manual_receive",
        p_ref_id: null,
      });
      setRecvOpen(false);
      await load(shopId);
    } catch (err: unknown) {
      alert(errMsg(err));
    }
  };

  /* -------------------------- Import CSV -------------------------- */

  const parseAndPreviewCSV = (raw: string) => {
    const rawRows = parseCSV(raw);
    const parsed = parsePartCsvRows(raw);
    setCsvHeaders(rawRows[0]?.map(normalizeHeader).filter(Boolean) ?? []);
    setCsvRows(parsed);
    setCsvPreview(parsed.length > 0);
    setCsvResult(null);
    setCsvError(parsed.length ? null : "No parts rows were found in that CSV.");
    setCsvProgress({
      phase: parsed.length ? "Validation complete" : "No rows found",
      phaseKey: parsed.length ? "validating" : "failed",
      processed: parsed.length,
      total: parsed.length,
      percent: parsed.length ? 35 : 100,
      failed: parsed.filter((row) => row.errors.length > 0).length,
      skipped: parsed.filter((row) => row.warnings.length > 0).length,
    });
  };

  const handleCsvFile = async (file: File) => {
    setCsvResult(null);
    setCsvError(null);
    setCsvProgress({ phase: "Reading file", phaseKey: "reading_file", processed: 0, total: 0, percent: 5 });
    const text = await file.text();
    parseAndPreviewCSV(text);
  };

  const completePartsOnboardingAfterImport = async (counts: PartCsvImportCounts) => {
    if (!guidedQuery || guidedQuery.onboardingStep !== "parts") return;
    setCsvCompletingOnboarding(true);
    try {
      const response = await fetch(
        `/api/onboarding-v2/guided/sessions/${encodeURIComponent(guidedQuery.onboardingSession)}/steps/parts/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summary: { importType: "parts_inventory_csv", ...counts } }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? "Parts import succeeded, but onboarding completion failed.");
      }
    } finally {
      setCsvCompletingOnboarding(false);
    }
  };

  const resolveCsvLocationId = async (row: ParsedPartCsvRow): Promise<string> => {
    const requested = row.location?.trim();
    if (!requested) return csvDefaultLoc;
    const existing = locs.find((loc) =>
      [loc.id, loc.code, loc.name].some((value) => String(value ?? "").toLowerCase() === requested.toLowerCase()),
    );
    if (existing?.id) return existing.id;
    return csvDefaultLoc;
  };

  const runCsvImport = async () => {
    const importableRows = csvRows.filter((row) => row.errors.length === 0 && row.active !== false);
    if (!shopId || !importableRows.length || csvImporting || csvResult) return;

    setCsvImporting(true);
    setCsvError(null);
    const counts: PartCsvImportCounts = { created: 0, updated: 0, skipped: 0, failed: 0 };
    const skipped: PartCsvImportResult["skipped"] = [];
    const errors: PartCsvImportResult["errors"] = [];

    try {
      setCsvProgress({ phase: "Preloading existing parts", phaseKey: "importing", processed: 0, total: importableRows.length, percent: 42, imported: 0, skipped: 0, failed: 0 });

      const rowsByIdentity: ParsedPartCsvRow[] = [];
      const seen = new Set<string>();
      for (const row of importableRows) {
        const key = csvIdentityKey(row);
        if (!key.startsWith("row:") && seen.has(key)) {
          counts.skipped += 1;
          skipped.push({ row: row.rowNumber, reason: "Duplicate authoritative identity already handled earlier in this CSV." });
          continue;
        }
        if (!key.startsWith("row:")) seen.add(key);
        rowsByIdentity.push(row);
      }

      const externalIds = [...new Set(rowsByIdentity.map((r) => r.external_id).filter(Boolean) as string[])];
      const skus = [...new Set(rowsByIdentity.map((r) => r.sku).filter(Boolean) as string[])];
      const partNumbers = [...new Set(rowsByIdentity.map((r) => r.part_number).filter(Boolean) as string[])];
      const barcodes = [...new Set(rowsByIdentity.map((r) => r.barcode).filter(Boolean) as string[])];

      const [externalMatches, skuMatches, partMatches, barcodeMatches] = await Promise.all([
        externalIds.length ? supabase.from("parts").select("id,external_id,sku,part_number").eq("shop_id", shopId).in("external_id", externalIds) : Promise.resolve({ data: [], error: null }),
        skus.length ? supabase.from("parts").select("id,external_id,sku,part_number").eq("shop_id", shopId).in("sku", skus) : Promise.resolve({ data: [], error: null }),
        partNumbers.length ? supabase.from("parts").select("id,external_id,sku,part_number").eq("shop_id", shopId).in("part_number", partNumbers) : Promise.resolve({ data: [], error: null }),
        barcodes.length ? supabase.from("parts_barcodes").select("part_id,barcode").eq("shop_id", shopId).in("barcode", barcodes) : Promise.resolve({ data: [], error: null }),
      ]);
      for (const res of [externalMatches, skuMatches, partMatches, barcodeMatches]) if (res.error) throw res.error;

      const byExternal = new Map(((externalMatches.data ?? []) as Part[]).map((p) => [normalizeIdentity((p as Part & { external_id?: string | null }).external_id), p.id]));
      const bySku = new Map(((skuMatches.data ?? []) as Part[]).map((p) => [normalizeIdentity(p.sku), p.id]));
      const byPart = new Map(((partMatches.data ?? []) as Part[]).map((p) => [normalizeIdentity(p.part_number), p.id]));
      const byBarcode = new Map(((barcodeMatches.data ?? []) as Array<{ part_id: string; barcode: string }>).map((p) => [normalizeIdentity(p.barcode), p.part_id]));

      const payloads: PartInsert[] = [];
      const rowPartIds = new Map<number, string>();
      for (const row of rowsByIdentity) {
        const matchedId = byExternal.get(normalizeIdentity(row.external_id)) ?? bySku.get(normalizeIdentity(row.sku)) ?? byPart.get(normalizeIdentity(row.part_number)) ?? byBarcode.get(normalizeIdentity(row.barcode));
        const partId = matchedId ?? uuidv4();
        rowPartIds.set(row.rowNumber, partId);
        if (matchedId) counts.updated += 1;
        else counts.created += 1;
        payloads.push({ id: partId, shop_id: shopId, external_id: row.external_id, sku: row.sku, part_number: row.part_number, name: row.name, description: row.description, category: row.category, supplier: row.vendor, unit: row.unit, cost: row.cost_price, default_cost: row.cost_price, price: row.sell_price, default_price: row.sell_price, low_stock_threshold: row.min_stock, taxable: row.taxable, import_notes: [row.brand ? `Brand: ${row.brand}` : null, row.bin ? `Bin: ${row.bin}` : null].filter(Boolean).join(" · ") || undefined });
      }

      setCsvProgress({ phase: "Saving parts in batches", phaseKey: "importing", processed: 0, total: rowsByIdentity.length, percent: 58, imported: 0, skipped: counts.skipped, failed: 0 });
      for (const group of chunk(payloads, 500)) {
        const { error } = await supabase.from("parts").upsert(group, { onConflict: "id" });
        if (error) throw error;
        setCsvProgress((prev) => ({ ...(prev ?? { phase: "Saving parts in batches", phaseKey: "importing", processed: 0, total: rowsByIdentity.length, percent: 58 }), processed: Math.min(rowsByIdentity.length, (prev?.processed ?? 0) + group.length), imported: Math.min(rowsByIdentity.length, (prev?.imported ?? 0) + group.length) }));
      }

      const barcodePayloads = rowsByIdentity.filter((row) => row.barcode && rowPartIds.get(row.rowNumber)).map((row) => ({ shop_id: shopId, part_id: rowPartIds.get(row.rowNumber) as string, barcode: row.barcode as string }));
      for (const group of chunk(barcodePayloads, 500)) {
        const { error } = await supabase.from("parts_barcodes").upsert(group, { onConflict: "shop_id,barcode" });
        if (error) skipped.push(...group.map((_, index) => ({ row: rowsByIdentity[index]?.rowNumber ?? 0, reason: `Barcode batch was not fully saved: ${error.message}` })));
      }

      const stockRows = rowsByIdentity.filter((row) => typeof row.quantity_on_hand === "number" && rowPartIds.get(row.rowNumber));
      const stockPartIds = stockRows.map((row) => rowPartIds.get(row.rowNumber) as string);
      const { data: existingMoves, error: movesError } = stockPartIds.length ? await supabase.from("stock_moves").select("part_id, location_id, qty_change").eq("shop_id", shopId).in("part_id", stockPartIds) : { data: [], error: null };
      if (movesError) throw movesError;
      const currentByPartLoc = new Map<string, number>();
      ((existingMoves ?? []) as Array<{ part_id: string; location_id: string; qty_change: number }>).forEach((move) => {
        const key = `${move.part_id}:${move.location_id}`;
        currentByPartLoc.set(key, (currentByPartLoc.get(key) ?? 0) + (Number(move.qty_change) || 0));
      });

      let adjusted = 0;
      for (const row of stockRows) {
        const partId = rowPartIds.get(row.rowNumber);
        const locId = await resolveCsvLocationId(row);
        if (!partId || !locId) {
          skipped.push({ row: row.rowNumber, reason: "Quantity was not applied because no stock location was selected or matched." });
          continue;
        }
        const delta = (row.quantity_on_hand as number) - (currentByPartLoc.get(`${partId}:${locId}`) ?? 0);
        if (delta !== 0) await applyStockMoveRPC(supabase, { p_part: partId, p_loc: locId, p_qty: delta, p_reason: "adjust", p_ref_kind: "parts_inventory_csv_import", p_ref_id: null });
        adjusted++;
        if (adjusted % 25 === 0 || adjusted === stockRows.length) setCsvProgress({ phase: "Applying stock adjustments", phaseKey: "importing", processed: adjusted, total: stockRows.length, percent: 84 + Math.round((adjusted / Math.max(1, stockRows.length)) * 10), imported: counts.created + counts.updated, skipped: counts.skipped, failed: counts.failed });
      }

      counts.skipped += csvRows.filter((row) => row.errors.length > 0 || row.active === false).length;
      const result = { counts, errors, skipped };
      setCsvResult(result);
      if (counts.failed === 0 && counts.created + counts.updated > 0) {
        setCsvProgress({ phase: "Completing guided step", phaseKey: "finalizing", processed: rowsByIdentity.length, total: rowsByIdentity.length, percent: 96, imported: counts.created + counts.updated, skipped: counts.skipped, failed: counts.failed });
        await completePartsOnboardingAfterImport(counts);
      }
      setCsvProgress({ phase: counts.failed > 0 ? "Import completed with failures" : "Completed", phaseKey: counts.failed > 0 ? "failed" : "completed", processed: rowsByIdentity.length, total: rowsByIdentity.length, percent: 100, imported: counts.created + counts.updated, skipped: counts.skipped, failed: counts.failed });
      await load(shopId);
    } catch (error) {
      setCsvError(errMsg(error));
      setCsvProgress({ phase: "Failed", phaseKey: "failed", processed: 0, total: importableRows.length, percent: 100, failed: counts.failed || 1 });
    } finally {
      setCsvImporting(false);
    }
  };

  /* ----------------------------- UI ----------------------------- */
  const visibleParts = parts.filter((p) => {
    if (trustFilter === "all") return true;
    const trust = trustByPartId[p.id];
    if (trustFilter === "low") return trust?.level === "low";
    return trust?.level === "review" || trust?.level === "low";
  });

  const suspectCount = parts.filter((p) => {
    const level = trustByPartId[p.id]?.level;
    return level === "review" || level === "low";
  }).length;

  const defaultListLimited = !search.trim() && trustFilter === "all";
  const displayedParts = defaultListLimited ? visibleParts.slice(0, 25) : visibleParts;
  const csvImportableRows = csvRows.filter((row) => row.errors.length === 0 && row.active !== false);
  const csvReviewRows = csvRows.filter((row) => row.errors.length > 0 || row.active === false || row.warnings.length > 0);
  const csvImportSucceeded = Boolean(csvResult && csvResult.counts.failed === 0 && csvResult.counts.created + csvResult.counts.updated > 0);

  return (
    <div className={pageWrap}>
      <GuidedPageStepPanel
        actions={{
          parts: {
            label: "Open import tools",
            description: "Upload, preview, validate, and import parts inventory CSV rows into the existing parts and stock tables.",
            onClick: () => csvSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
        }}
      />

      <div className={`${glassCard} overflow-hidden`}>
        <div className={`${glassHeader} px-5 py-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">
                Parts
              </div>
              <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-blackops), system-ui" }}>
                Inventory
              </h1>
              <div className="mt-1 text-sm text-neutral-400">
                Create parts, quick receive, and import stock from CSV.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href="/assistant?pageType=parts_inventory&pageTitle=Parts%20Inventory" className={btnBlue}>
                Ask Assistant
              </Link>

              <input
                className={`${inputBase} w-72`}
                placeholder="Search name / SKU / part # / category"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <button className={btnBlue} onClick={() => setAddOpen(true)} disabled={!shopId}>
                Add Part
              </button>

              <button className={btnBlue} onClick={() => csvSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} disabled={!shopId}>
                Import CSV
              </button>
              <select
                className={inputBase}
                value={trustFilter}
                onChange={(e) => setTrustFilter(e.target.value as "all" | "review" | "low")}
              >
                <option value="all">Trust: All rows</option>
                <option value="review">Trust: Review + low</option>
                <option value="low">Trust: Low only</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div ref={csvSectionRef} id="parts-inventory-csv-import" className="scroll-mt-6">
        <GuidedImportCardLayout
          testId="parts-inventory-csv-import-card"
          eyebrow={guidedQuery?.onboardingStep === "parts" ? "Guided onboarding · Parts" : "Parts inventory"}
          title="Import parts inventory CSV"
          description={
            <>
              <p>
                Upload a CSV, review validation results, then confirm the import into the existing parts and stock movement records.
              </p>
              <p>
                Supported columns: <span className="text-neutral-100">{PART_CSV_FIELDS.join(", ")}</span>.
              </p>
            </>
          }
          actions={
            <>
              <input
                ref={csvFileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleCsvFile(file);
                }}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => { setCsvResult(null); csvFileInputRef.current?.click(); }}
                className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-white hover:border-[var(--accent-copper-soft)]/65"
                disabled={!shopId || csvImporting || csvCompletingOnboarding}
              >
                Choose CSV file
              </button>
            </>
          }
        >
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
              <div className="text-lg font-semibold text-white">{csvRows.length}</div>
              <div className="text-xs text-neutral-400">Parsed rows</div>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-2">
              <div className="text-lg font-semibold text-emerald-100">{csvImportableRows.length}</div>
              <div className="text-xs text-neutral-400">Ready to import</div>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-2">
              <div className="text-lg font-semibold text-amber-100">{csvReviewRows.length}</div>
              <div className="text-xs text-neutral-400">Need review</div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-3 text-sm text-neutral-300">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Detected columns</div>
                <div className="mt-1 text-neutral-200">
                  {csvHeaders.length ? csvHeaders.join(", ") : "No CSV selected yet."}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Name is required. SKU or part_number is recommended so re-imports update deterministically.
                </div>
              </div>
              <div className="min-w-[260px]">
                <SelectField
                  label="Default receive location"
                  value={csvDefaultLoc}
                  onChange={setCsvDefaultLoc}
                  options={[
                    { value: "", label: "— none —" },
                    ...locs.map((l) => ({
                      value: l.id,
                      label: `${l.code ?? "LOC"} — ${l.name ?? ""}`,
                    })),
                  ]}
                />
              </div>
            </div>
          </div>

          {csvPreview ? (
            <div className="mt-4 max-h-96 overflow-auto rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-white/5 text-left text-neutral-400">
                  <tr>
                    <th className="p-3">Row</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">SKU / Part #</th>
                    <th className="p-3">Vendor</th>
                    <th className="p-3">Cost / Sell</th>
                    <th className="p-3">Qty / Min</th>
                    <th className="p-3">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 50).map((row) => (
                    <tr key={row.rowNumber} className="border-t border-[color:var(--desktop-border)]">
                      <td className="p-3 tabular-nums text-neutral-400">{row.rowNumber}</td>
                      <td className="p-3">{row.name || "—"}</td>
                      <td className="p-3 font-mono text-xs text-neutral-300">{row.sku ?? "—"} / {row.part_number ?? "—"}</td>
                      <td className="p-3">{row.vendor ?? row.brand ?? "—"}</td>
                      <td className="p-3 tabular-nums">{typeof row.cost_price === "number" ? `$${row.cost_price.toFixed(2)}` : "—"} / {typeof row.sell_price === "number" ? `$${row.sell_price.toFixed(2)}` : "—"}</td>
                      <td className="p-3 tabular-nums">{typeof row.quantity_on_hand === "number" ? row.quantity_on_hand : "—"} / {typeof row.min_stock === "number" ? row.min_stock : "—"}</td>
                      <td className="p-3 text-xs">
                        {row.active === false ? <span className="text-amber-200">Inactive row will be skipped</span> : row.errors.length ? <span className="text-red-300">{row.errors.join(" · ")}</span> : row.warnings.length ? <span className="text-amber-200">{row.warnings.join(" · ")}</span> : <span className="text-emerald-200">Ready</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvRows.length > 50 ? <div className="border-t border-[color:var(--desktop-border)] p-3 text-xs text-neutral-500">Showing first 50 of {csvRows.length} rows.</div> : null}
            </div>
          ) : null}

          <CsvImportProgress progress={csvProgress} label="Parts inventory CSV import progress" />

          {csvError ? <GuidedImportSummary tone="error">{csvError}</GuidedImportSummary> : null}

          {csvResult ? (
            <GuidedImportSummary tone={csvResult.counts.failed > 0 ? "warning" : "success"}>
              <div className="font-semibold">
                Created {csvResult.counts.created}, updated {csvResult.counts.updated}, skipped {csvResult.counts.skipped}, failed {csvResult.counts.failed}.
              </div>
              {csvResult.skipped.length > 0 ? (
                <ul className="mt-2 list-disc pl-5 text-xs">
                  {csvResult.skipped.slice(0, 5).map((item) => <li key={`skipped-${item.row}-${item.reason}`}>Row {item.row}: {item.reason}</li>)}
                </ul>
              ) : null}
              {csvResult.errors.length > 0 ? (
                <ul className="mt-2 list-disc pl-5 text-xs">
                  {csvResult.errors.slice(0, 5).map((item) => <li key={`failed-${item.row}-${item.error}`}>Row {item.row}: {item.error}</li>)}
                </ul>
              ) : null}
              {guidedQuery?.onboardingStep === "parts" && csvImportSucceeded ? (
                <button
                  type="button"
                  onClick={() => router.push(guidedQuery.returnTo)}
                  className="mt-3 rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-900/30"
                >
                  Continue onboarding
                </button>
              ) : null}
            </GuidedImportSummary>
          ) : null}

          <GuidedImportFooterActions
            importing={csvImporting}
            completing={csvCompletingOnboarding}
            canConfirm={csvImportableRows.length > 0 && !csvResult && !csvImporting && !csvCompletingOnboarding}
            onConfirm={() => void runCsvImport()}
            isOnboarding={guidedQuery?.onboardingStep === "parts"}
            returnTo={guidedQuery?.returnTo}
            importSucceeded={csvImportSucceeded}
            hasResult={Boolean(csvResult)}
            onContinue={guidedQuery ? () => router.push(guidedQuery.returnTo) : undefined}
          />
        </GuidedImportCardLayout>
      </div>

      {loading ? (
        <div className={`${glassCard} p-4 text-sm text-neutral-300`}>Loading…</div>
      ) : visibleParts.length === 0 ? (
        <div className={`${glassCard} p-4 text-sm text-neutral-300`}>
          No inventory rows match this filter.
        </div>
      ) : (
        <div className={`${glassCard} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--desktop-item-bg)] text-neutral-400">
                <tr className="text-left">
                  <th className="p-3">Name</th>
                  <th className="w-40 p-3">SKU</th>
                  <th className="w-40 p-3">Part #</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Trust</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">On hand</th>
                  <th className="w-56 p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedParts.map((p) => {
                  const summary = toPartDisplaySummary(p);
                  const total = onHand[p.id] ?? 0;
                  const onHandPill = total > 0 ? pillOk : pillZero;
                  const trust = trustByPartId[p.id] ?? { level: "high", reasons: [] as string[] };
                  return (
                    <tr key={p.id} className="border-t border-[color:var(--desktop-border)]">
                      <td className="p-3">
                        <div className="font-medium text-white">{summary.name}</div>
                        {/* Previously this subtitle rendered String(p.id).slice(0, 8), which exposed internal ids as unlabeled metadata. */}
                        <div className="mt-0.5 text-xs text-neutral-500">Record ID in Edit modal</div>
                      </td>
                      <td className="p-3 font-mono text-xs text-neutral-300">{summary.sku ?? "—"}</td>
                      <td className="p-3 font-mono text-xs text-neutral-300">{summary.partNumber ?? "—"}</td>
                      <td className="p-3">{summary.category ?? "—"}</td>
                      <td className="p-3">
                        <div className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${trustBadgeTone(trust.level)}`}>
                          {trustLevelLabel(trust.level)}
                        </div>
                        {trust.reasons.length > 0 ? (
                          <div className="mt-1 line-clamp-2 text-xs text-neutral-400">
                            {trust.reasons.slice(0, 2).join(" · ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-3 tabular-nums">
                        {typeof p.price === "number" ? `$${p.price.toFixed(2)}` : "—"}
                      </td>
                      <td className="p-3">
                        <button
                          className={`${onHandPill} hover:bg-white/5`}
                          onClick={() => void openOnHandDetail(p)}
                          title="View per-location balance"
                        >
                          {total}
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          <button className={btnGhost} onClick={() => openEdit(p)}>
                            Edit
                          </button>
                          <button className={btnBlue} onClick={() => openReceive(p)}>
                            Receive
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[color:var(--desktop-border)] px-5 py-3 text-xs text-neutral-500">
            Tip: Click on-hand to see locations. {defaultListLimited ? `Showing ${displayedParts.length} of ${visibleParts.length} inventory rows by default. Search or filter to refine results. ` : null}{suspectCount} row(s) currently flagged for trust review.
          </div>
        </div>
      )}

      {/* Add Part */}
      <Modal
        open={addOpen}
        title="Add Part"
        onClose={() => setAddOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button className={btnCopper} onClick={createPart} disabled={!name.trim()}>
              Save Part
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField label="Name*" value={name} onChange={setName} placeholder="Part name" />
          </div>
          <TextField label="SKU" value={sku} onChange={setSku} placeholder="Optional" />
          <TextField
            label="Part Number"
            value={partNumber}
            onChange={setPartNumber}
            placeholder="Manufacturer or internal part #"
          />
          <TextField label="Category" value={category} onChange={setCategory} placeholder="Optional" />
          <NumberField label="Price" value={price} onChange={(v) => setPrice(v === "" ? "" : v)} />
        </div>

        <div className="mt-4 rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-3">
          <div className="mb-2 text-sm font-semibold text-white">
            Initial Stock <span className="text-xs font-normal text-neutral-400">(optional)</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Location"
              value={initLoc}
              onChange={setInitLoc}
              options={[
                { value: "", label: "— none —" },
                ...locs.map((l) => ({
                  value: l.id,
                  label: `${l.code ?? "LOC"} — ${l.name ?? ""}`,
                })),
              ]}
            />
            <NumberField
              label="Qty"
              value={initQty}
              min={0}
              step={1}
              onChange={(v) => setInitQty(v === "" ? "" : Math.max(0, v))}
            />
          </div>
        </div>
      </Modal>

      {/* Edit Part */}
      <Modal
        open={editOpen}
        title="Edit Part"
        onClose={() => setEditOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setEditOpen(false)}>
              Cancel
            </button>
            <button className={btnCopper} onClick={saveEdit} disabled={!editName.trim()}>
              Save Changes
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField label="Name*" value={editName} onChange={setEditName} />
          </div>
          <TextField label="SKU" value={editSku} onChange={setEditSku} />
          <TextField label="Part Number" value={editPartNumber} onChange={setEditPartNumber} />
          <TextField label="Category" value={editCategory} onChange={setEditCategory} />
          <NumberField label="Price" value={editPrice} onChange={(v) => setEditPrice(v === "" ? "" : v)} />
          <div className="sm:col-span-2 text-xs text-neutral-500">
            {editPart?.id ? `Internal record id: ${editPart.id}` : ""}
          </div>
        </div>
      </Modal>

      {/* Receive Stock */}
      <Modal
        open={recvOpen}
        title={recvPart ? `Receive — ${recvPart.name}` : "Receive Stock"}
        onClose={() => setRecvOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setRecvOpen(false)}>
              Cancel
            </button>
            <button
              className={btnBlue}
              onClick={applyReceive}
              disabled={!recvPart?.id || !recvLoc || typeof recvQty !== "number" || recvQty <= 0}
            >
              Apply Receive
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Location"
            value={recvLoc}
            onChange={setRecvLoc}
            options={locs.map((l) => ({
              value: l.id,
              label: `${l.code ?? "LOC"} — ${l.name ?? ""}`,
            }))}
          />
          <NumberField
            label="Qty"
            value={recvQty}
            min={0}
            step={1}
            onChange={(v) => setRecvQty(v === "" ? "" : Math.max(0, v))}
          />
        </div>
      </Modal>

      {/* On-hand detail */}
      <Modal
        open={ohOpen}
        title={ohForPart ? `On hand — ${ohForPart.name}` : "On hand"}
        onClose={() => setOhOpen(false)}
        widthClass="max-w-lg"
      >
        {ohLines.length === 0 ? (
          <div className="text-sm text-neutral-300">No movement found for this part.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-neutral-400">
                <tr>
                  <th className="p-3">Location</th>
                  <th className="p-3">Qty</th>
                </tr>
              </thead>
              <tbody>
                {ohLines.map((l, i) => (
                  <tr key={i} className="border-t border-[color:var(--desktop-border)]">
                    <td className="p-3">{l.location}</td>
                    <td className="p-3 tabular-nums">{l.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

    </div>
  );
}

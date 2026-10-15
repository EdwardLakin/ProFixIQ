import {
  ASSET_OPERATING_STATUSES,
  type AssetOperatingStatus,
} from "@/features/equipment/lib/assetProfile";
import {
  equipmentNeedsAttention,
  type EquipmentDirectoryRow,
  type EquipmentPmState,
} from "@/features/equipment/lib/equipmentDirectory";

/** Rows per page on the Assets list and the Equipment section pages. */
export const DIRECTORY_PAGE_SIZE = 50;
/** Most assets the identity index reads for a shop; beyond this the list says so. */
export const IDENTITY_INDEX_MAX_ASSETS = 5_000;
/** Most matching assets scored with PM/inspection evidence for one request. */
export const EVIDENCE_SCAN_MAX_ASSETS = 2_000;

const PM_STATES: readonly EquipmentPmState[] = ["overdue", "due", "ok", "not_evaluated"];
const MAX_SEARCH_LENGTH = 100;

/** What the list needs to find and show an asset without any history reads. */
export type EquipmentIdentityRow = {
  assetId: string;
  /** Profile `updated_at`; the list is ordered newest first. */
  updatedAt: string;
  unitNumber: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  equipmentClass: string;
  equipmentClassLabel: string;
  customerId: string | null;
  customerName: string | null;
  siteName: string | null;
  operatingStatus: AssetOperatingStatus;
};

export type EquipmentDirectoryFilters = {
  q: string;
  equipmentClass: string;
  status: "" | AssetOperatingStatus;
  customerId: string;
  pm: "" | EquipmentPmState;
  attention: boolean;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Read list filters from URL params, ignoring anything malformed. */
export function parseDirectoryFilters(params: RawParams): EquipmentDirectoryFilters {
  const status = first(params.status);
  const pm = first(params.pm);
  const page = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q).trim().slice(0, MAX_SEARCH_LENGTH),
    equipmentClass: first(params.class).trim().slice(0, 80),
    status: (ASSET_OPERATING_STATUSES as readonly string[]).includes(status)
      ? (status as AssetOperatingStatus)
      : "",
    customerId: first(params.customer).trim().slice(0, 64),
    pm: (PM_STATES as readonly string[]).includes(pm) ? (pm as EquipmentPmState) : "",
    attention: first(params.attention) === "1",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

/** True when a filter can only be answered from PM / inspection / status evidence. */
export function directoryFiltersNeedEvidence(filters: EquipmentDirectoryFilters): boolean {
  return filters.pm !== "" || filters.attention;
}

/** Query string for the current filters (omits defaults), with optional overrides. */
export function directoryQueryString(
  filters: EquipmentDirectoryFilters,
  overrides: Partial<EquipmentDirectoryFilters> = {},
): string {
  const next = { ...filters, ...overrides };
  const query = new URLSearchParams();
  if (next.q) query.set("q", next.q);
  if (next.equipmentClass) query.set("class", next.equipmentClass);
  if (next.status) query.set("status", next.status);
  if (next.customerId) query.set("customer", next.customerId);
  if (next.pm) query.set("pm", next.pm);
  if (next.attention) query.set("attention", "1");
  if (next.page > 1) query.set("page", String(next.page));
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** Everything the free-text search matches on (the same fields the list always searched). */
function searchText(row: EquipmentIdentityRow): string {
  return [
    row.unitNumber,
    row.make,
    row.model,
    row.serialNumber,
    row.customerName,
    row.siteName,
    row.equipmentClassLabel,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

/** Apply the filters answerable from identity alone (search, class, status, customer). */
export function applyIdentityFilters(
  rows: EquipmentIdentityRow[],
  filters: Pick<EquipmentDirectoryFilters, "q" | "equipmentClass" | "status" | "customerId">,
): EquipmentIdentityRow[] {
  const needle = filters.q.toLowerCase();
  return rows.filter((row) => {
    if (filters.status && row.operatingStatus !== filters.status) return false;
    if (filters.equipmentClass && row.equipmentClass !== filters.equipmentClass) return false;
    if (filters.customerId && row.customerId !== filters.customerId) return false;
    return !needle || searchText(row).includes(needle);
  });
}

/** Apply the filters that need evidence (PM state, needs attention) to computed rows. */
export function applyEvidenceFilters(
  rows: EquipmentDirectoryRow[],
  filters: Pick<EquipmentDirectoryFilters, "pm" | "attention">,
): EquipmentDirectoryRow[] {
  return rows.filter((row) => {
    if (filters.pm && row.pm.state !== filters.pm) return false;
    return !filters.attention || equipmentNeedsAttention(row);
  });
}

export type PageInfo = {
  page: number;
  pageCount: number;
  total: number;
  /** 1-based, inclusive; 0 when empty. */
  from: number;
  to: number;
};

/** Slice one page, clamping an out-of-range page to the last one. */
export function paginate<T>(
  items: readonly T[],
  page: number,
  size: number = DIRECTORY_PAGE_SIZE,
): { items: T[]; info: PageInfo } {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    info: {
      page: current,
      pageCount,
      total: items.length,
      from: slice.length ? start + 1 : 0,
      to: start + slice.length,
    },
  };
}

/** Distinct classes and customers across the whole shop, for the filter menus. */
export function identityFacets(rows: EquipmentIdentityRow[]): {
  classes: Array<[string, string]>;
  customers: Array<[string, string]>;
} {
  const classes = new Map<string, string>();
  const customers = new Map<string, string>();
  for (const row of rows) {
    classes.set(row.equipmentClass, row.equipmentClassLabel);
    if (row.customerId && row.customerName) customers.set(row.customerId, row.customerName);
  }
  const byLabel = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1]);
  return {
    classes: Array.from(classes).sort(byLabel),
    customers: Array.from(customers).sort(byLabel),
  };
}

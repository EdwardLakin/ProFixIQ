import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import type {
  OperationsAsset,
  OperationsAssignment,
  OperationsIssue,
  OperationsIssueSeverity,
  OperationsIssueStatus,
} from "@/features/operations";
import type {
  OperationsAssetMetadataItem,
  OperationsAssetStat,
} from "@/features/operations/components/OperationsAssetDetailScreen";

type PropertyTable<Row> = {
  Row: Row;
  Insert: never;
  Update: never;
  Relationships: [];
};

type PropertyOperationsDatabase = {
  public: {
    Tables: {
      property_properties: PropertyTable<PropertyPropertyRow>;
      property_units: PropertyTable<PropertyUnitRow>;
      property_assets: PropertyTable<PropertyAssetRow>;
      property_maintenance_requests: PropertyTable<PropertyMaintenanceRequestRow>;
      property_vendor_assignments: PropertyTable<PropertyVendorAssignmentRow>;
      property_vendors: PropertyTable<PropertyVendorRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type PropertyPropertyRow = {
  id: string;
  name: string;
  property_type: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  status: string;
  created_at: string;
};

type PropertyUnitRow = {
  id: string;
  property_id: string;
  unit_label: string;
  unit_type: string | null;
  occupancy_status: string | null;
  status: string;
  created_at: string;
};

type PropertyAssetRow = {
  id: string;
  property_id: string;
  unit_id: string | null;
  name: string;
  asset_type: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  install_date: string | null;
  warranty_expires_on: string | null;
  location_note: string | null;
  status: string;
  next_service_date: string | null;
  created_at: string;
};

type PropertyMaintenanceRequestRow = {
  id: string;
  property_id: string;
  unit_id: string | null;
  asset_id: string | null;
  requester_profile_id: string | null;
  title: string;
  summary: string;
  category: string | null;
  severity: string;
  status: string;
  preferred_window: string | null;
  created_at: string;
};

type PropertyVendorAssignmentRow = {
  id: string;
  request_id: string | null;
  vendor_id: string;
  status: string;
  scheduled_for: string | null;
  notes: string | null;
  created_at: string;
};

type PropertyVendorRow = {
  id: string;
  name: string;
  trade: string | null;
  contact_name: string | null;
  status: string;
};

export type PropertyOperationsDashboardData = {
  assets: OperationsAsset[];
  issues: OperationsIssue[];
  assignments: OperationsAssignment[];
};

export type PropertyAssetDetailData = {
  asset: OperationsAsset | null;
  metadata: OperationsAssetMetadataItem[];
  issues: OperationsIssue[];
  stats: OperationsAssetStat[];
  assignments: OperationsAssignment[];
};

type PropertyQueryRows = {
  properties: PropertyPropertyRow[];
  units: PropertyUnitRow[];
  assets: PropertyAssetRow[];
  requests: PropertyMaintenanceRequestRow[];
  vendorAssignments: PropertyVendorAssignmentRow[];
  vendors: PropertyVendorRow[];
};

type AssetLookupEntry = {
  asset: OperationsAsset;
  property?: PropertyPropertyRow;
  unit?: PropertyUnitRow;
  rawAsset?: PropertyAssetRow;
};

function createPropertySupabaseClient() {
  return createServerSupabaseRSC() as unknown as SupabaseClient<PropertyOperationsDatabase>;
}

export async function getPropertyOperationsDashboardData(): Promise<PropertyOperationsDashboardData> {
  const rows = await getPropertyRows();
  const { assets, lookup } = mapOperationsAssets(rows);

  return {
    assets,
    issues: mapOperationsIssues(rows.requests, lookup),
    assignments: mapOperationsAssignments(
      rows.vendorAssignments,
      rows.vendors,
      rows.requests,
      lookup,
    ),
  };
}

export async function getPropertyAssetDetailData(
  assetId: string,
): Promise<PropertyAssetDetailData> {
  const rows = await getPropertyRows();
  const { lookup } = mapOperationsAssets(rows);
  const entry = lookup.get(assetId);

  if (!entry) {
    return {
      asset: null,
      metadata: [],
      issues: [],
      stats: [],
      assignments: [],
    };
  }

  const requests = rows.requests.filter(
    (request) =>
      request.asset_id === assetId ||
      request.unit_id === assetId ||
      request.property_id === assetId ||
      (entry.rawAsset && request.asset_id === entry.rawAsset.id) ||
      (entry.unit && request.unit_id === entry.unit.id) ||
      (entry.property && request.property_id === entry.property.id),
  );
  const requestIds = new Set(requests.map((request) => request.id));
  const vendorAssignments = rows.vendorAssignments.filter(
    (assignment) =>
      assignment.request_id && requestIds.has(assignment.request_id),
  );
  const issues = mapOperationsIssues(requests, lookup);

  return {
    asset: entry.asset,
    metadata: buildAssetMetadata(entry),
    issues,
    stats: buildAssetStats(requests),
    assignments: mapOperationsAssignments(
      vendorAssignments,
      rows.vendors,
      rows.requests,
      lookup,
    ),
  };
}

async function getPropertyRows(): Promise<PropertyQueryRows> {
  const supabase = createPropertySupabaseClient();

  const [properties, units, assets, requests, vendorAssignments, vendors] =
    await Promise.all([
      supabase
        .from("property_properties")
        .select(
          "id,name,property_type,address_line1,address_line2,city,region,postal_code,country,status,created_at",
        )
        .order("name", { ascending: true }),
      supabase
        .from("property_units")
        .select(
          "id,property_id,unit_label,unit_type,occupancy_status,status,created_at",
        )
        .order("unit_label", { ascending: true }),
      supabase
        .from("property_assets")
        .select(
          "id,property_id,unit_id,name,asset_type,manufacturer,model,serial_number,install_date,warranty_expires_on,location_note,status,next_service_date,created_at",
        )
        .order("name", { ascending: true }),
      supabase
        .from("property_maintenance_requests")
        .select(
          "id,property_id,unit_id,asset_id,requester_profile_id,title,summary,category,severity,status,preferred_window,created_at",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("property_vendor_assignments")
        .select("id,request_id,vendor_id,status,scheduled_for,notes,created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("property_vendors")
        .select("id,name,trade,contact_name,status")
        .order("name", { ascending: true }),
    ]);

  logPropertyQueryError("property_properties", properties.error);
  logPropertyQueryError("property_units", units.error);
  logPropertyQueryError("property_assets", assets.error);
  logPropertyQueryError("property_maintenance_requests", requests.error);
  logPropertyQueryError("property_vendor_assignments", vendorAssignments.error);
  logPropertyQueryError("property_vendors", vendors.error);

  return {
    properties: properties.data ?? [],
    units: units.data ?? [],
    assets: assets.data ?? [],
    requests: requests.data ?? [],
    vendorAssignments: vendorAssignments.data ?? [],
    vendors: vendors.data ?? [],
  };
}

function mapOperationsAssets(rows: PropertyQueryRows) {
  const propertiesById = new Map(
    rows.properties.map((property) => [property.id, property]),
  );
  const unitsById = new Map(rows.units.map((unit) => [unit.id, unit]));
  const assets: OperationsAsset[] = [];
  const lookup = new Map<string, AssetLookupEntry>();

  for (const property of rows.properties) {
    const asset: OperationsAsset = {
      id: property.id,
      label: property.name,
      identifier: property.property_type,
      secondaryIdentifier: formatAddress(property),
      class: property.property_type ?? "Property",
      location: formatLocation(property),
      status: mapAssetStatus(property.status),
    };
    assets.push(asset);
    lookup.set(property.id, { asset, property });
  }

  for (const unit of rows.units) {
    const property = propertiesById.get(unit.property_id);
    const asset: OperationsAsset = {
      id: unit.id,
      label: property
        ? `${property.name} — ${unit.unit_label}`
        : unit.unit_label,
      identifier: unit.unit_label,
      secondaryIdentifier: unit.occupancy_status,
      class: unit.unit_type ?? "Unit",
      location: property ? formatLocation(property) : null,
      status: mapAssetStatus(unit.status),
    };
    assets.push(asset);
    lookup.set(unit.id, { asset, property, unit });
  }

  for (const propertyAsset of rows.assets) {
    const property = propertiesById.get(propertyAsset.property_id);
    const unit = propertyAsset.unit_id
      ? unitsById.get(propertyAsset.unit_id)
      : undefined;
    const asset: OperationsAsset = {
      id: propertyAsset.id,
      label: buildPropertyAssetLabel(propertyAsset, property, unit),
      identifier: propertyAsset.serial_number ?? propertyAsset.model,
      secondaryIdentifier:
        propertyAsset.location_note ?? unit?.unit_label ?? null,
      class: propertyAsset.asset_type ?? "Property Asset",
      location: property ? formatLocation(property) : null,
      status: mapAssetStatus(propertyAsset.status),
      nextInspectionDate: propertyAsset.next_service_date,
    };
    assets.push(asset);
    lookup.set(propertyAsset.id, {
      asset,
      property,
      unit,
      rawAsset: propertyAsset,
    });
  }

  return { assets, lookup };
}

function mapOperationsIssues(
  requests: PropertyMaintenanceRequestRow[],
  lookup: Map<string, AssetLookupEntry>,
): OperationsIssue[] {
  return requests.map((request) => {
    const assetEntry =
      (request.asset_id ? lookup.get(request.asset_id) : undefined) ??
      (request.unit_id ? lookup.get(request.unit_id) : undefined) ??
      lookup.get(request.property_id);

    return {
      id: request.id,
      assetId:
        assetEntry?.asset.id ??
        request.asset_id ??
        request.unit_id ??
        request.property_id,
      assetLabel: assetEntry?.asset.label ?? "Property asset",
      severity: mapIssueSeverity(request.severity),
      summary: request.summary || request.title,
      createdAt: request.created_at,
      status: mapIssueStatus(request.status),
    };
  });
}

function mapOperationsAssignments(
  assignments: PropertyVendorAssignmentRow[],
  vendors: PropertyVendorRow[],
  requests: PropertyMaintenanceRequestRow[],
  lookup: Map<string, AssetLookupEntry>,
): OperationsAssignment[] {
  const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const requestsById = new Map(
    requests.map((request) => [request.id, request]),
  );

  return assignments.map((assignment) => {
    const request = assignment.request_id
      ? requestsById.get(assignment.request_id)
      : undefined;
    const vendor = vendorsById.get(assignment.vendor_id);
    const assetEntry = request
      ? ((request.asset_id ? lookup.get(request.asset_id) : undefined) ??
        (request.unit_id ? lookup.get(request.unit_id) : undefined) ??
        lookup.get(request.property_id))
      : undefined;

    return {
      id: assignment.id,
      requesterName: request?.requester_profile_id
        ? "Property requester"
        : "Internal staff",
      requesterId: request?.requester_profile_id ?? "internal-staff",
      assetLabel: assetEntry?.asset.label ?? "Property asset",
      assetId:
        assetEntry?.asset.id ??
        request?.asset_id ??
        request?.unit_id ??
        request?.property_id ??
        assignment.id,
      routeLabel: vendor
        ? `Vendor: ${vendor.name}${vendor.trade ? ` (${vendor.trade})` : ""}`
        : "Vendor assignment",
      nextInspectionDue: assignment.scheduled_for,
      state: mapAssignmentState(assignment.status),
    };
  });
}

function buildAssetMetadata(
  entry: AssetLookupEntry,
): OperationsAssetMetadataItem[] {
  const metadata: OperationsAssetMetadataItem[] = [];

  if (entry.property) {
    metadata.push({ label: "Property", value: entry.property.name });
    metadata.push({ label: "Address", value: formatAddress(entry.property) });
  }

  if (entry.unit) {
    metadata.push({ label: "Unit", value: entry.unit.unit_label });
    metadata.push({ label: "Occupancy", value: entry.unit.occupancy_status });
  }

  if (entry.rawAsset) {
    metadata.push({ label: "Asset Type", value: entry.rawAsset.asset_type });
    metadata.push({
      label: "Manufacturer",
      value: entry.rawAsset.manufacturer,
    });
    metadata.push({ label: "Model", value: entry.rawAsset.model });
    metadata.push({
      label: "Serial",
      value: entry.rawAsset.serial_number,
      mono: true,
    });
    metadata.push({
      label: "Location Note",
      value: entry.rawAsset.location_note,
    });
    metadata.push({
      label: "Warranty Expires",
      value: entry.rawAsset.warranty_expires_on,
    });
  }

  return metadata.filter((item) => item.value);
}

function buildAssetStats(
  requests: PropertyMaintenanceRequestRow[],
): OperationsAssetStat[] {
  return [
    {
      label: "Open Requests",
      value: requests.filter(
        (request) => mapIssueStatus(request.status) === "open",
      ).length,
      helper: "Live property requests visible through RLS",
    },
    {
      label: "Pending Approvals",
      value: requests.filter(
        (request) => request.status === "approval_required",
      ).length,
      helper: "Approval-required property requests",
    },
    {
      label: "Scheduled Work",
      value: requests.filter(
        (request) => mapIssueStatus(request.status) === "scheduled",
      ).length,
      helper: "Assigned, scheduled, or in-progress requests",
    },
    {
      label: "Completed Requests",
      value: requests.filter(
        (request) => mapIssueStatus(request.status) === "completed",
      ).length,
      helper: "Completed or cancelled requests",
    },
  ];
}

function mapAssetStatus(status: string): OperationsAsset["status"] {
  const normalized = status.toLowerCase();
  if (normalized === "limited") return "limited";
  if (normalized === "offline" || normalized === "retired") return "offline";
  return "active";
}

function mapIssueSeverity(severity: string): OperationsIssueSeverity {
  const normalized = severity.toLowerCase();
  if (normalized === "emergency") return "safety";
  if (normalized === "urgent") return "urgent";
  return "recommend";
}

function mapIssueStatus(status: string): OperationsIssueStatus {
  const normalized = status.toLowerCase();
  if (normalized === "completed" || normalized === "cancelled")
    return "completed";
  if (["assigned", "scheduled", "in_progress"].includes(normalized))
    return "scheduled";
  return "open";
}

function mapAssignmentState(status: string): OperationsAssignment["state"] {
  const normalized = status.toLowerCase();
  if (["blocked", "cancelled"].includes(normalized)) return "blocked";
  if (["in_progress", "scheduled", "assigned"].includes(normalized))
    return "in_progress";
  if (normalized === "completed") return "in_service";
  return "active";
}

function buildPropertyAssetLabel(
  asset: PropertyAssetRow,
  property?: PropertyPropertyRow,
  unit?: PropertyUnitRow,
) {
  if (property && unit)
    return `${property.name} — ${unit.unit_label} — ${asset.name}`;
  if (property) return `${property.name} — ${asset.name}`;
  return asset.name;
}

function formatLocation(property: PropertyPropertyRow) {
  return (
    [property.city, property.region].filter(Boolean).join(", ") ||
    property.country
  );
}

function formatAddress(property: PropertyPropertyRow) {
  return [
    property.address_line1,
    property.address_line2,
    property.city,
    property.region,
    property.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

function logPropertyQueryError(
  table: string,
  error: { message: string } | null,
) {
  if (error) {
    console.warn(
      `Unable to load ${table} for property operations dashboard: ${error.message}`,
    );
  }
}

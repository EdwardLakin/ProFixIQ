import type {
  OperationsAsset,
  OperationsAssignment,
  OperationsIssue,
} from "@/features/operations";

export type PropertyDemoAssetMetadata = {
  address: string;
  unit: string;
  assetType: string;
  occupancy: string;
};

export type PropertyDemoAsset = OperationsAsset & {
  metadata: PropertyDemoAssetMetadata;
};

export const propertyDemoAssets: PropertyDemoAsset[] = [
  {
    id: "riverbend-duplex-unit-a",
    label: "Riverbend Duplex — Unit A",
    identifier: "RB-A",
    secondaryIdentifier: "Main floor suite",
    class: "Residential Unit",
    location: "Calgary, AB",
    status: "active",
    nextInspectionDate: "2026-07-15",
    metadata: {
      address: "142 Riverbend Dr SE, Calgary, AB",
      unit: "Unit A",
      assetType: "Residential Unit",
      occupancy: "Occupied — long-term tenant",
    },
  },
  {
    id: "oak-street-fourplex-unit-204",
    label: "Oak Street Fourplex — Unit 204",
    identifier: "OAK-204",
    secondaryIdentifier: "Upper east suite",
    class: "Residential Unit",
    location: "Calgary, AB",
    status: "limited",
    nextInspectionDate: "2026-06-10",
    metadata: {
      address: "88 Oak Street NW, Calgary, AB",
      unit: "Unit 204",
      assetType: "Residential Unit",
      occupancy: "Occupied — renewal pending",
    },
  },
  {
    id: "warehouse-bay-3",
    label: "Warehouse Bay 3",
    identifier: "WH-BAY-3",
    secondaryIdentifier: "North loading bay",
    class: "Commercial Bay",
    location: "Airdrie, AB",
    status: "offline",
    nextInspectionDate: "2026-05-29",
    metadata: {
      address: "410 Industrial Way, Airdrie, AB",
      unit: "Bay 3",
      assetType: "Warehouse Bay",
      occupancy: "Temporarily unavailable",
    },
  },
];

export const propertyDemoIssues: OperationsIssue[] = [
  {
    id: "issue-riverbend-hvac-filter",
    assetId: "riverbend-duplex-unit-a",
    assetLabel: "Riverbend Duplex — Unit A",
    severity: "recommend",
    summary: "Seasonal HVAC filter change due before summer cooling window.",
    createdAt: "2026-05-03T15:30:00.000Z",
    status: "scheduled",
  },
  {
    id: "issue-oak-sink-repeat",
    assetId: "oak-street-fourplex-unit-204",
    assetLabel: "Oak Street Fourplex — Unit 204",
    severity: "urgent",
    summary: "Kitchen sink leak reported twice in 60 days.",
    createdAt: "2026-05-12T18:10:00.000Z",
    status: "open",
  },
  {
    id: "issue-warehouse-no-heat",
    assetId: "warehouse-bay-3",
    assetLabel: "Warehouse Bay 3",
    severity: "safety",
    summary: "No heat reported in bay.",
    createdAt: "2026-05-14T12:45:00.000Z",
    status: "open",
  },
];

export const propertyDemoAssignments: OperationsAssignment[] = [
  {
    id: "assignment-riverbend-filter",
    requesterName: "Maya Chen",
    requesterId: "tenant-riverbend-a",
    assetLabel: "Riverbend Duplex — Unit A",
    assetId: "riverbend-duplex-unit-a",
    routeLabel: "Vendor: Comfort Mechanical",
    nextInspectionDue: "2026-07-15",
    state: "in_progress",
  },
  {
    id: "assignment-oak-plumbing",
    requesterName: "Jordan Reed",
    requesterId: "tenant-oak-204",
    assetLabel: "Oak Street Fourplex — Unit 204",
    assetId: "oak-street-fourplex-unit-204",
    routeLabel: "Vendor: Northside Plumbing",
    nextInspectionDue: "2026-06-10",
    state: "blocked",
  },
  {
    id: "assignment-warehouse-heat",
    requesterName: "Site Supervisor",
    requesterId: "contact-warehouse-bay-3",
    assetLabel: "Warehouse Bay 3",
    assetId: "warehouse-bay-3",
    routeLabel: "Vendor: Prairie Heating",
    nextInspectionDue: "2026-05-29",
    state: "inspection_due",
  },
];

export function getPropertyDemoAssetById(id: string) {
  return propertyDemoAssets.find((asset) => asset.id === id) ?? null;
}

export function getPropertyDemoIssuesForAsset(assetId: string) {
  return propertyDemoIssues.filter((issue) => issue.assetId === assetId);
}

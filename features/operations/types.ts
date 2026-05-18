export type OperationsVertical =
  | "shop"
  | "fleet"
  | "property"
  | "equipment"
  | "facilities";

export type OperationsTerminology = {
  vertical: OperationsVertical;
  productLabel: string;
  portalLabel: string;
  assetLabel: string;
  assetPluralLabel: string;
  requestLabel: string;
  requestPluralLabel: string;
  requesterLabel: string;
  inspectionLabel: string;
  inspectionPluralLabel: string;
  approvalLabel: string;
  vendorLabel: string;
  workOrderLabel: string;
};

export type OperationsRoutes = {
  portalHome: string;
  portalRequests: string;
  portalInspections: string;
  assetDetailBase?: string;
  workOrders?: string;
};

export type OperationsVerticalConfig = {
  vertical: OperationsVertical;
  terminology: OperationsTerminology;
  routes: OperationsRoutes;
};


export type OperationsAssetStatus = "active" | "limited" | "offline";

export type OperationsAsset = {
  id: string;
  label: string;
  identifier?: string | null;
  secondaryIdentifier?: string | null;
  class?: string | null;
  location?: string | null;
  status: OperationsAssetStatus;
  nextInspectionDate?: string | null;
};

export type OperationsIssueSeverity = "safety" | "compliance" | "recommend" | "urgent";

export type OperationsIssueStatus = "open" | "scheduled" | "completed";

export type OperationsIssue = {
  id: string;
  assetId: string;
  assetLabel: string;
  severity: OperationsIssueSeverity;
  summary: string;
  createdAt: string;
  status: OperationsIssueStatus;
};

export type OperationsAssignment = {
  id: string;
  requesterName: string;
  requesterId: string;
  assetLabel: string;
  assetId: string;
  routeLabel?: string | null;
  nextInspectionDue?: string | null;
  state: "inspection_due" | "active" | "in_service" | "in_progress" | "blocked";
};

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

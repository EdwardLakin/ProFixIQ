import type { OperationsTerminology } from "./types";

export const fleetOperationsTerminology = {
  vertical: "fleet",
  productLabel: "Fleet Operations",
  portalLabel: "Fleet Portal",
  assetLabel: "Unit",
  assetPluralLabel: "Units",
  requestLabel: "Service Request",
  requestPluralLabel: "Service Requests",
  requesterLabel: "Driver",
  inspectionLabel: "Pre-trip",
  inspectionPluralLabel: "Pre-trip History",
  approvalLabel: "Fleet Approval",
  vendorLabel: "Shop",
  workOrderLabel: "Work Order",
} satisfies OperationsTerminology;

export const propertyOperationsTerminology = {
  vertical: "property",
  productLabel: "Property Maintenance",
  portalLabel: "Property Portal",
  assetLabel: "Property / Unit",
  assetPluralLabel: "Properties / Units",
  requestLabel: "Maintenance Request",
  requestPluralLabel: "Maintenance Requests",
  requesterLabel: "Tenant",
  inspectionLabel: "Inspection",
  inspectionPluralLabel: "Inspection History",
  approvalLabel: "Owner Approval",
  vendorLabel: "Vendor",
  workOrderLabel: "Work Order",
} satisfies OperationsTerminology;

import type { OperationsRoutes } from "./types";

export const fleetOperationsRoutes = {
  portalHome: "/portal/fleet",
  portalRequests: "/portal/fleet/service-requests",
  portalInspections: "/portal/fleet/pretrip-history",
  assetDetailBase: "/portal/fleet/units",
  workOrders: "/work-orders",
} satisfies OperationsRoutes;

export const propertyOperationsRoutes = {
  portalHome: "/portal/property",
  portalRequests: "/portal/property/requests",
  portalInspections: "/portal/property/inspections",
  assetDetailBase: "/portal/property/assets",
  workOrders: "/work-orders",
} satisfies OperationsRoutes;

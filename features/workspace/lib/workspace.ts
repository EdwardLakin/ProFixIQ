export type WorkspaceKind =
  | "customer_vehicle"
  | "work_order"
  | "fleet_unit"
  | "field_service";

export type WorkspaceModuleAccess = "none" | "view" | "manage";

export type WorkspaceSourceReference<SourceType extends string = string> = {
  sourceType: SourceType;
  sourceId: string;
  sourceLabel: string;
  href: string;
};

/**
 * Serializable resource identity that UI and Copilot adapters can share.
 * Authorization capabilities are intentionally excluded until the effective
 * capability resolver is backed by server/database policy.
 */
export type WorkspaceResourceContext = {
  kind: WorkspaceKind;
  shopId: string;
  resourceId: string;
  customerId?: string | null;
  vehicleId?: string | null;
  workOrderId?: string | null;
  locationId?: string | null;
};

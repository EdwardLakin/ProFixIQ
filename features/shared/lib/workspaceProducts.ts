export type WorkspaceSurface = "shop" | "field" | "fleet" | "equipment";

export type WorkspaceEntitlementsPayload = {
  packageKey: string | null;
  internalDemo: boolean;
  workspaces: Record<WorkspaceSurface, { entitled: boolean }>;
};

export type WorkspaceProductDefinition = {
  surface: WorkspaceSurface;
  label: string;
  workspaceHref: string;
  marketingHref: string;
  upgradeLabel: string;
};

export const WORKSPACE_PRODUCTS: readonly WorkspaceProductDefinition[] = [
  {
    surface: "shop",
    label: "Shop",
    workspaceHref: "/dashboard",
    marketingHref: "/repair-shop-management-software",
    upgradeLabel: "Add Shop Operations",
  },
  {
    surface: "field",
    label: "Field",
    workspaceHref: "/mobile/service",
    marketingHref: "/field-service",
    upgradeLabel: "Add Field Service",
  },
  {
    surface: "fleet",
    label: "Fleet",
    workspaceHref: "/portal/fleet",
    marketingHref: "/fleet-maintenance",
    upgradeLabel: "Add Fleet Maintenance",
  },
  {
    surface: "equipment",
    label: "Equipment",
    workspaceHref: "/equipment",
    marketingHref: "/equipment-maintenance-software",
    upgradeLabel: "Add Equipment",
  },
] as const;

export function workspaceProductHref(
  product: WorkspaceProductDefinition,
  entitled: boolean,
): string {
  return entitled ? product.workspaceHref : product.marketingHref;
}

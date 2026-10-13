import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";
import { handoffBeginHref } from "@/features/shared/lib/hostHandoff";

export type WorkspaceSurface = "shop" | "field" | "fleet" | "equipment";

export type WorkspaceEntitlementsPayload = {
  packageKey: string | null;
  internalDemo: boolean;
  workspaces: Record<
    WorkspaceSurface,
    { entitled: boolean; accessible: boolean }
  >;
};

export type WorkspaceProductDefinition = {
  surface: WorkspaceSurface;
  label: string;
  workspaceHref: string;
  marketingHref: string;
  upgradeLabel: string;
};

const PRIMARY_SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://profixiq.com";

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
  currentSurface?: WorkspaceSurface,
): string {
  const href = entitled ? product.workspaceHref : product.marketingHref;
  if (currentSurface === "fleet" && product.surface !== "fleet") {
    // Auth cookies are host-only, so entering a workspace from the Fleet host
    // goes through the session handoff; public acquisition pages do not.
    return entitled
      ? handoffBeginHref(PRIMARY_SITE_ORIGIN, FLEET_PRODUCT_ORIGIN, href)
      : `${PRIMARY_SITE_ORIGIN}${href}`;
  }
  return href;
}

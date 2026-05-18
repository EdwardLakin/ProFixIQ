import {
  fleetOperationsTerminology,
  propertyOperationsTerminology,
} from "./terminology";
import { fleetOperationsRoutes, propertyOperationsRoutes } from "./routes";
import type { OperationsVertical, OperationsVerticalConfig } from "./types";

export const operationsVerticalConfigs: Partial<
  Record<OperationsVertical, OperationsVerticalConfig>
> = {
  fleet: {
    vertical: "fleet",
    terminology: fleetOperationsTerminology,
    routes: fleetOperationsRoutes,
  },
  property: {
    vertical: "property",
    terminology: propertyOperationsTerminology,
    routes: propertyOperationsRoutes,
  },
};

export function getOperationsVerticalConfig(
  vertical: OperationsVertical,
): OperationsVerticalConfig | null {
  return operationsVerticalConfigs[vertical] ?? null;
}

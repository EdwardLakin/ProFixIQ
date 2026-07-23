import type { ShopAssistantAgentDefinition } from "../types";

export const diagnosticBoundaryAgent = {
  id: "diagnostic_boundary_agent",
  domain: "diagnostics",
  name: "Diagnostic Boundary Agent",
  description: "Keeps vehicle diagnosis in the existing work-order Technician AI rather than duplicating it shop-wide.",
  keywords: [
    "diagnose",
    "diagnosis",
    "diagnostic",
    "dtc",
    "pinout",
    "expected voltage",
    "misfire",
    "no start",
    "wiring test",
  ],
  allowedTools: [],
  stateMetrics: [],
  boundaryMessage:
    "Open the work order and use its Technician AI for diagnostic guidance. The shop-wide assistant can coordinate the work order, parts, scheduling, customer communication, billing, and workforce around that diagnosis.",
} as const satisfies ShopAssistantAgentDefinition;

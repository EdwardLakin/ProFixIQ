// src/features/integrations/ai/shopBoostTypes.ts

export type ShopHealthTopRepair = {
  label: string;
  count: number;
  revenue: number;
  averageLaborHours?: number | null;
};

export type ShopHealthComebackRisk = {
  label: string;
  count: number;
  estimatedLostHours?: number | null;
  note?: string | null;
};

export type ShopHealthFleetMetric = {
  label: string;
  value: number;
  unit?: string | null;
  note?: string | null;
};

export type ShopHealthMenuSuggestion = {
  id: string;
  name: string;
  description: string;
  targetVehicleYmm?: string | null;
  estimatedLaborHours: number;
  recommendedPrice: number;
  basedOnJobs: string[];
};

export type ShopHealthInspectionSuggestion = {
  id: string;
  name: string;
  usageContext: "retail" | "fleet" | "hd" | "mixed";
  note?: string | null;
};

export type ShopHealthSnapshot = {
  shopId: string;
  timeRangeDescription: string;
  totalRepairOrders: number;
  totalRevenue: number;
  averageRo: number;
  mostCommonRepairs: ShopHealthTopRepair[];
  highValueRepairs: ShopHealthTopRepair[];
  comebackRisks: ShopHealthComebackRisk[];
  fleetMetrics: ShopHealthFleetMetric[];
  menuSuggestions: ShopHealthMenuSuggestion[];
  inspectionSuggestions: ShopHealthInspectionSuggestion[];
  narrativeSummary: string;
};
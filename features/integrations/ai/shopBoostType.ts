// /features/integrations/ai/shopBoostType.ts

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

export type ShopHealthTopTech = {
  techId: string;
  name: string;
  role: string | null;
  jobs: number;
  revenue: number;
  clockedHours: number;
  revenuePerHour: number;
};

export type ShopHealthIssueSeverity = "low" | "medium" | "high";

export type ShopHealthIssue = {
  key: "comebacks" | "low_aro" | "bay_imbalance";
  title: string;
  severity: ShopHealthIssueSeverity;
  detail: string;
  evidence?: string | null;
};

export type ShopHealthRecommendation = {
  key:
    | "publish_menus"
    | "publish_inspections"
    | "reduce_comebacks_qc"
    | "raise_aro_packages"
    | "dispatch_balance";
  title: string;
  why: string;
  actionSteps: string[];
  expectedImpact?: string | null;
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

  // ✅ NEW
  topTechs: ShopHealthTopTech[];
  issuesDetected: ShopHealthIssue[];
  recommendations: ShopHealthRecommendation[];

  narrativeSummary: string;
};
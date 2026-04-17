export type PartSuggestionSourceType =
  | "same_vehicle_history"
  | "same_ymm_history"
  | "complaint_match"
  | "menu_repair_intelligence"
  | "inventory_candidate"
  | "receiving_or_open_po"
  | "ai_inference_only";

export type PartFitmentConfidence =
  | "confirmed_fit"
  | "likely_fit"
  | "unknown_fit"
  | "needs_review";

export type PartHistorySignal = {
  sameVehicleCount: number;
  sameYmmCount: number;
  similarComplaintCount: number;
  summary:
    | "used_on_same_vehicle"
    | "used_on_same_ymm"
    | "used_for_similar_complaint"
    | "no_prior_usage_found";
};

export type PartInventorySignal = {
  inStockQty: number | null;
  lowStock: boolean;
  reorderPoint: number | null;
};

export type PartReceivingSignal = {
  openRequestQty: number;
  pendingReceiveQty: number;
  openPoCount: number;
};

export type PartSuggestionWarningType =
  | "duplicate_on_work_order"
  | "existing_part_request"
  | "open_po_overlap"
  | "conflicting_alternative"
  | "fitment_uncertain";

export type PartSuggestionWarning = {
  type: PartSuggestionWarningType;
  message: string;
};

export type PartSuggestionEvidence = {
  id: string;
  sourceType: PartSuggestionSourceType;
  label: string;
  detail: string;
  href?: string;
  recordType?: string;
  recordId?: string;
  strength: "strong" | "moderate" | "weak";
};

export type CanonicalPartSuggestion = {
  candidateId: string;
  partId?: string | null;
  sku?: string | null;
  supplierId?: string | null;
  title: string;
  quantitySuggestion: number;
  unit: "each" | "set" | "liter" | "quart" | "kit" | "unknown";
  unitPrice?: number | null;
  sourceTypes: PartSuggestionSourceType[];
  fitmentConfidence: PartFitmentConfidence;
  historySignal: PartHistorySignal;
  inventorySignal: PartInventorySignal;
  receivingSignal: PartReceivingSignal;
  warnings: PartSuggestionWarning[];
  linkedEvidence: PartSuggestionEvidence[];
  reviewRecommendation: string;
  addable: boolean;
  requestable: boolean;
  rankScore: number;
};

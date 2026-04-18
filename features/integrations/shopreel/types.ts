export type ProFixIQStoryEventType =
  | "inspection.completed"
  | "inspection.finding.flagged"
  | "inspection.media.captured"
  | "workorder.approved"
  | "workorder.completed"
  | "media.before_after.added"
  | "operations.signal";

export type ProFixIQStoryFinding = {
  label: string;
  status?: "failed" | "recommended" | "pass" | "info";
  category?: string | null;
};

export type ProFixIQStoryService = {
  label: string;
  kind?: "repair" | "maintenance" | "inspection" | "diagnostic";
};

export type ProFixIQStoryMedia = {
  url: string;
  kind: "image" | "video";
  role?: "before" | "after" | "inspection" | "general";
  title?: string | null;
  takenAt?: string | null;
};

export type ProFixIQStoryEvent = {
  eventId: string;
  eventType: ProFixIQStoryEventType;
  occurredAt: string;
  source: {
    app: "profixiq";
    shopId: string;
    locationId?: string | null;
  };
  subject: {
    workOrderId?: string | null;
    workOrderNumber?: string | null;
    inspectionId?: string | null;
    vehicleId?: string | null;
    customerLabel?: string | null;
    vehicleLabel?: string | null;
  };
  storyData: {
    headline?: string | null;
    summary?: string | null;
    findings?: ProFixIQStoryFinding[];
    services?: ProFixIQStoryService[];
    media?: ProFixIQStoryMedia[];
    approvalStatus?: "pending" | "approved" | "declined" | "deferred" | null;
    technicianSummary?: string | null;
  };
  privacy: {
    containsSensitiveData: false;
    redactionsApplied: string[];
  };
};

export type ShopReelIntegrationRow = {
  id: string;
  shop_id: string;
  enabled: boolean;
  shopreel_base_url: string;
  remote_shop_id: string | null;
  enabled_event_types: string[];
  last_tested_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};


export type OperationalStoryCandidateKind =
  | "shop_completed_jobs_today"
  | "top_technician_today"
  | "fastest_turnaround_today"
  | "busiest_period_today"
  | "high_shop_utilization_streak"
  | "overload_recovery_throughput_improvement";

export type OperationalStoryMetricBasis = Record<string, string | number | boolean | null | undefined>;

export type OperationalStoryCandidate = {
  candidateId: string;
  candidateType: OperationalStoryCandidateKind;
  generatedAt: string;
  source: {
    app: "profixiq";
    shopId: string;
    timezone: string;
    windowStart: string;
    windowEnd: string;
  };
  summary: string;
  metricBasis: OperationalStoryMetricBasis;
  confidence: number;
  opportunityScore: number;
  tags: string[];
};

export const SHOPREEL_OPPORTUNITY_STATUSES = ["new", "accepted", "dismissed", "generated"] as const;
export type ShopReelOpportunityStatus = (typeof SHOPREEL_OPPORTUNITY_STATUSES)[number];

export const SHOPREEL_OPPORTUNITY_ACTIONS = ["accepted", "dismissed", "generated"] as const;
export type ShopReelOpportunityAction = (typeof SHOPREEL_OPPORTUNITY_ACTIONS)[number];

export const SHOPREEL_DRAFT_STATUSES = ["draft", "in_review", "approved"] as const;
export type ShopReelDraftStatus = (typeof SHOPREEL_DRAFT_STATUSES)[number];

export type ShopReelStorySourceDto = {
  id: string;
  eventKey: string;
  eventType: string;
  occurredAt: string;
  ingestedAt: string;
};

export type ShopReelOpportunityDto = {
  id: string;
  storySourceId: string;
  status: ShopReelOpportunityStatus;
  title: string;
  angle: string | null;
  summary: string | null;
  eventType: string;
  sourceOccurredAt: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  dismissedAt: string | null;
  generatedAt: string | null;
};

export type ShopReelDraftDto = {
  id: string;
  opportunityId: string;
  status: ShopReelDraftStatus;
  title: string;
  angle: string | null;
  script: string | null;
  updatedAt: string;
  reviewedAt: string | null;
};

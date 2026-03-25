export type ProFixIQStoryEventType =
  | "inspection.completed"
  | "inspection.finding.flagged"
  | "workorder.approved"
  | "workorder.completed"
  | "media.before_after.added";

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

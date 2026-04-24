import type { Json } from "@shared/types/types/supabase";
import type { AiRecommendationPriority, AiRiskTier } from "@/features/ai/server/types";

export const WORK_ORDER_RULES_VERSION = "wo_rules_v1";

export type WorkOrderEvidenceSnapshot = {
  shop_id: string;
  work_order_id: string;
  work_order_number: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  fleet_context: {
    source_fleet_program_id: string | null;
    source_fleet_service_request_id: string | null;
  };
  timestamps: {
    created_at: string | null;
    opened_at: string | null;
    updated_at: string | null;
    completed_at: string | null;
  };
  work_order_state: {
    status: string | null;
    approval_state: string | null;
    estimate_status: string | null;
    invoice_status: string | null;
    priority: number | null;
    is_waiter: boolean;
    age_hours: number | null;
    stale_hours: number | null;
    staleness_tier: "fresh" | "monitor" | "stale" | "critical";
  };
  lines: {
    total: number;
    actionable: number;
    informational: number;
    status_counts: Record<string, number>;
    approval_state_counts: Record<string, number>;
    job_priority_counts: Record<string, number>;
    assigned_technician_ids: string[];
    blocked_count: number;
    active_count: number;
    completed_count: number;
  };
  inspections: {
    exists: boolean;
    completed: boolean;
    finalize_state: string;
    missing_answer_count: number | null;
    photo_count: number | null;
    warnings: string[];
  };
  approvals: {
    required: boolean;
    sent_for_approval: boolean;
    resolved: boolean;
    status: "not_required" | "pending" | "approved" | "declined" | "unknown";
    waiting_minutes: number | null;
    metadata: Record<string, Json>;
  };
  parts: {
    requested_count: number;
    allocated_count: number;
    waiting_parts: boolean;
    fulfilled_request_count: number;
    missing_or_blocked: boolean;
  };
  labor: {
    active_punch_count: number;
    labor_segment_count: number;
    active_technician_ids: string[];
    stale_active_punch: boolean;
  };
  financials: {
    estimate_total: number | null;
    invoice_total: number | null;
    labor_total: number | null;
    parts_total: number | null;
    margin_signal: string | null;
  };
  closeout: {
    invoice_ready: boolean;
    inspection_finalized: boolean;
    lines_complete: boolean;
    approval_resolved: boolean;
    blockers: string[];
  };
  evidence_metadata: {
    source_refs: Array<Record<string, string | null>>;
    missing_data: string[];
    freshness_at: string;
    confidence: number;
    generated_at: string;
    rules_version: string;
  };
};

export type WorkOrderRecommendationDraft = {
  recommendation_type: string;
  title: string;
  summary: string;
  priority: AiRecommendationPriority;
  confidence: number;
  risk_tier: AiRiskTier;
  missing_data: string[];
  recommended_action: {
    action_type: string;
    label: string;
    details: string;
  };
  side_effects: string[];
  requires_approval: boolean;
  metadata?: Record<string, Json>;
};

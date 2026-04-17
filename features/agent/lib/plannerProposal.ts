export type PlannerProposalClassification =
  | "draft_only"
  | "confirmable_write"
  | "informational";

export type PlannerAffectedRecord = {
  type: string;
  id: string;
  href: string;
  label: string;
};

export type PlannerResultLink = {
  href: string;
  label: string;
};

export type PlannerExecutionResult = {
  status: "success" | "failed" | "partial";
  summary: string;
  changed_records: PlannerAffectedRecord[];
  result_links: PlannerResultLink[];
  failures: string[];
  audit_ref?: string;
  applied_at?: string;
};

export type PlannerExecutionPayload = {
  lane: string;
  action: string;
  data: Record<string, unknown>;
};

export type PlannerProposal = {
  id: string;
  lane: string;
  classification: PlannerProposalClassification;
  title: string;
  summary: string;
  proposed_steps: string[];
  affected_records: PlannerAffectedRecord[];
  warnings: string[];
  review_actions: string[];
  duplicate_candidates: string[];
  source_rationale: string[];
  confirmation_required: boolean;
  execution_available: boolean;
  execution_label: string;
  not_executable_reason?: string;
  result_summary?: string;
  result_links: PlannerResultLink[];
  audit: {
    run_id?: string;
    event_step?: number;
    generated_at: string;
  };
  execution_payload?: PlannerExecutionPayload;
  execution_result?: PlannerExecutionResult;
};

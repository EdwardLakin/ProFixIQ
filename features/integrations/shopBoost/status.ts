import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { MigrationStory } from "@/features/integrations/shopBoost/migrationStory";

type DB = Database;

type IntakeRow = DB["public"]["Tables"]["shop_boost_intakes"]["Row"];

export type IntakeDomainSummary = {
  status: "success" | "warning" | "failed";
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  note?: string | null;
};

export type IntakeProgressState = {
  currentStep: string;
  progressPercent: number;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  lastError?: string | null;
  domainSummaries?: Record<string, IntakeDomainSummary>;
  resultSummary?: Record<string, unknown>;
  total_rows?: number;
  processed_rows?: number;
  success_count?: number;
  review_count?: number;
  failed_count?: number;
  domains?: Record<string, { success: number; review: number; failed: number }>;
  ignored_count?: number;
  integrity?: Record<string, unknown>;
  completionState?:
    | "COMPLETED_CLEAN"
    | "COMPLETED_WITH_REVIEW"
    | "COMPLETED_WITH_WARNINGS"
    | "PARTIAL_FAILURE"
    | "FAILED"
    | "READY_FOR_GO_LIVE"
    | "NOT_READY";
  migration_story?: MigrationStory;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMigrationStory(value: unknown): value is MigrationStory {
  return isRecord(value);
}

function readIntakeBasics(row: IntakeRow | null): Record<string, unknown> {
  if (!row || !isRecord(row.intake_basics)) return {};
  return row.intake_basics;
}

export function toIntakeProgress(row: IntakeRow | null): IntakeProgressState | null {
  if (!row) return null;
  const basics = readIntakeBasics(row);
  const migration = isRecord(basics.migrationProgress) ? basics.migrationProgress : {};
  const migrationResult = isRecord(migration.resultSummary) ? migration.resultSummary : {};
  const importSummary = isRecord(basics.importSummary) ? basics.importSummary : {};
  const rowResults =
    (isRecord(migrationResult.rowResults) ? migrationResult.rowResults : null) ??
    (isRecord(importSummary.rowResults) ? importSummary.rowResults : {});
  return {
    currentStep: typeof migration.currentStep === "string" ? migration.currentStep : "queued",
    progressPercent: typeof migration.progressPercent === "number" ? migration.progressPercent : 0,
    startedAt: typeof migration.startedAt === "string" ? migration.startedAt : undefined,
    completedAt: typeof migration.completedAt === "string" ? migration.completedAt : undefined,
    failedAt: typeof migration.failedAt === "string" ? migration.failedAt : undefined,
    lastError: typeof migration.lastError === "string" ? migration.lastError : null,
    domainSummaries: isRecord(migration.domainSummaries)
      ? (migration.domainSummaries as Record<string, IntakeDomainSummary>)
      : undefined,
    resultSummary: isRecord(migration.resultSummary)
      ? (migration.resultSummary as Record<string, unknown>)
      : undefined,
    total_rows:
      typeof migration.total_rows === "number"
        ? migration.total_rows
        : typeof rowResults.totalRows === "number"
          ? rowResults.totalRows
          : undefined,
    processed_rows:
      typeof migration.processed_rows === "number"
        ? migration.processed_rows
        : typeof rowResults.processedRows === "number"
          ? rowResults.processedRows
          : undefined,
    success_count:
      typeof migration.success_count === "number"
        ? migration.success_count
        : typeof rowResults.successCount === "number"
          ? rowResults.successCount
          : undefined,
    review_count:
      typeof migration.review_count === "number"
        ? migration.review_count
        : typeof rowResults.reviewCount === "number"
          ? rowResults.reviewCount
          : undefined,
    failed_count:
      typeof migration.failed_count === "number"
        ? migration.failed_count
        : typeof rowResults.failedCount === "number"
          ? rowResults.failedCount
          : undefined,
    ignored_count:
      typeof migration.ignored_count === "number"
        ? migration.ignored_count
        : typeof rowResults.ignoredCount === "number"
          ? rowResults.ignoredCount
          : undefined,
    integrity: isRecord(migration.integrity) ? (migration.integrity as Record<string, unknown>) : undefined,
    domains: isRecord(migration.domains)
      ? (migration.domains as Record<string, { success: number; review: number; failed: number }>)
      : undefined,
    completionState:
      migration.completionState === "COMPLETED_CLEAN" ||
      migration.completionState === "COMPLETED_WITH_REVIEW" ||
      migration.completionState === "COMPLETED_WITH_WARNINGS" ||
      migration.completionState === "PARTIAL_FAILURE" ||
      migration.completionState === "FAILED" ||
      migration.completionState === "READY_FOR_GO_LIVE" ||
      migration.completionState === "NOT_READY"
        ? migration.completionState
        : migrationResult.completionState === "COMPLETED_CLEAN" ||
            migrationResult.completionState === "COMPLETED_WITH_REVIEW" ||
            migrationResult.completionState === "COMPLETED_WITH_WARNINGS" ||
            migrationResult.completionState === "PARTIAL_FAILURE" ||
            migrationResult.completionState === "FAILED" ||
            migrationResult.completionState === "READY_FOR_GO_LIVE" ||
            migrationResult.completionState === "NOT_READY"
          ? migrationResult.completionState
        : importSummary.completionState === "COMPLETED_CLEAN" ||
            importSummary.completionState === "COMPLETED_WITH_REVIEW" ||
            importSummary.completionState === "COMPLETED_WITH_WARNINGS" ||
            importSummary.completionState === "PARTIAL_FAILURE" ||
            importSummary.completionState === "FAILED" ||
            importSummary.completionState === "READY_FOR_GO_LIVE" ||
            importSummary.completionState === "NOT_READY"
          ? importSummary.completionState
        : undefined,
    migration_story: isMigrationStory(basics.migration_story)
      ? basics.migration_story
      : isMigrationStory(migration.migration_story)
        ? migration.migration_story
        : undefined,
  };
}

export async function updateIntakeProgress(args: {
  intakeId: string;
  status?: string;
  currentStep?: string;
  progressPercent?: number;
  patch?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("shop_boost_intakes")
    .select("intake_basics")
    .eq("id", args.intakeId)
    .maybeSingle<{ intake_basics: unknown }>();

  const basics = isRecord(data?.intake_basics) ? data.intake_basics : {};
  const existingProgress = isRecord(basics.migrationProgress) ? basics.migrationProgress : {};

  const nextProgress: Record<string, unknown> = {
    ...existingProgress,
    ...(args.currentStep ? { currentStep: args.currentStep } : {}),
    ...(typeof args.progressPercent === "number"
      ? { progressPercent: Math.max(0, Math.min(100, Math.round(args.progressPercent))) }
      : {}),
    ...(args.patch ?? {}),
  };

  const updatePayload: DB["public"]["Tables"]["shop_boost_intakes"]["Update"] = {
    intake_basics: ({
      ...basics,
      migrationProgress: nextProgress,
    } as unknown) as DB["public"]["Tables"]["shop_boost_intakes"]["Update"]["intake_basics"],
  };

  if (args.status) updatePayload.status = args.status;

  await supabase.from("shop_boost_intakes").update(updatePayload).eq("id", args.intakeId);
}

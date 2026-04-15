import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

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
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readIntakeBasics(row: IntakeRow | null): Record<string, unknown> {
  if (!row || !isRecord(row.intake_basics)) return {};
  return row.intake_basics;
}

export function toIntakeProgress(row: IntakeRow | null): IntakeProgressState | null {
  if (!row) return null;
  const basics = readIntakeBasics(row);
  const migration = isRecord(basics.migrationProgress) ? basics.migrationProgress : {};
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

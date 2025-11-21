import type { DbClient } from "./aiUsage"
import { logAiUsage } from "./aiUsage"

/**
 * Work-order specific AI usage wrappers.
 * These are thin helpers that:
 *  - tag the AI usage with a consistent feature slug
 *  - (optionally) let you add cross-cutting behavior later (like
 *    emitting events, firing webhooks, etc.)
 */

/**
 * Call this whenever you generate an AI summary for a work order.
 * Example usage from your UI/API:
 *   await logWorkOrderAiSummaryGenerated(db, { workOrderId, userId })
 */
export async function logWorkOrderAiSummaryGenerated(
  db: DbClient,
  params: {
    workOrderId: string
    userId?: string | null
  },
): Promise<void> {
  await logAiUsage(db, {
    feature: "work_order_summarize",
    userId: params.userId,
  })
}

/**
 * Call this whenever AI suggests repairs / lines for a work order.
 */
export async function logWorkOrderAiSuggestionsUsed(
  db: DbClient,
  params: {
    workOrderId: string
    userId?: string | null
  },
): Promise<void> {
  await logAiUsage(db, {
    feature: "work_order_suggest_repairs",
    userId: params.userId,
  })
}

/**
 * Simple "experience" / "proficiency" style stats for a user based
 * solely on existing `work_order_lines` data.
 *
 * This does NOT change data — it's a read-only helper that the AI
 * backend can use when personalizing responses.
 */
export type WorkOrderLineStatusSummary = {
  status: string | null
  count: number
}

export type UserWorkOrderStats = {
  userId: string
  totalLines: number
  byStatus: WorkOrderLineStatusSummary[]
}

/**
 * Compute basic stats for how many work_order_lines a given user has touched
 * and how they are distributed by `status`.
 *
 * You can feed this into prompts, or later persist "snapshots" somewhere
 * if you want long-term trend tracking.
 */
export async function getUserWorkOrderStats(
  db: DbClient,
  userId: string,
): Promise<UserWorkOrderStats> {
  const { data, error } = await db
    .from("work_order_lines")
    .select("status")
    .eq("user_id", userId)

  if (error) {
    console.error("[ai.workOrders] Failed to fetch work_order_lines:", error)
    return {
      userId,
      totalLines: 0,
      byStatus: [],
    }
  }

  const counts = new Map<string, number>()

  for (const row of data) {
    const key = row.status ?? "null"
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const byStatus: WorkOrderLineStatusSummary[] = Array.from(counts.entries()).map(
    ([status, count]) => ({
      status: status === "null" ? null : status,
      count,
    }),
  )

  return {
    userId,
    totalLines: data.length,
    byStatus,
  }
}
